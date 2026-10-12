/**
 * Applies a note's text colors (coloredRanges, offsets into the Markdown
 * source) to the rendered tree.
 *
 * Wrapping the source text in `<span style>` before parsing doesn't work:
 * inside code spans and code blocks HTML isn't parsed and entities aren't
 * decoded, so the tags and `&lt;` showed up literally, and a range across
 * paragraphs split the span. Instead this runs on the hast tree, where every
 * text node still knows (directly, or through its nearest positioned
 * ancestor) which part of the source it came from, and wraps only the
 * characters inside a range.
 *
 * Must run before rehype-raw: after it, positions no longer line up with the
 * note's source. Text inside raw HTML is still a `raw` node at that point
 * and is left uncolored.
 */
import type { ColoredRange } from './storage';
import TextColorUtils from './textColorUtils';
import { isSafeCssColor } from './markdownSafety';

interface Position {
  start?: { offset?: number };
  end?: { offset?: number };
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  position?: Position;
}

interface Span {
  start: number;
  end: number;
}

interface Options {
  source: string;
  ranges?: ColoredRange[];
}

// remark-math output: KaTeX replaces these, so coloring inside them is moot
const MATH_CLASSES = new Set(['math-inline', 'math-display']);

function spanOf(node: HastNode): Span | null {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  return typeof start === 'number' && typeof end === 'number' && start <= end
    ? { start, end }
    : null;
}

/**
 * Source offset of each character of `value`, or -1 where it can't be
 * placed. `own` is true when `span` is the text node's own source; else it
 * is an ancestor's (a code block, whose source also holds the fences).
 */
function sourceOffsets(value: string, source: string, span: Span, own: boolean): number[] {
  const slice = source.slice(span.start, span.end);
  // The common case: the value appears verbatim. For an ancestor's span
  // search from the end, so a fenced block's info string can't match first.
  const at = own ? (slice.startsWith(value) ? 0 : -1) : slice.lastIndexOf(value);
  if (at !== -1) {
    return Array.from({ length: value.length }, (_, i) => span.start + at + i);
  }
  // Escapes, entities, stripped indentation: match characters in order.
  const offsets: number[] = [];
  let from = span.start;
  for (const ch of value) {
    // a surrogate pair is two UTF-16 units, as are the offsets
    const found = source.indexOf(ch, from);
    if (found === -1 || found + ch.length > span.end) {
      for (let i = 0; i < ch.length; i++) offsets.push(-1);
      continue;
    }
    for (let i = 0; i < ch.length; i++) offsets.push(found + i);
    from = found + ch.length;
  }
  return offsets;
}

export function rehypeColorRanges({ source, ranges }: Options) {
  // Clamped, non-overlapping, safe colors only (ranges may come from sync or import).
  const colorAt: Array<string | null> = new Array(source.length).fill(null);
  let offset = 0;
  for (const segment of TextColorUtils.renderWithColors(source, ranges ?? [])) {
    if (segment.color && isSafeCssColor(segment.color)) {
      colorAt.fill(segment.color.trim(), offset, offset + segment.text.length);
    }
    offset += segment.text.length;
  }

  const colorText = (node: HastNode, inherited: Span | null): HastNode[] => {
    const value = node.value ?? '';
    const own = spanOf(node);
    const span = own ?? inherited;
    if (!span || !value) return [node];
    const offsets = sourceOffsets(value, source, span, own !== null);

    const pieces: HastNode[] = [];
    let runStart = 0;
    for (let i = 1; i <= value.length; i++) {
      const color = (j: number) => (offsets[j] >= 0 ? colorAt[offsets[j]] : null);
      if (i < value.length && color(i) === color(runStart)) continue;
      const text: HastNode = { type: 'text', value: value.slice(runStart, i) };
      const runColor = color(runStart);
      pieces.push(
        runColor
          ? {
              type: 'element',
              tagName: 'span',
              properties: { style: `color: ${runColor}` },
              children: [text],
            }
          : text,
      );
      runStart = i;
    }
    return pieces.length === 1 && pieces[0].type === 'text' ? [node] : pieces;
  };

  const walk = (node: HastNode, inherited: Span | null): void => {
    if (!node.children) return;
    const className = node.properties?.className;
    if (Array.isArray(className) && className.some((c) => MATH_CLASSES.has(String(c)))) return;
    const span = spanOf(node) ?? inherited;
    node.children = node.children.flatMap((child) => {
      if (child.type === 'text') return colorText(child, span);
      walk(child, span);
      return [child];
    });
  };

  return (tree: HastNode) => {
    if (colorAt.some((c) => c !== null)) walk(tree, null);
  };
}

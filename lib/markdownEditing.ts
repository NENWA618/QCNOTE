/**
 * 编辑器里的 Markdown 辅助：加粗/斜体/链接、列表续写、缩进、`[[` 双链补全。
 *
 * 这里全是纯函数：输入「文本 + 选区」，输出一个 `TextEdit`（替换哪一段、换成什么、
 * 编辑后选区在哪），由编辑器去应用。这样做有两个好处：
 * - 可以脱离 DOM 单测；
 * - 编辑器用 `execCommand('insertText')` 应用，浏览器原生的撤销栈（Ctrl+Z）不会被打断。
 *
 * 所有下标都是 JS 字符串下标（UTF-16），与 textarea 的 selectionStart/End 一致。
 */

export interface TextEdit {
  /** 被替换区间 [from, to)，以编辑前的文本为准 */
  from: number;
  to: number;
  insert: string;
  /** 编辑后的选区，以编辑后的文本为准 */
  selectionStart: number;
  selectionEnd: number;
}

/** 缩进单位：两个空格，与大多数 Markdown 编辑器一致 */
export const INDENT_UNIT = '  ';

export function applyEdit(value: string, edit: TextEdit): string {
  return value.slice(0, edit.from) + edit.insert + value.slice(edit.to);
}

const lineStartOf = (value: string, pos: number) => value.lastIndexOf('\n', pos - 1) + 1;

const lineEndOf = (value: string, pos: number) => {
  const i = value.indexOf('\n', pos);
  return i === -1 ? value.length : i;
};

/** pos 之前有奇数个 ``` 围栏行，说明光标在代码块里 */
export function isInsideCodeFence(value: string, pos: number): boolean {
  const before = value.slice(0, lineStartOf(value, pos));
  const fences = before.match(/^[ \t]*(```|~~~)/gm);
  return (fences?.length ?? 0) % 2 === 1;
}

// ---------------------------------------------------------------------------
// 行内包裹：加粗 / 斜体 / 删除线 / 行内代码 / 高亮
// ---------------------------------------------------------------------------

function runLength(value: string, from: number, step: 1 | -1, char: string): number {
  let n = 0;
  for (let i = step === 1 ? from : from - 1; i >= 0 && i < value.length; i += step) {
    if (value[i] !== char) break;
    n++;
  }
  return n;
}

/**
 * `start..end` 外侧是否已经有这个标记。
 * `*` 要单独处理：`**粗体**` 外侧也有 `*`，但那是加粗而不是斜体，所以只有连续的 `*` 为奇数个才算斜体；
 * `**` 则要求至少两个。
 */
function hasOuterWrap(value: string, start: number, end: number, marker: string): boolean {
  if (marker === '*' || marker === '**') {
    const before = runLength(value, start, -1, '*');
    const after = runLength(value, end, 1, '*');
    const run = Math.min(before, after);
    return marker === '*' ? run % 2 === 1 && before % 2 === 1 && after % 2 === 1 : run >= 2;
  }
  return (
    value.slice(Math.max(0, start - marker.length), start) === marker &&
    value.slice(end, end + marker.length) === marker
  );
}

/**
 * 给选区加/去掉成对标记。
 * - 选区外侧已有标记，或选区本身以标记开头结尾：去掉；
 * - 否则加上。选区两端的空白会先挪到标记外面（`** 文字 **` 不会被渲染成加粗）；
 * - 没有选区：在光标处放一对标记，光标落在中间（有 placeholder 时选中占位文字）。
 */
export function toggleWrap(
  value: string,
  selStart: number,
  selEnd: number,
  marker: string,
  placeholder = '',
): TextEdit {
  let start = selStart;
  let end = selEnd;
  while (start < end && /\s/.test(value[start])) start++;
  while (end > start && /\s/.test(value[end - 1])) end--;
  if (start === end) {
    start = selStart;
    end = selStart;
  }
  const m = marker.length;

  if (hasOuterWrap(value, start, end, marker)) {
    return {
      from: start - m,
      to: end + m,
      insert: value.slice(start, end),
      selectionStart: start - m,
      selectionEnd: end - m,
    };
  }

  const selected = value.slice(start, end);
  const innerWrapped =
    selected.length >= m * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    // `*` 的内层判断同样要避开 `**`
    !(marker === '*' && (selected.startsWith('**') || selected.endsWith('**')));
  if (innerWrapped) {
    const inner = selected.slice(m, selected.length - m);
    return {
      from: start,
      to: end,
      insert: inner,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  if (start === end) {
    const body = placeholder;
    return {
      from: start,
      to: end,
      insert: marker + body + marker,
      selectionStart: start + m,
      selectionEnd: start + m + body.length,
    };
  }

  return {
    from: start,
    to: end,
    insert: marker + selected + marker,
    selectionStart: start + m,
    selectionEnd: start + m + selected.length,
  };
}

/** 插入链接：选中文字 → `[文字](url)` 并选中 url；选中的是网址 → `[链接文字](网址)` 并选中占位文字 */
export function insertLink(value: string, selStart: number, selEnd: number): TextEdit {
  const selected = value.slice(selStart, selEnd);
  if (/^https?:\/\/\S+$/.test(selected)) {
    const label = '链接文字';
    return {
      from: selStart,
      to: selEnd,
      insert: `[${label}](${selected})`,
      selectionStart: selStart + 1,
      selectionEnd: selStart + 1 + label.length,
    };
  }
  const label = selected || '';
  const url = 'url';
  const insert = `[${label}](${url})`;
  if (!selected) {
    // 没选中文字：光标放进方括号里，先写链接文字
    return {
      from: selStart,
      to: selEnd,
      insert,
      selectionStart: selStart + 1,
      selectionEnd: selStart + 1,
    };
  }
  const urlStart = selStart + label.length + 3;
  return {
    from: selStart,
    to: selEnd,
    insert,
    selectionStart: urlStart,
    selectionEnd: urlStart + url.length,
  };
}

// ---------------------------------------------------------------------------
// 整行前缀：标题 / 列表 / 待办 / 引用
// ---------------------------------------------------------------------------

export type LinePrefixKind = 'bullet' | 'ordered' | 'task' | 'quote';

const TASK_RE = /^([-*+]) \[[ xX]\] /;
const BULLET_RE = /^[-*+] (?!\[[ xX]\] )/;
const ORDERED_RE = /^\d+[.)] /;
const QUOTE_RE = /^> ?/;

function hasPrefix(line: string, kind: LinePrefixKind): boolean {
  switch (kind) {
    case 'task':
      return TASK_RE.test(line);
    case 'bullet':
      return BULLET_RE.test(line);
    case 'ordered':
      return ORDERED_RE.test(line);
    case 'quote':
      return QUOTE_RE.test(line);
  }
}

/** 去掉列表类前缀（项目符号/待办/编号），不动引用 */
function stripListPrefix(line: string): string {
  return line.replace(TASK_RE, '').replace(BULLET_RE, '').replace(ORDERED_RE, '');
}

/** 选区覆盖的整行范围 [from, to)，to 不含末尾换行 */
function selectedLineRange(value: string, selStart: number, selEnd: number): [number, number] {
  const from = lineStartOf(value, selStart);
  // 选区正好止于行首（如整行选中后多带了换行）时，不把下一行算进去
  const lastPos = selEnd > selStart && value[selEnd - 1] === '\n' ? selEnd - 1 : selEnd;
  return [from, lineEndOf(value, lastPos)];
}

/**
 * 对选区覆盖的每一行切换前缀。所有非空行都已有该前缀 → 全部去掉；否则全部设为该前缀
 * （原有的其他列表前缀会被替换）。编号列表按顺序重新编号。
 */
export function toggleLinePrefix(
  value: string,
  selStart: number,
  selEnd: number,
  kind: LinePrefixKind,
): TextEdit {
  const [from, to] = selectedLineRange(value, selStart, selEnd);
  const lines = value.slice(from, to).split('\n');
  const content = lines.filter((l) => l.trim() !== '');
  const remove = content.length > 0 && content.every((l) => hasPrefix(l.trimStart(), kind));

  let counter = 0;
  const next = lines.map((line) => {
    if (line.trim() === '' && lines.length > 1) return line;
    const indent = line.match(/^\s*/)?.[0] ?? '';
    let body = line.slice(indent.length);
    if (kind === 'quote') {
      body = remove ? body.replace(QUOTE_RE, '') : QUOTE_RE.test(body) ? body : `> ${body}`;
      return indent + body;
    }
    body = stripListPrefix(body);
    if (remove) return indent + body;
    counter++;
    const marker = kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${counter}. `;
    return indent + marker + body;
  });

  const insert = next.join('\n');
  const delta = insert.length - (to - from);
  const singleCaret = selStart === selEnd;
  return {
    from,
    to,
    insert,
    // 光标：留在行尾；选区：整块选中，方便连续操作
    selectionStart: singleCaret ? Math.max(from, selEnd + delta) : from,
    selectionEnd: singleCaret ? Math.max(from, selEnd + delta) : to + delta,
  };
}

/** 标题级别循环：无 → ## → ### → 无（# 留给笔记标题，正文里很少用） */
export function cycleHeading(value: string, selStart: number): TextEdit {
  const from = lineStartOf(value, selStart);
  const to = lineEndOf(value, selStart);
  const line = value.slice(from, to);
  const match = line.match(/^(#{1,6}) /);
  const level = match ? match[1].length : 0;
  const nextLevel = level === 0 ? 2 : level >= 3 ? 0 : level + 1;
  const body = match ? line.slice(match[0].length) : line;
  const insert = (nextLevel ? '#'.repeat(nextLevel) + ' ' : '') + body;
  const caret = Math.max(from, selStart + (insert.length - line.length));
  return { from, to, insert, selectionStart: caret, selectionEnd: caret };
}

// ---------------------------------------------------------------------------
// Enter：列表 / 引用续写
// ---------------------------------------------------------------------------

const LIST_LINE_RE = /^(\s*)((?:[-*+] \[[ xX]\] )|(?:[-*+] )|(?:\d+[.)] )|(?:> ))(.*)$/;

/**
 * 在列表项 / 引用行末尾按 Enter：开始下一项（编号自动 +1，待办重置为未完成）；
 * 当前项是空的 → 取消这一级（有缩进则减一级缩进，否则去掉前缀）。
 * 返回 null 表示不处理，交给浏览器插入普通换行。
 */
export function continueList(value: string, selStart: number, selEnd: number): TextEdit | null {
  if (selStart !== selEnd) return null;
  if (isInsideCodeFence(value, selStart)) return null;

  const from = lineStartOf(value, selStart);
  const to = lineEndOf(value, selStart);
  const line = value.slice(from, to);
  const match = line.match(LIST_LINE_RE);
  if (!match) return null;

  const [, indent, marker, rest] = match;
  const markerEnd = from + indent.length + marker.length;
  // 光标在前缀里面（如行首）：就是普通换行
  if (selStart < markerEnd) return null;

  if (rest.trim() === '') {
    // 空项：只在光标位于行尾时视为“结束列表”
    if (selStart < to) return null;
    if (indent.length > 0) {
      const outdented = indent.startsWith('\t')
        ? indent.slice(1)
        : indent.slice(INDENT_UNIT.length);
      const insert = outdented + marker;
      return {
        from,
        to,
        insert,
        selectionStart: from + insert.length,
        selectionEnd: from + insert.length,
      };
    }
    return { from, to, insert: '', selectionStart: from, selectionEnd: from };
  }

  let nextMarker = marker;
  const ordered = marker.match(/^(\d+)([.)]) $/);
  if (ordered) nextMarker = `${Number(ordered[1]) + 1}${ordered[2]} `;
  else if (TASK_RE.test(marker)) nextMarker = marker.replace(/\[[ xX]\]/, '[ ]');

  const insert = `\n${indent}${nextMarker}`;
  return {
    from: selStart,
    to: selStart,
    insert,
    selectionStart: selStart + insert.length,
    selectionEnd: selStart + insert.length,
  };
}

// ---------------------------------------------------------------------------
// Tab：缩进 / 反向缩进
// ---------------------------------------------------------------------------

/**
 * Tab / Shift+Tab 缩进。只在“明确想缩进”时接管：选区跨多行，或光标所在行是列表项。
 * 其他情况返回 null，让 Tab 照常把焦点移出文本框——否则键盘用户会被困在编辑区里。
 */
export function indentSelection(
  value: string,
  selStart: number,
  selEnd: number,
  outdent: boolean,
): TextEdit | null {
  const [from, to] = selectedLineRange(value, selStart, selEnd);
  const block = value.slice(from, to);
  const multiLine = block.includes('\n');
  if (!multiLine && !LIST_LINE_RE.test(block)) return null;

  const lines = block.split('\n');
  const deltas: number[] = [];
  const next = lines.map((line) => {
    if (outdent) {
      const m = line.match(/^(\t| {1,2})/);
      if (!m) {
        deltas.push(0);
        return line;
      }
      deltas.push(-m[0].length);
      return line.slice(m[0].length);
    }
    if (line.trim() === '') {
      deltas.push(0);
      return line;
    }
    deltas.push(INDENT_UNIT.length);
    return INDENT_UNIT + line;
  });
  if (deltas.every((d) => d === 0)) return null;

  const total = deltas.reduce((a, b) => a + b, 0);
  const firstDelta = deltas[0];
  return {
    from,
    to,
    insert: next.join('\n'),
    // 选区从行首开始时，起点留在行首，让新增的缩进也在选区内（连续按 Tab 更稳定）
    selectionStart: selStart === from ? from : Math.max(from, selStart + firstDelta),
    selectionEnd: Math.max(from, selEnd + total),
  };
}

// ---------------------------------------------------------------------------
// [[ 双链补全
// ---------------------------------------------------------------------------

export interface WikiLinkTrigger {
  /** `[[` 的起始下标 */
  start: number;
  /** `[[` 之后、光标之前已输入的文字 */
  query: string;
}

const MAX_WIKI_QUERY = 80;

/** 光标是否正在一个未闭合的 `[[…` 里（同一行内，中间没有 `]`） */
export function findWikiLinkTrigger(value: string, caret: number): WikiLinkTrigger | null {
  const floor = Math.max(lineStartOf(value, caret), caret - MAX_WIKI_QUERY - 2);
  for (let i = caret - 1; i >= floor; i--) {
    const ch = value[i];
    if (ch === ']' || ch === '\n') return null;
    if (ch === '[') {
      if (i > 0 && value[i - 1] === '[') {
        const query = value.slice(i + 1, caret);
        if (query.includes('[')) return null;
        return { start: i - 1, query };
      }
      // 单个 `[`（普通方括号 / Markdown 链接）：不是双链
      return null;
    }
  }
  return null;
}

/** 把 `[[查询` 补全为 `[[标题]]`；光标后若已有自动补的 `]]` 一并吞掉 */
export function completeWikiLink(
  value: string,
  trigger: WikiLinkTrigger,
  caret: number,
  title: string,
): TextEdit {
  const to = value.startsWith(']]', caret) ? caret + 2 : caret;
  const insert = `[[${title}]]`;
  const end = trigger.start + insert.length;
  return { from: trigger.start, to, insert, selectionStart: end, selectionEnd: end };
}

/** 能作为 `[[标题]]` 目标的标题：非空，且不含会破坏语法的 `]`（与 parseWikiLinks 的 `[^\]]+` 一致） */
export function isLinkableTitle(title: string): boolean {
  return title.trim() !== '' && !title.includes(']') && !title.includes('\n');
}

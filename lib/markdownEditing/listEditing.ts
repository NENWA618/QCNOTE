import {
  INDENT_UNIT,
  isInsideCodeFence,
  lineEndOf,
  lineStartOf,
  selectedLineRange,
  type TextEdit,
} from './core';
import { LIST_LINE_RE, TASK_RE } from './patterns';

// ---------------------------------------------------------------------------
// Enter：列表 / 引用续写
// ---------------------------------------------------------------------------

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

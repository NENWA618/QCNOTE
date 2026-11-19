import { lineEndOf, lineStartOf, selectedLineRange, type TextEdit } from './core';
import { BULLET_RE, ORDERED_RE, QUOTE_RE, TASK_RE } from './patterns';

// ---------------------------------------------------------------------------
// 整行前缀：标题 / 列表 / 待办 / 引用
// ---------------------------------------------------------------------------

export type LinePrefixKind = 'bullet' | 'ordered' | 'task' | 'quote';

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

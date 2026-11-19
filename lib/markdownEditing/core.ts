/**
 * 编辑器里的 Markdown 辅助（拆分自原 markdownEditing.ts）：
 * 加粗/斜体/链接、列表续写、缩进、`[[` 双链补全。
 *
 * 这里全是纯函数：输入「文本 + 选区」，输出一个 `TextEdit`（替换哪一段、换成什么、
 * 编辑后选区在哪），由编辑器去应用。这样做有两个好处：
 * - 可以脱离 DOM 单测；
 * - 编辑器用 `execCommand('insertText')` 应用，浏览器原生的撤销栈（Ctrl+Z）不会被打断。
 *
 * 所有下标都是 JS 字符串下标（UTF-16），与 textarea 的 selectionStart/End 一致。
 *
 * 本文件放各模块共用的类型和行 / 围栏辅助函数。
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

export const lineStartOf = (value: string, pos: number) =>
  // pos 为 0 时不能走 lastIndexOf：负的 fromIndex 会被当成 0，
  // 文本以换行开头时会把下标 0 的换行误认成“上一行的结尾”，返回 1
  pos <= 0 ? 0 : value.lastIndexOf('\n', pos - 1) + 1;

export const lineEndOf = (value: string, pos: number) => {
  const i = value.indexOf('\n', pos);
  return i === -1 ? value.length : i;
};

/** 选区覆盖的整行范围 [from, to)，to 不含末尾换行 */
export function selectedLineRange(
  value: string,
  selStart: number,
  selEnd: number,
): [number, number] {
  const from = lineStartOf(value, selStart);
  // 选区正好止于行首（如整行选中后多带了换行）时，不把下一行算进去
  const lastPos = selEnd > selStart && value[selEnd - 1] === '\n' ? selEnd - 1 : selEnd;
  return [from, lineEndOf(value, lastPos)];
}

/** pos 之前有奇数个 ``` 围栏行，说明光标在代码块里 */
export function isInsideCodeFence(value: string, pos: number): boolean {
  const limit = lineStartOf(value, pos);
  // 只数光标所在行之前的围栏：边扫边停，不再先切出前半段文本再整体匹配
  const fence = /^[ \t]*(```|~~~)/gm;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(value)) !== null && m.index < limit) count++;
  return count % 2 === 1;
}

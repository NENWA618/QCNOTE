import type { NoteItem } from '../../lib/storage';
import type { TextEdit } from '../../lib/markdownEditing';

export const NOTE_CATEGORIES = ['生活', '工作', '学习', '灵感', '其他'];

/** 笔记主题色与选中文字着色共用同一组颜色 */
export const NOTE_COLORS = [
  '#ff6b6b',
  '#4ecdc4',
  '#45b7d1',
  '#96ceb4',
  '#ffeaa7',
  '#dda0dd',
  '#98d8c8',
  '#f7dc6f',
  '#bb8fce',
  '#85c1e9',
];

export const parseTags = (text: string) =>
  text
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter((t) => t);

export const sameTags = (a: string[], b: string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

/** 参与“是否有未保存更改”判断的字段 */
export function noteFingerprint(n: NoteItem | null) {
  if (!n) return '';
  return JSON.stringify([n.title, n.content, n.category, n.tags, n.color, n.coloredRanges ?? []]);
}

/**
 * 把一次编辑应用到 textarea。优先用 `execCommand('insertText')`：它走浏览器自己的编辑通道，
 * Ctrl+Z 能一步步撤销；直接改 value 会清空撤销栈。execCommand 不可用时（个别环境）退回 setRangeText。
 */
export function applyEditToTextarea(ta: HTMLTextAreaElement, edit: TextEdit) {
  ta.focus();
  ta.setSelectionRange(edit.from, edit.to);
  let done: boolean;
  try {
    done =
      edit.insert === ''
        ? document.execCommand('delete')
        : document.execCommand('insertText', false, edit.insert);
  } catch {
    done = false;
  }
  if (!done) {
    ta.setRangeText(edit.insert, edit.from, edit.to, 'end');
    // React 的 onChange 监听 input 事件
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  ta.setSelectionRange(edit.selectionStart, edit.selectionEnd);
}

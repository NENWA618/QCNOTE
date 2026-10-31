import type { NoteItem } from '../../lib/storage';

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

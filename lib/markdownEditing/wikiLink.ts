import { lineStartOf, type TextEdit } from './core';

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

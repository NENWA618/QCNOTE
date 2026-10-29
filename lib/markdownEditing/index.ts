/**
 * 编辑器里的 Markdown 辅助：对外入口。所有函数都是纯函数（文本 + 选区 → TextEdit），
 * 详见 core.ts 顶部说明。内部辅助（行边界、前缀正则等）不在这里导出。
 */

export { INDENT_UNIT, applyEdit, isInsideCodeFence, type TextEdit } from './core';
export { insertLink, toggleWrap } from './inline';
export { cycleHeading, toggleLinePrefix, type LinePrefixKind } from './linePrefix';
export { continueList, indentSelection } from './listEditing';
export {
  completeWikiLink,
  findWikiLinkTrigger,
  isLinkableTitle,
  type WikiLinkTrigger,
} from './wikiLink';

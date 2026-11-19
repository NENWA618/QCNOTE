/** 列表 / 引用行的前缀正则，行内前缀切换、Enter 续写、Tab 缩进共用 */

export const TASK_RE = /^([-*+]) \[[ xX]\] /;
export const BULLET_RE = /^[-*+] (?!\[[ xX]\] )/;
export const ORDERED_RE = /^\d+[.)] /;
export const QUOTE_RE = /^> ?/;

/** 一整行：缩进 + 前缀（待办 / 项目符号 / 编号 / 引用）+ 正文 */
export const LIST_LINE_RE = /^(\s*)((?:[-*+] \[[ xX]\] )|(?:[-*+] )|(?:\d+[.)] )|(?:> ))(.*)$/;

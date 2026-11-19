/**
 * 输入法（IME）合成保护。
 *
 * 中日韩输入法在选词时会用 Esc 取消候选、用 Enter 确认候选。
 * 如果快捷键处理器不区分这种情况，用户只是想取消一个拼音候选，
 * 就会误关编辑器、误提交表单。
 *
 * - `isComposing`：标准信号。
 * - `keyCode === 229`：Safari 在 compositionend 之后的同一个 keydown 里
 *   `isComposing` 已经是 false，但 keyCode 仍是 229，需要一并放过。
 */
export function isImeComposing(e: { isComposing?: boolean; keyCode?: number }): boolean {
  return e.isComposing === true || e.keyCode === 229;
}

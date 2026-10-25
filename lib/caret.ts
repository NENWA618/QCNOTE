/**
 * 取得 textarea 中某个下标处光标的像素位置（相对 textarea 左上角，已扣除滚动）。
 *
 * textarea 没有 API 能告诉我们光标在哪，常见做法是造一个隐藏的镜像 div：
 * 复制 textarea 的字体/内边距/换行规则，把光标前的文字放进去，再量末尾标记的位置。
 */

export interface CaretCoordinates {
  top: number;
  left: number;
  /** 光标所在行的行高 */
  height: number;
}

const MIRRORED_PROPERTIES = [
  'direction',
  'boxSizing',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
] as const;

export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): CaretCoordinates {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const mirrorStyle = mirror.style;

  mirrorStyle.position = 'absolute';
  mirrorStyle.visibility = 'hidden';
  mirrorStyle.top = '0';
  mirrorStyle.left = '-9999px';
  mirrorStyle.whiteSpace = 'pre-wrap';
  mirrorStyle.overflowWrap = 'break-word';
  mirrorStyle.overflow = 'hidden';
  for (const prop of MIRRORED_PROPERTIES) {
    mirrorStyle[prop] = style[prop];
  }
  // 竖向滚动条会占掉一部分内容宽度，镜像里用右内边距补上，换行位置才和真实的一致
  const scrollbar =
    textarea.offsetWidth -
    textarea.clientWidth -
    (parseFloat(style.borderLeftWidth) || 0) -
    (parseFloat(style.borderRightWidth) || 0);
  mirrorStyle.width = `${textarea.offsetWidth}px`;
  if (scrollbar > 0) {
    mirrorStyle.paddingRight = `${(parseFloat(style.paddingRight) || 0) + scrollbar}px`;
  }

  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  // 只需要光标之后的一小段：它决定当前这个词会不会被挤到下一行；末尾没有字符时放一个占位，
  // 让光标在行尾/空行时 marker 也有高度。不复制整篇，长笔记也不会变慢
  marker.textContent = textarea.value.slice(position, position + 100) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  try {
    const lineHeight = parseFloat(style.lineHeight);
    const height = Number.isFinite(lineHeight)
      ? lineHeight
      : parseFloat(style.fontSize) * 1.4 || 20;
    return {
      top: marker.offsetTop + (parseFloat(style.borderTopWidth) || 0) - textarea.scrollTop,
      left: marker.offsetLeft + (parseFloat(style.borderLeftWidth) || 0) - textarea.scrollLeft,
      height,
    };
  } finally {
    document.body.removeChild(mirror);
  }
}

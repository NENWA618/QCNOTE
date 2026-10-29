import type { TextEdit } from './core';

// ---------------------------------------------------------------------------
// 行内包裹：加粗 / 斜体 / 删除线 / 行内代码 / 高亮，以及插入链接
// ---------------------------------------------------------------------------

function runLength(value: string, from: number, step: 1 | -1, char: string): number {
  let n = 0;
  for (let i = step === 1 ? from : from - 1; i >= 0 && i < value.length; i += step) {
    if (value[i] !== char) break;
    n++;
  }
  return n;
}

/**
 * `start..end` 外侧是否已经有这个标记。
 * `*` 要单独处理：`**粗体**` 外侧也有 `*`，但那是加粗而不是斜体，所以只有连续的 `*` 为奇数个才算斜体；
 * `**` 则要求至少两个。
 */
function hasOuterWrap(value: string, start: number, end: number, marker: string): boolean {
  if (marker === '*' || marker === '**') {
    const before = runLength(value, start, -1, '*');
    const after = runLength(value, end, 1, '*');
    const run = Math.min(before, after);
    return marker === '*' ? run % 2 === 1 && before % 2 === 1 && after % 2 === 1 : run >= 2;
  }
  return (
    value.slice(Math.max(0, start - marker.length), start) === marker &&
    value.slice(end, end + marker.length) === marker
  );
}

/**
 * 给选区加/去掉成对标记。
 * - 选区外侧已有标记，或选区本身以标记开头结尾：去掉；
 * - 否则加上。选区两端的空白会先挪到标记外面（`** 文字 **` 不会被渲染成加粗）；
 * - 没有选区：在光标处放一对标记，光标落在中间（有 placeholder 时选中占位文字）。
 */
export function toggleWrap(
  value: string,
  selStart: number,
  selEnd: number,
  marker: string,
  placeholder = '',
): TextEdit {
  let start = selStart;
  let end = selEnd;
  while (start < end && /\s/.test(value[start])) start++;
  while (end > start && /\s/.test(value[end - 1])) end--;
  if (start === end) {
    start = selStart;
    end = selStart;
  }
  const m = marker.length;

  if (hasOuterWrap(value, start, end, marker)) {
    return {
      from: start - m,
      to: end + m,
      insert: value.slice(start, end),
      selectionStart: start - m,
      selectionEnd: end - m,
    };
  }

  const selected = value.slice(start, end);
  const innerWrapped =
    selected.length >= m * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    // `*` 的内层判断同样要避开 `**`
    !(marker === '*' && (selected.startsWith('**') || selected.endsWith('**')));
  if (innerWrapped) {
    const inner = selected.slice(m, selected.length - m);
    return {
      from: start,
      to: end,
      insert: inner,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }

  if (start === end) {
    const body = placeholder;
    return {
      from: start,
      to: end,
      insert: marker + body + marker,
      selectionStart: start + m,
      selectionEnd: start + m + body.length,
    };
  }

  return {
    from: start,
    to: end,
    insert: marker + selected + marker,
    selectionStart: start + m,
    selectionEnd: start + m + selected.length,
  };
}

/** 插入链接：选中文字 → `[文字](url)` 并选中 url；选中的是网址 → `[链接文字](网址)` 并选中占位文字 */
export function insertLink(value: string, selStart: number, selEnd: number): TextEdit {
  const selected = value.slice(selStart, selEnd);
  if (/^https?:\/\/\S+$/.test(selected)) {
    const label = '链接文字';
    return {
      from: selStart,
      to: selEnd,
      insert: `[${label}](${selected})`,
      selectionStart: selStart + 1,
      selectionEnd: selStart + 1 + label.length,
    };
  }
  const label = selected || '';
  const url = 'url';
  const insert = `[${label}](${url})`;
  if (!selected) {
    // 没选中文字：光标放进方括号里，先写链接文字
    return {
      from: selStart,
      to: selEnd,
      insert,
      selectionStart: selStart + 1,
      selectionEnd: selStart + 1,
    };
  }
  const urlStart = selStart + label.length + 3;
  return {
    from: selStart,
    to: selEnd,
    insert,
    selectionStart: urlStart,
    selectionEnd: urlStart + url.length,
  };
}

/**
 * 把 Markdown 正文压成适合在卡片 / 列表里展示的一小段纯文本。
 *
 * 原先只去掉 `# * ` > 这几个符号，`[[双链]]`、`[文字](链接)`、`- [ ]`、代码围栏等
 * 会原样显示在卡片上，读起来像乱码。
 */

export function toPlainPreview(markdown: string, maxLength = 240): string {
  // 卡片只显示开头一小段：先截取再处理，长笔记不会拖慢列表渲染。
  // 截断可能切在某个语法中间，只影响末尾几个字符，而且那里本来也会被省略号盖掉。
  const text = markdown
    .slice(0, maxLength * 8)
    // 代码围栏行（保留里面的代码文字）
    .replace(/^[ \t]*(```|~~~).*$/gm, '')
    // 块级公式标记
    .replace(/\$\$/g, ' ')
    // 图片 → alt 文字；链接 → 链接文字
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // [[双链]] → 标题
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    // HTML 标签
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    // 分隔线
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '')
    // 行首的标题 / 引用 / 列表 / 待办 / 编号
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*(?:>[ \t]?)+/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]+/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, '')
    // 行内强调 / 代码 / 删除线（`==` 不是标准 Markdown，`x == y` 是正文，不处理）
    .replace(/(\*\*|__|~~|`)/g, '')
    // 只清掉落单的 `*`（斜体标记）；`C#`、`#12`、`a -> b` 里的字符是正文，要保留
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;
  // 不要把一个代理对（emoji）从中间截断
  let end = maxLength;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end--;
  return `${text.slice(0, end).trimEnd()}…`;
}

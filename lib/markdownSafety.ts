/**
 * Markdown 渲染的 HTML 安全收紧。
 *
 * 笔记可能来自同步、导入或网页剪藏，不能完全信任。rehype-sanitize 之后仍放行了
 * span/div 的 style 和 className（KaTeX 输出需要），这会让恶意笔记用
 * `position:fixed` 或 Tailwind 的 `fixed inset-0` 之类的样式盖住整个页面做钓鱼。
 *
 * 这里的 rehype 插件必须放在 rehype-raw 之后、rehype-katex 之前：那时树里只有用户
 * 写的元素，KaTeX 生成的节点还不存在，所以可以对 style/class 一刀切地收紧，
 * 而不会破坏公式排版。
 */

// hex、命名颜色，或只含数字/小数/百分号/逗号/斜杠/空白的 rgb()/hsl() 函数
const SAFE_CSS_COLOR =
  /^(?:#[0-9a-f]{3,8}|[a-z]{3,30}|(?:rgba?|hsla?)\(\s*[\d.]+(?:%|deg)?(?:\s*[,\s/]\s*[\d.]+(?:%|deg)?){2,3}\s*\))$/i;

export function isSafeCssColor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && SAFE_CSS_COLOR.test(value.trim());
}

/** 只保留一条合法的 `color` 声明，其余全部丢弃；没有则返回 null */
export function filterInlineStyle(style: string): string | null {
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator === -1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (property === 'color' && isSafeCssColor(value)) {
      return `color: ${value}`;
    }
  }
  return null;
}

// 只有这些 class 有功能意义：代码块语言、数学节点标记、GFM 任务列表
const ALLOWED_CLASS =
  /^(?:language-[\w-]+|math-inline|math-display|contains-task-list|task-list-item)$/;

interface HastNode {
  type: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function restrictNode(node: HastNode): void {
  if (node.type === 'element' && node.properties) {
    const props = node.properties;

    if (typeof props.style === 'string') {
      const filtered = filterInlineStyle(props.style);
      if (filtered) props.style = filtered;
      else delete props.style;
    } else if ('style' in props) {
      delete props.style;
    }

    if (props.className !== undefined) {
      const classes = (Array.isArray(props.className) ? props.className : [props.className])
        .map(String)
        .filter((name) => ALLOWED_CLASS.test(name));
      if (classes.length > 0) props.className = classes;
      else delete props.className;
    }
  }

  node.children?.forEach(restrictNode);
}

/** rehype 插件：收紧用户手写 HTML 里的 style 与 class */
export function rehypeRestrictUserStyles() {
  return (tree: HastNode) => restrictNode(tree);
}

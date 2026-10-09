import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Pluggable } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import { ColoredRange } from '../lib/storage';
import TextColorUtils from '../lib/textColorUtils';
import { isSafeCssColor, rehypeRestrictUserStyles } from '../lib/markdownSafety';

interface ColoredMarkdownProps {
  content: string;
  coloredRanges?: ColoredRange[];
}

// KaTeX 输出的 MathML 供屏幕阅读器读取公式结构。用户也能手写这些标签，所以这里只放行
// 纯排版属性：不放行 style（rehypeRestrictUserStyles 只收紧 span/div）、href（Firefox 会把
// MathML 元素当链接）以及会加载外部图片的 mglyph。
const mathmlTagNames = [
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mtext',
  'mspace',
  'msub',
  'msup',
  'msubsup',
  'munder',
  'mover',
  'munderover',
  'mfrac',
  'msqrt',
  'mroot',
  'mtable',
  'mtr',
  'mtd',
  'mstyle',
  'mpadded',
  'mphantom',
  'menclose',
];
const mathmlAttributes = [
  'mathvariant',
  'mathcolor',
  'mathbackground',
  'mathsize',
  'displaystyle',
  'scriptlevel',
  'fence',
  'separator',
  'stretchy',
  'largeop',
  'lspace',
  'rspace',
  'minsize',
  'maxsize',
  'accent',
  'accentunder',
  'linethickness',
  'width',
  'height',
  'depth',
  'voffset',
  'columnalign',
  'columnlines',
  'columnspacing',
  'rowlines',
  'rowspacing',
  'notation',
];

// span/div 的 style 和 className 是 KaTeX 输出需要的。用户手写 HTML 里的 style/class
// 已在 KaTeX 渲染之前被 rehypeRestrictUserStyles 收紧，所以这里放行的只剩 KaTeX 自己生成的部分。
// span 的 aria-hidden 让屏幕阅读器跳过 KaTeX 的视觉层，只读 MathML。
// svg/path/line 是 KaTeX 画根号、宽帽子、可伸缩括号用的；用户手写的 SVG 已被
// rehypeRestrictUserStyles 删除，所以 svg 上的 style 只会是 KaTeX 设置的宽度。
const katexSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), ...mathmlTagNames, 'svg', 'path', 'line'],
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span || []), ['className'], ['style'], ['ariaHidden']],
    div: [...(defaultSchema.attributes?.div || []), ['className'], ['style']],
    ...Object.fromEntries(mathmlTagNames.map((tag) => [tag, mathmlAttributes])),
    math: ['xmlns', 'display', ...mathmlAttributes],
    annotation: ['encoding'],
    svg: ['xmlns', 'width', 'height', 'viewBox', 'preserveAspectRatio', 'style'],
    path: ['d'],
    line: ['x1', 'y1', 'x2', 'y2', 'strokeWidth'],
  },
};

// 顺序很重要：raw → 收紧用户样式 → katex → sanitize
const rehypePlugins: Pluggable[] = [
  rehypeRaw as Pluggable,
  rehypeRestrictUserStyles as Pluggable,
  rehypeKatex as Pluggable,
  [rehypeSanitize, katexSanitizeSchema] as Pluggable,
];

/**
 * Component that renders markdown content with mixed text colors
 * Directly embeds HTML span tags for colored text
 */
export const ColoredMarkdown: React.FC<ColoredMarkdownProps> = ({ content, coloredRanges }) => {
  // If no colored ranges, just render normally
  if (!coloredRanges || coloredRanges.length === 0) {
    return <NormalMarkdown content={content} />;
  }

  // Get the colored segments
  const segments = TextColorUtils.renderWithColors(content, coloredRanges);

  // Build content with HTML span tags for colored text
  let processedContent = '';
  for (const segment of segments) {
    // 颜色值来自存储的笔记数据（可能经同步/导入而来），不是合法颜色就当作没有颜色
    if (segment.color && isSafeCssColor(segment.color)) {
      // Escape HTML entities in the text
      const escapedText = segment.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      processedContent += `<span style="color: ${segment.color.trim()}">${escapedText}</span>`;
    } else {
      processedContent += segment.text;
    }
  }

  return <NormalMarkdown content={processedContent} />;
};

interface NormalMarkdownProps {
  content: string;
}

export const NormalMarkdown: React.FC<NormalMarkdownProps> = ({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={rehypePlugins}
      components={{
        h1: ({ children }) => <h1 className="text-2xl font-bold mb-4">{children}</h1>,
        h2: ({ children }) => <h2 className="text-xl font-bold mb-3">{children}</h2>,
        h3: ({ children }) => <h3 className="text-lg font-bold mb-2">{children}</h3>,
        p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="mb-4 ml-6 list-disc">{children}</ul>,
        ol: ({ children }) => <ol className="mb-4 ml-6 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        code: ({ children }) => (
          <code className="bg-gray-100 dark:bg-dark-surface-light px-2 py-1 rounded text-sm font-mono text-gray-800 dark:text-dark-text">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="bg-gray-100 dark:bg-dark-surface-light p-4 rounded overflow-x-auto mb-4 text-gray-800 dark:text-dark-text">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-primary pl-4 italic text-gray-600 dark:text-dark-text-secondary mb-4">
            {children}
          </blockquote>
        ),
      }}
    >
      {content || '*暂无内容*'}
    </ReactMarkdown>
  );
};

export default ColoredMarkdown;

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Pluggable } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import { ColoredRange } from '../lib/storage';
import { rehypeRestrictUserStyles } from '../lib/markdownSafety';
import { rehypeColorRanges } from '../lib/rehypeColorRanges';

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

// KaTeX 生成的样式不经过 rehypeRestrictUserStyles，公式里写的尺寸会原样变成 CSS：
// 不设上限的话 `\rule{500em}{500em}` 能画出盖住整页的色块，在公开笔记里可以拿来钓鱼。
// maxSize 只截断正值，`\kern{-30em}` 这类负值仍能把内容移出笔记区域、盖到侧栏上，
// 靠 NormalMarkdown 外层容器的裁剪兜底。
const KATEX_MAX_SIZE_EM = 10;

// 顺序很重要：（着色）→ raw → 收紧用户样式 → katex → sanitize
const rehypePlugins: Pluggable[] = [
  rehypeRaw as Pluggable,
  rehypeRestrictUserStyles as Pluggable,
  [rehypeKatex, { maxSize: KATEX_MAX_SIZE_EM }] as Pluggable,
  [rehypeSanitize, katexSanitizeSchema] as Pluggable,
];

/** Markdown with the note's text colors applied (see rehypeColorRanges). */
export const ColoredMarkdown: React.FC<ColoredMarkdownProps> = ({ content, coloredRanges }) => (
  <NormalMarkdown content={content} coloredRanges={coloredRanges} />
);

interface NormalMarkdownProps {
  content: string;
  coloredRanges?: ColoredRange[];
}

export const NormalMarkdown: React.FC<NormalMarkdownProps> = ({ content, coloredRanges }) => {
  const source = content || '*暂无内容*';
  // Colors are matched to the tree by source position, so this goes first,
  // while the tree still lines up with `source`.
  const plugins = useMemo<Pluggable[]>(
    () =>
      coloredRanges && coloredRanges.length > 0
        ? [[rehypeColorRanges, { source, ranges: coloredRanges }] as Pluggable, ...rehypePlugins]
        : rehypePlugins,
    [source, coloredRanges],
  );
  // 裁剪掉画到笔记区域之外的内容（KaTeX 用负边距排版，`\kern` 的位移可以很大）；
  // 过宽的公式横向滚动
  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={plugins}
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
          // 代码块里的 <code> 也会走上面的 code 渲染器；它是行内元素，px-2 只会加在
          // 第一行开头，导致首行右偏。这里把行内代码的内边距、背景和圆角去掉。
          pre: ({ children }) => (
            <pre className="bg-gray-100 dark:bg-dark-surface-light p-4 rounded overflow-x-auto mb-4 text-gray-800 dark:text-dark-text [&>code]:p-0 [&>code]:bg-transparent [&>code]:rounded-none">
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
        {source}
      </ReactMarkdown>
    </div>
  );
};

export default ColoredMarkdown;

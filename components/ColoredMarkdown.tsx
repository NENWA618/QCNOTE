import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Pluggable } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import { ColoredRange } from '../lib/storage';
import TextColorUtils from '../lib/textColorUtils';

interface ColoredMarkdownProps {
  content: string;
  coloredRanges?: ColoredRange[];
}

const katexSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span || []), ['className'], ['style']],
    div: [...(defaultSchema.attributes?.div || []), ['className'], ['style']],
  },
};

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
    if (segment.color) {
      // Escape HTML entities in the text
      const escapedText = segment.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      processedContent += `<span style="color: ${segment.color}">${escapedText}</span>`;
    } else {
      processedContent += segment.text;
    }
  }

  return <ProcessedMarkdown content={processedContent} />;
};

interface ProcessedMarkdownProps {
  content: string;
}

const ProcessedMarkdown: React.FC<ProcessedMarkdownProps> = ({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[
        rehypeRaw as Pluggable,
        rehypeKatex as Pluggable,
        [rehypeSanitize, katexSanitizeSchema] as Pluggable,
      ]}
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

interface NormalMarkdownProps {
  content: string;
}

export const NormalMarkdown: React.FC<NormalMarkdownProps> = ({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[
        rehypeRaw as Pluggable,
        rehypeKatex as Pluggable,
        [rehypeSanitize, katexSanitizeSchema] as Pluggable,
      ]}
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

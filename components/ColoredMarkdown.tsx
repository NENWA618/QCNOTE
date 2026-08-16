import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Pluggable } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
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
 * Inserts special markers for colored segments, then replaces them after markdown processing
 */
export const ColoredMarkdown: React.FC<ColoredMarkdownProps> = ({ content, coloredRanges }) => {
  // If no colored ranges, just render normally
  if (!coloredRanges || coloredRanges.length === 0) {
    return <NormalMarkdown content={content} />;
  }

  // Get the colored segments
  const segments = TextColorUtils.renderWithColors(content, coloredRanges);

  // Build content with unique markers for colored text
  let processedContent = '';
  const colorMap: Record<string, string> = {};

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.color) {
      // Create a unique marker for this colored segment
      const markerId = `__COLOR_${i}__`;
      colorMap[markerId] = segment.color;
      processedContent += markerId + segment.text + markerId;
    } else {
      processedContent += segment.text;
    }
  }

  return <ColoredMarkdownRenderer content={processedContent} colorMap={colorMap} />;
};

interface ColoredMarkdownRendererProps {
  content: string;
  colorMap: Record<string, string>;
}

/**
 * This component handles the actual rendering with color replacements
 */
const ColoredMarkdownRenderer: React.FC<ColoredMarkdownRendererProps> = ({ content, colorMap }) => {
  // Create a custom component wrapper that replaces markers with colored spans
  const customP = ({ children }: any) => {
    const processChildren = (child: any): any => {
      if (typeof child === 'string') {
        // Replace color markers in text
        const parts: any[] = [];
        let currentText = child;
        let lastIndex = 0;

        // Sort markers by appearance in the string
        const markerRegex = /__COLOR_\d+__/g;
        let match;
        const matches: Array<{ marker: string; index: number }> = [];

        while ((match = markerRegex.exec(currentText)) !== null) {
          matches.push({ marker: match[0], index: match.index });
        }

        // Process text with markers
        if (matches.length > 0) {
          for (let i = 0; i < matches.length; i += 2) {
            const startMatch = matches[i];
            const endMatch = matches[i + 1];

            if (endMatch) {
              // Add text before this colored section
              if (startMatch.index > lastIndex) {
                parts.push(currentText.substring(lastIndex, startMatch.index));
              }

              // Extract the color and text
              const color = colorMap[startMatch.marker];
              const coloredText = currentText.substring(
                startMatch.index + startMatch.marker.length,
                endMatch.index,
              );

              if (color) {
                parts.push(
                  <span key={`colored-${lastIndex}`} style={{ color }}>
                    {coloredText}
                  </span>,
                );
              }

              lastIndex = endMatch.index + endMatch.marker.length;
            }
          }

          // Add remaining text
          if (lastIndex < currentText.length) {
            parts.push(currentText.substring(lastIndex));
          }

          return parts.length > 0 ? parts : child;
        }

        return child;
      }

      // Process React elements
      if (React.isValidElement(child)) {
        const element = child as React.ReactElement<any>;
        return React.cloneElement(element, {
          children: React.Children.map(element.props.children, processChildren),
        });
      }

      return child;
    };

    const processedChildren = React.Children.map(children, processChildren);
    return <p className="mb-4 leading-relaxed">{processedChildren}</p>;
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex as Pluggable, [rehypeSanitize, katexSanitizeSchema] as Pluggable]}
      components={{
        h1: ({ children }) => <h1 className="text-2xl font-bold mb-4">{children}</h1>,
        h2: ({ children }) => <h2 className="text-xl font-bold mb-3">{children}</h2>,
        h3: ({ children }) => <h3 className="text-lg font-bold mb-2">{children}</h3>,
        p: customP,
        ul: ({ children }) => <ul className="mb-4 ml-6 list-disc">{children}</ul>,
        ol: ({ children }) => <ol className="mb-4 ml-6 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        code: ({ children }) => (
          <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto mb-4">{children}</pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-primary pl-4 italic text-gray-600 mb-4">
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
      rehypePlugins={[rehypeKatex as Pluggable, [rehypeSanitize, katexSanitizeSchema] as Pluggable]}
      components={{
        h1: ({ children }) => <h1 className="text-2xl font-bold mb-4">{children}</h1>,
        h2: ({ children }) => <h2 className="text-xl font-bold mb-3">{children}</h2>,
        h3: ({ children }) => <h3 className="text-lg font-bold mb-2">{children}</h3>,
        p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="mb-4 ml-6 list-disc">{children}</ul>,
        ol: ({ children }) => <ol className="mb-4 ml-6 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        code: ({ children }) => (
          <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto mb-4">{children}</pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-primary pl-4 italic text-gray-600 mb-4">
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

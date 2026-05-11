import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Pluggable } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const katexSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ...(defaultSchema.attributes?.span || []),
      ['className'],
      ['style']
    ],
    div: [
      ...(defaultSchema.attributes?.div || []),
      ['className'],
      ['style']
    ]
  }
};

interface Props {
  source: string;
  className?: string;
}

const MarkdownView: React.FC<Props> = ({ source, className }) => {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[
          rehypeKatex as Pluggable,
          [rehypeSanitize, katexSanitizeSchema] as Pluggable
        ]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownView;

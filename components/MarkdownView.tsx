import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Pluggable } from 'unified';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

interface Props {
  source: string;
  className?: string;
}

const MarkdownView: React.FC<Props> = ({ source, className }) => {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize as Pluggable]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownView;

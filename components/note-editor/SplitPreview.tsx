import React from 'react';
import ColoredMarkdown from '../ColoredMarkdown';
import type { ColoredRange } from '../../lib/storage';

interface SplitPreviewProps {
  title: string;
  color: string;
  /** 调用方传入 useDeferredValue 之后的值，打字不会被 Markdown + KaTeX 渲染拖住 */
  content: string;
  coloredRanges?: ColoredRange[];
}

/** 分屏模式右侧的实时预览。memo：光标 / 补全菜单等状态变化不会重渲染 Markdown */
export const SplitPreview = React.memo(
  React.forwardRef<HTMLDivElement, SplitPreviewProps>(function SplitPreview(
    { title, color, content, coloredRanges },
    ref,
  ) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label="实时预览"
        className="flex-1 min-w-0 overflow-y-auto overscroll-contain border-l border-gray-200 p-6 dark:border-dark-border dark:text-dark-text"
      >
        <h1
          className="mb-4 border-l-4 pl-3 text-2xl font-bold wrap-break-word text-ink dark:text-dark-text"
          style={{ borderColor: color }}
        >
          {title || '无标题'}
        </h1>
        <div className="prose dark:prose-invert max-w-none wrap-break-word overflow-x-auto">
          <ColoredMarkdown content={content} coloredRanges={coloredRanges} />
        </div>
      </div>
    );
  }),
);

import React from 'react';
import type { TextStats } from '../../lib/textStats';

interface StatusBarProps {
  stats: TextStats;
  modLabel: string;
}

export const StatusBar: React.FC<StatusBarProps> = React.memo(function StatusBar({
  stats,
  modLabel,
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-4 py-1.5 text-xs text-text-light dark:border-dark-border">
      <span className="tabular-nums" title={`${stats.chars.toLocaleString()} 个字符（不含空白）`}>
        {stats.words.toLocaleString()} 字
        {stats.readingMinutes > 0 && ` · 约 ${stats.readingMinutes} 分钟读完`}
      </span>
      <span className="hidden truncate sm:inline">
        {modLabel}+S 保存 · {modLabel}+B / I 加粗 / 斜体 · 输入 [[ 链接笔记
      </span>
    </div>
  );
});

import React from 'react';
import { NOTE_COLORS } from './utils';

interface ColorSelectionBarProps {
  selectedCount: number;
  onApply: (color: string) => void;
  onClear: () => void;
}

/** 选中文字后出现的着色条 */
export const ColorSelectionBar: React.FC<ColorSelectionBarProps> = ({
  selectedCount,
  onApply,
  onClear,
}) => (
  // onMouseDown 阻止默认行为，避免点击颜色时文本框失焦丢失选区
  <div
    className="flex flex-wrap gap-2 items-center mb-2 p-2 rounded bg-gray-50 dark:bg-dark-surface-light"
    onMouseDown={(e) => e.preventDefault()}
  >
    <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
      已选中 {selectedCount} 字符
    </span>
    {NOTE_COLORS.map((color) => (
      <button
        key={color}
        type="button"
        onClick={() => onApply(color)}
        className="w-8 h-8 sm:w-6 sm:h-6 rounded border border-gray-300 dark:border-dark-border hover:border-gray-800 dark:hover:border-gray-400 transition"
        style={{ backgroundColor: color }}
        title={`应用${color}颜色`}
        aria-label={`把选中文字设为 ${color}`}
      />
    ))}
    <button
      type="button"
      onClick={onClear}
      className="text-xs px-3 py-2 sm:px-2 sm:py-1 bg-gray-200 dark:bg-dark-border hover:bg-gray-300 rounded transition"
      title="清除颜色"
    >
      清除
    </button>
  </div>
);

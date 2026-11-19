import React from 'react';
import { NOTE_CATEGORIES, NOTE_COLORS } from './utils';

interface MetadataFieldsProps {
  category: string;
  color: string;
  tagsText: string;
  onCategoryChange: (category: string) => void;
  onColorChange: (color: string) => void;
  onTagsTextChange: (text: string) => void;
}

const FIELD =
  'w-full p-2 border rounded text-base sm:text-sm dark:bg-dark-surface-light dark:border-dark-border dark:text-dark-text';
const LABEL = 'block text-sm font-medium text-gray-700 dark:text-dark-text mb-1';

/** 分类、颜色主题、标签 */
export const MetadataFields: React.FC<MetadataFieldsProps> = ({
  category,
  color,
  tagsText,
  onCategoryChange,
  onColorChange,
  onTagsTextChange,
}) => {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className={LABEL}>分类</label>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className={FIELD}
          >
            <option value="">选择分类</option>
            {NOTE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL}>颜色主题</label>
          <div className="flex flex-wrap gap-2">
            {NOTE_COLORS.map((c) => {
              const active = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onColorChange(c)}
                  aria-label={`笔记颜色 ${c}`}
                  aria-pressed={active}
                  className={`flex w-8 h-8 items-center justify-center rounded-full border-2 text-xs font-bold text-gray-800 transition-transform ${
                    active
                      ? 'scale-110 border-gray-800 dark:border-white'
                      : 'border-white/60 hover:scale-105 dark:border-dark-border'
                  }`}
                  style={{ backgroundColor: c }}
                >
                  {active ? '✓' : ''}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className={LABEL}>标签 (用逗号分隔)</label>
        <input
          type="text"
          value={tagsText}
          onChange={(e) => onTagsTextChange(e.target.value)}
          placeholder="标签1, 标签2, 标签3"
          className={FIELD}
        />
      </div>
    </>
  );
};

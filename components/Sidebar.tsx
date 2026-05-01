/* eslint-disable no-unused-vars */
import React, { useState } from 'react';

import type { Stats } from '../lib/storage';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  categories: string[];
  stats: Stats;
  currentCategory: string;
  onCategoryChange: (_value: string) => void;
}

const Sidebar: React.FC<Props> = ({ categories, stats, currentCategory, onCategoryChange, isOpen, onToggle }) => {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(true);

  return (
    <aside className={`w-full md:w-64 flex-shrink-0 transition-all ${isOpen ? 'block' : 'hidden md:block'}`}>
      <div className="bg-white border-r border-gray-200 h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-primary-dark">笔记管理</h2>
          <button
            type="button"
            className="text-sm text-primary-dark hover:text-accent-pink transition-colors"
            onClick={onToggle}
            aria-label={isOpen ? '关闭侧边栏' : '打开侧边栏'}
          >
            {isOpen ? '隐藏' : '显示'}
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Filters Section */}
          <div className="bg-gray-50 rounded-lg p-3">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 hover:text-primary-dark transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="text-accent-pink">📂</span>
                过滤器
              </span>
              <svg
                className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {filtersOpen && (
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="category-filter" className="block text-xs font-medium text-gray-600 mb-1">
                    分类
                  </label>
                  <select
                    id="category-filter"
                    className="form-input text-sm"
                    value={currentCategory}
                    onChange={(e) => onCategoryChange(e.target.value)}
                  >
                    <option value="all">全部分类</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Stats Section */}
          <div className="bg-gradient-to-br from-accent-pink to-accent-purple rounded-lg p-3 text-white">
            <button
              onClick={() => setStatsOpen(!statsOpen)}
              className="flex items-center justify-between w-full text-left text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <span className="flex items-center gap-2">
                <span>📊</span>
                统计信息
              </span>
              <svg
                className={`w-4 h-4 transition-transform ${statsOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {statsOpen && (
              <div className="mt-3 grid grid-cols-1 gap-2">
                <div className="bg-white bg-opacity-20 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold">{stats.totalNotes}</div>
                  <div className="text-xs opacity-90">总笔记</div>
                </div>
                <div className="bg-white bg-opacity-20 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold">{stats.favoriteNotes}</div>
                  <div className="text-xs opacity-90">收藏</div>
                </div>
                <div className="bg-white bg-opacity-20 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold">{stats.totalTags}</div>
                  <div className="text-xs opacity-90">标签</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

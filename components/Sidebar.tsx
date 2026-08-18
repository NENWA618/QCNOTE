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
  search: string;
  onSearchChange: (_value: string) => void;
  sortBy: string;
  onSortChange: (_value: string) => void;
}

const Sidebar: React.FC<Props> = ({
  categories,
  stats,
  currentCategory,
  onCategoryChange,
  isOpen,
  onToggle,
  search,
  onSearchChange,
  sortBy,
  onSortChange,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(true);

  return (
    <aside
      className={`w-full md:w-72 flex-shrink-0 transition-all ${isOpen ? 'block' : 'hidden md:block'}`}
    >
      <div className="bg-white/90 dark:bg-dark-surface/95 border border-gray-200/80 dark:border-dark-border rounded-3xl shadow-light overflow-hidden">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200/70 dark:border-dark-border">
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
          <div className="bg-gray-50 dark:bg-dark-surface-light rounded-lg p-3">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 dark:text-dark-text hover:text-primary-dark dark:hover:text-accent-pink transition-colors"
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {filtersOpen && (
              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="sidebar-sort"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    排序方式
                  </label>
                  <select
                    id="sidebar-sort"
                    className="form-input text-sm"
                    value={sortBy}
                    onChange={(e) => onSortChange(e.target.value)}
                  >
                    <option value="date">按时间排序</option>
                    <option value="title">按标题排序</option>
                    <option value="category">按分类排序</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="category-filter"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
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
                <div>
                  <label
                    htmlFor="sidebar-search"
                    className="block text-xs font-medium text-gray-600 dark:text-dark-text-secondary mb-1"
                  >
                    搜索笔记
                  </label>
                  <input
                    id="sidebar-search"
                    type="text"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="搜索笔记..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-dark-surface text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-dark-text-secondary"
                  />
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {statsOpen && (
              <div className="mt-3 grid grid-cols-1 gap-2">
                <div className="bg-white dark:bg-dark-surface-light bg-opacity-20 dark:bg-opacity-20 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold">{stats.totalNotes}</div>
                  <div className="text-xs opacity-90">总笔记</div>
                </div>
                <div className="bg-white dark:bg-dark-surface-light bg-opacity-20 dark:bg-opacity-20 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold">{stats.createdToday}</div>
                  <div className="text-xs opacity-90">今日创建</div>
                </div>
                <div className="bg-white dark:bg-dark-surface-light bg-opacity-20 dark:bg-opacity-20 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold">{stats.favoriteNotes}</div>
                  <div className="text-xs opacity-90">收藏</div>
                </div>
                <div className="bg-white dark:bg-dark-surface-light bg-opacity-20 dark:bg-opacity-20 rounded-lg p-3 text-center">
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

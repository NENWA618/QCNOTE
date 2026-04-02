/* eslint-disable no-unused-vars */
import React from 'react';

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
  return (
    <aside className={`w-full md:w-64 flex-shrink-0 transition-all ${isOpen ? 'block' : 'hidden md:block'}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold">笔记过滤器</h2>
        <button
          type="button"
          className="text-sm text-primary-dark hover:text-primary-medium"
          onClick={onToggle}
          aria-label={isOpen ? '关闭侧边栏' : '打开侧边栏'}
        >
          {isOpen ? '隐藏' : '显示'}
        </button>
      </div>

      <div className="p-4">
        <div className="mb-4">
          <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-2">
            📂 分类
          </label>
          <select
            id="category-filter"
            className="form-select w-full"
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
          <p className="text-sm font-medium text-gray-700 mb-2">📊 统计</p>
          <div className="grid grid-cols-1 gap-2">
            <div className="stat-card">
              <div className="stat-number">{stats.totalNotes}</div>
              <div className="stat-label">笔记</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.favoriteNotes}</div>
              <div className="stat-label">收藏</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.totalTags}</div>
              <div className="stat-label">标签</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

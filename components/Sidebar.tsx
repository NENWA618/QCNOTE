import React from 'react';

interface Props {
  categories: string[];
  stats: Record<string, number>;
  onNewNote: () => void;
  onSearch: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onSortChange: (v: string) => void;
  searchValue: string;
  selectedCategory: string;
  sortBy: string;
  onExport?: () => void;
  onImport?: (f: File) => void;
  onClearAll?: () => void;
}

const Sidebar: React.FC<Props> = ({
  categories,
  stats,
  onNewNote,
  onSearch,
  onCategoryChange,
  onSortChange,
  searchValue,
  selectedCategory,
  sortBy,
  onExport,
  onImport,
  onClearAll,
}) => {
  return (
    <aside className="w-full md:w-64 flex-shrink-0">
      <button id="new-note-btn" className="btn btn-primary w-full" onClick={onNewNote}>
        ✏️ 新建笔记
      </button>

      <div className="mt-8">
        <input
          id="search-input"
          className="search-box"
          placeholder="搜索笔记... (Ctrl+K)"
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      <div className="mt-8">
        <p className="sidebar-title">📂 分类</p>
        <select
          id="category-filter"
          className="select"
          value={selectedCategory}
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

      <div className="mt-8">
        <p className="sidebar-title">⚙️ 排序</p>
        <select
          id="sort-select"
          className="select"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
        >
          <option value="date">最新修改</option>
          <option value="title">按标题</option>
          <option value="color">按颜色</option>
          <option value="favorite">收藏优先</option>
        </select>
      </div>

      <div className="mt-8">
        <p className="sidebar-title">📊 统计</p>
        <div id="stats-container" className="grid grid-cols-1 gap-2">
          <div className="stat-item">
            <span className="stat-value">{stats?.totalNotes ?? 0}</span>
            <span className="stat-label">笔记</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats?.favoriteNotes ?? 0}</span>
            <span className="stat-label">收藏</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats?.totalTags ?? 0}</span>
            <span className="stat-label">标签</span>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <p className="sidebar-title">⚠️ 数据</p>
        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-secondary flex-1"
            onClick={() => onExport && onExport()}
          >
            导出 JSON
          </button>
          <label className="btn btn-sm flex items-center justify-center cursor-pointer">
            导入
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (f && onImport) onImport(f);
                // clear input
                if (e.target) (e.target as HTMLInputElement).value = '';
              }}
            />
          </label>
        </div>
        <div className="mt-2">
          <button
            className="btn btn-sm bg-red-500 text-white w-full hover:opacity-90"
            onClick={() => onClearAll && onClearAll()}
          >
            清空所有
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

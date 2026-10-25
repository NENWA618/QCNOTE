import React, { useEffect, useRef } from 'react';

import { useModKeyLabel } from '../lib/hooks/useModKeyLabel';
import type { Stats } from '../lib/storage';

interface Props {
  /** 移动端筛选面板（排序、分类、统计）是否展开；桌面端始终展开 */
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
  semanticEnabled?: boolean;
  onToggleSemantic?: () => void;
  semanticStatus?: 'idle' | 'loading-model' | 'searching' | 'ready' | 'error';
  semanticProgress?: number;
}

const SORT_OPTIONS = [
  { value: 'date', label: '时间' },
  { value: 'title', label: '标题' },
  { value: 'category', label: '分类' },
];

const sectionTitle = 'mb-2 px-1 text-xs font-semibold tracking-wider text-text-light';

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
  semanticEnabled = false,
  onToggleSemantic,
  semanticStatus = 'idle',
  semanticProgress = 0,
}) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const mod = useModKeyLabel();

  // 按 / 聚焦搜索框（正在输入时不拦截）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      // 有模态面板（编辑器、对话框）打开时，不去聚焦被它盖住的搜索框
      if (document.querySelector('[aria-modal="true"]')) return;
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filtered = currentCategory !== 'all' || sortBy !== 'date';

  const categoryItems = [
    { value: 'all', label: '全部', count: stats.totalNotes },
    ...categories.map((c) => ({ value: c, label: c, count: stats.categories[c] ?? 0 })),
  ];

  return (
    <aside className="w-full shrink-0 md:sticky md:top-24 md:w-60 md:self-start lg:w-64">
      <div className="rounded-2xl border border-primary-light/40 bg-white/95 p-3 dark:border-dark-border dark:bg-dark-surface">
        {/* 搜索：始终可见 */}
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-text-light"
            >
              🔍
            </span>
            <input
              ref={searchRef}
              id="sidebar-search"
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && search) {
                  e.preventDefault();
                  onSearchChange('');
                }
              }}
              placeholder={`搜索笔记... ${mod}+K 跳转`}
              aria-label="搜索笔记"
              aria-keyshortcuts="/"
              className="h-10 w-full rounded-xl border border-gray-200 bg-white pr-9 pl-9 text-base text-gray-900 placeholder-gray-400 focus:border-accent-pink focus:ring-2 focus:ring-accent-pink/30 focus:outline-hidden sm:text-sm dark:border-dark-border dark:bg-dark-surface-light dark:text-dark-text [&::-webkit-search-cancel-button]:hidden"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  searchRef.current?.focus();
                }}
                aria-label="清除搜索"
                className="absolute inset-y-0 right-1 my-auto flex h-8 w-8 items-center justify-center rounded-full text-text-light hover:bg-primary-light dark:hover:bg-dark-border"
              >
                ✕
              </button>
            ) : (
              <kbd className="pointer-events-none absolute inset-y-0 right-2 my-auto hidden h-5 items-center rounded border border-gray-200 px-1.5 font-mono text-[10px] text-text-light md:flex dark:border-dark-border">
                /
              </kbd>
            )}
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls="sidebar-filters"
            aria-label={isOpen ? '关闭侧边栏' : '打开侧边栏'}
            className={`relative flex h-10 shrink-0 items-center gap-1 rounded-xl border px-3 text-sm md:hidden ${
              isOpen
                ? 'border-accent-pink bg-primary-light/60 text-ink-pink dark:bg-accent-pink/10'
                : 'border-gray-200 text-ink dark:border-dark-border dark:text-dark-text'
            }`}
          >
            <span aria-hidden="true">⚙️</span>
            <span>筛选</span>
            {filtered && !isOpen && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-accent-pink" />
            )}
          </button>
        </div>

        {onToggleSemantic && (
          <label className="mt-2 flex cursor-pointer items-center gap-2 px-1 text-xs text-text-light">
            <input
              type="checkbox"
              checked={semanticEnabled}
              onChange={onToggleSemantic}
              className="h-4 w-4 rounded accent-[#dc96b4]"
            />
            🧠 语义搜索（本地模型，首次开启需下载）
          </label>
        )}
        {semanticEnabled && search && semanticStatus !== 'idle' && (
          <p className="mt-1 px-1 text-xs text-text-light" role="status">
            {semanticStatus === 'loading-model' && `下载模型中 ${semanticProgress.toFixed(0)}%`}
            {semanticStatus === 'searching' && '正在语义搜索...'}
            {semanticStatus === 'ready' && '语义搜索就绪'}
            {semanticStatus === 'error' && '语义搜索出错，已回退到普通搜索'}
          </p>
        )}

        {/* 排序、分类、统计：移动端可折叠，桌面端常驻 */}
        <div id="sidebar-filters" className={`mt-4 space-y-4 ${isOpen ? '' : 'hidden md:block'}`}>
          <div>
            <p className={sectionTitle} id="sidebar-sort-label">
              排序
            </p>
            <div
              role="radiogroup"
              aria-labelledby="sidebar-sort-label"
              className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-dark-surface-light"
            >
              {SORT_OPTIONS.map((o) => {
                const active = sortBy === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onSortChange(o.value)}
                    className={`min-h-8 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? 'bg-white text-ink-pink shadow-sm dark:bg-dark-surface'
                        : 'text-text-light hover:text-ink dark:hover:text-dark-text'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className={sectionTitle} id="sidebar-category-label">
              分类
            </p>
            {/* 窄屏横向滑动的标签，宽屏纵向列表 */}
            <div
              role="radiogroup"
              aria-labelledby="sidebar-category-label"
              className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:pb-0"
            >
              {categoryItems.map((c) => {
                const active = currentCategory === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onCategoryChange(c.value)}
                    className={`flex shrink-0 items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors md:rounded-lg md:border-0 md:py-2 ${
                      active
                        ? 'border-accent-pink bg-primary-light/70 font-medium text-ink-pink dark:bg-accent-pink/15'
                        : 'border-gray-200 text-ink hover:bg-primary-light/40 dark:border-dark-border dark:text-dark-text dark:hover:bg-dark-surface-light'
                    }`}
                  >
                    <span className="truncate">{c.label}</span>
                    <span className="text-xs tabular-nums opacity-60">{c.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className={sectionTitle}>统计</p>
            <dl className="grid grid-cols-3 gap-2">
              {[
                { label: '总笔记', value: stats.totalNotes },
                { label: '今日创建', value: stats.createdToday },
                { label: '标签', value: stats.totalTags },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col-reverse rounded-xl bg-linear-to-br from-accent-pink/15 to-accent-purple/15 px-1 py-2 text-center dark:from-accent-pink/10 dark:to-accent-purple/10"
                >
                  <dt className="text-[11px] text-text-light">{s.label}</dt>
                  <dd className="text-lg leading-tight font-bold tabular-nums text-ink dark:text-dark-text">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

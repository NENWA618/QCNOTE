import React, { useEffect, useRef, useState } from 'react';

export type DashboardView =
  'list' | 'calendar' | 'timeline' | 'graph' | 'conflicts' | 'tags' | 'cloud';

interface DashboardToolbarProps {
  viewMode: DashboardView;
  viewingTrash: boolean;
  trashCount: number;
  conflictCount: number;
  onSelectView: (view: DashboardView) => void;
  onToggleTrash: () => void;
  onNewNote: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClearAll: () => void;
}

const VIEWS: { key: DashboardView; icon: string; label: string }[] = [
  { key: 'list', icon: '📝', label: '列表' },
  { key: 'calendar', icon: '📅', label: '日历' },
  { key: 'timeline', icon: '📊', label: '时间线' },
  { key: 'graph', icon: '🧠', label: '图谱' },
];

const menuItemClass =
  'w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left rounded-lg ' +
  'text-primary-dark hover:bg-primary-light dark:text-dark-text dark:hover:bg-dark-surface-light';

const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
  viewMode,
  viewingTrash,
  trashCount,
  conflictCount,
  onSelectView,
  onToggleTrash,
  onNewNote,
  onExport,
  onImport,
  onClearAll,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const run = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
      event.target.value = '';
    }
  };

  const isActive = (key: DashboardView) => !viewingTrash && viewMode === key;

  return (
    <div className="flex items-center gap-2 w-full md:w-auto">
      {viewingTrash ? (
        <button onClick={onToggleTrash} className="btn-secondary btn-sm flex items-center gap-1">
          ← 返回
        </button>
      ) : (
        <div
          role="group"
          aria-label="视图切换"
          className="flex flex-1 md:flex-none rounded-full p-1 gap-1 bg-white/70 border border-primary-dark/10 dark:bg-dark-surface dark:border-dark-border"
        >
          {VIEWS.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => onSelectView(key)}
              aria-pressed={isActive(key)}
              title={label}
              className={`flex flex-1 md:flex-none items-center justify-center gap-1 px-3 min-h-[2rem] rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive(key)
                  ? 'bg-gradient-to-r from-accent-pink to-accent-purple text-white shadow'
                  : 'text-primary-dark hover:bg-primary-light dark:text-dark-text dark:hover:bg-dark-surface-light'
              }`}
            >
              <span aria-hidden="true">{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="更多"
          className="btn-secondary btn-sm flex items-center gap-1 relative"
        >
          ⋯ <span className="hidden sm:inline">更多</span>
          {conflictCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[1.1rem] text-center">
              {conflictCount}
            </span>
          )}
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute left-0 md:left-auto md:right-0 z-30 mt-2 w-56 p-2 rounded-2xl bg-white border border-primary-dark/10 shadow-xl dark:bg-dark-surface dark:border-dark-border"
          >
            <button role="menuitem" className={menuItemClass} onClick={run(onToggleTrash)}>
              <span>🗑️ 回收站</span>
              {trashCount > 0 && <span className="text-xs opacity-70">{trashCount}</span>}
            </button>
            <button
              role="menuitem"
              className={menuItemClass}
              onClick={run(() => onSelectView('conflicts'))}
            >
              <span>⚠️ 冲突</span>
              {conflictCount > 0 && <span className="text-xs text-red-500">{conflictCount}</span>}
            </button>
            <button
              role="menuitem"
              className={menuItemClass}
              onClick={run(() => onSelectView('tags'))}
            >
              🏷️ 标签管理
            </button>
            <button
              role="menuitem"
              className={menuItemClass}
              onClick={run(() => onSelectView('cloud'))}
            >
              ☁️ 云端同步
            </button>

            <div className="my-2 border-t border-primary-dark/10 dark:border-dark-border" />

            <button role="menuitem" className={menuItemClass} onClick={run(onExport)}>
              📤 导出数据
            </button>
            <button
              role="menuitem"
              className={menuItemClass}
              onClick={run(() => fileInputRef.current?.click())}
            >
              📥 导入数据
            </button>

            <div className="my-2 border-t border-red-300/50" />

            <button
              role="menuitem"
              className={`${menuItemClass} !text-red-600 hover:!bg-red-50 dark:hover:!bg-red-900/30`}
              onClick={run(onClearAll)}
            >
              🗑️ 清空所有笔记…
            </button>
          </div>
        )}
      </div>

      <button
        onClick={onNewNote}
        className="btn-primary btn-sm flex items-center gap-1 whitespace-nowrap"
      >
        ➕ <span className="hidden sm:inline">新建笔记</span>
        <span className="sm:hidden">新建</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};

export default DashboardToolbar;

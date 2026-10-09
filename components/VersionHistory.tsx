import React, { useEffect, useState } from 'react';
import { NoteItem, NoteVersion } from '../lib/storage';

interface VersionHistoryProps {
  note: NoteItem | null;
  isVisible: boolean;
  onRevert: (version: NoteVersion) => void;
  onClose: () => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  note,
  isVisible,
  onRevert,
  onClose,
}) => {
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);

  // 关闭或切换笔记时清掉选中的版本，避免再次打开时显示过期内容
  const resetKey = `${isVisible}:${note?.id ?? ''}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setSelectedVersion(null);
  }

  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVisible, onClose]);

  if (!isVisible || !note || !note.versions || note.versions.length === 0) {
    return null;
  }

  const versions = [...note.versions].sort((a, b) => b.updatedAt - a.updatedAt);
  const currentVersion = {
    title: note.title,
    content: note.content,
    category: note.category,
    tags: note.tags,
    color: note.color,
    isFavorite: note.isFavorite,
    isArchived: note.isArchived,
    updatedAt: note.updatedAt,
  } as NoteVersion;

  return (
    <div className="fixed inset-0 bg-black/50 z-60 flex items-stretch md:items-center justify-center md:p-4">
      <div className="bg-white dark:bg-dark-surface md:rounded-lg shadow-2xl md:max-w-4xl w-full h-dvh md:h-128 md:max-h-[85vh] flex flex-col md:flex-row overflow-hidden md:border border-gray-200 dark:border-dark-border">
        {/* Version List */}
        <div className="md:w-72 shrink-0 max-h-[35%] md:max-h-none border-b md:border-b-0 md:border-r border-gray-200 dark:border-dark-border overflow-y-auto overscroll-contain bg-gray-50 dark:bg-dark-surface-light pt-[env(safe-area-inset-top)] md:pt-0">
          <div className="sticky top-0 bg-gray-100 dark:bg-dark-surface border-b border-gray-200 dark:border-dark-border px-4 py-3 md:p-4 z-10">
            <h3 className="font-bold text-gray-800 dark:text-dark-text">版本历史</h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-1">
              共 {versions.length + 1} 个版本
            </p>
          </div>

          {/* Current Version */}
          <button
            onClick={() => setSelectedVersion(null)}
            className={`w-full text-left px-4 py-3 md:p-4 border-b border-gray-200 dark:border-dark-border hover:bg-blue-50 dark:hover:bg-blue-900/30 transition ${
              selectedVersion === null ? 'bg-blue-100 dark:bg-blue-900/50' : ''
            }`}
          >
            <div className="font-semibold text-gray-800 dark:text-dark-text text-sm truncate">
              {currentVersion.title}
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-1">
              ✨ 当前版本 •{' '}
              {new Date(currentVersion.updatedAt).toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </button>

          {/* Historical Versions */}
          {versions.map((version, index) => (
            <button
              key={`${version.updatedAt}-${index}`}
              onClick={() => setSelectedVersion(version)}
              className={`w-full text-left px-4 py-3 md:p-4 border-b border-gray-200 dark:border-dark-border hover:bg-blue-50 dark:hover:bg-blue-900/30 transition ${
                selectedVersion === version ? 'bg-blue-100 dark:bg-blue-900/50' : ''
              }`}
            >
              <div className="font-semibold text-gray-800 dark:text-dark-text text-sm truncate">
                {version.title}
              </div>
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-1">
                v{versions.length - index} •{' '}
                {new Date(version.updatedAt).toLocaleString('zh-CN', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </button>
          ))}
        </div>

        {/* Preview Panel */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-white dark:bg-dark-surface">
          <div className="bg-gray-50 dark:bg-dark-surface-light border-b border-gray-200 dark:border-dark-border p-4">
            <h3 className="font-bold text-gray-800 dark:text-dark-text">
              {selectedVersion
                ? `预览版本 v${versions.length - versions.indexOf(selectedVersion)}`
                : '当前版本预览'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
              {selectedVersion
                ? new Date(selectedVersion.updatedAt).toLocaleString('zh-CN')
                : new Date(currentVersion.updatedAt).toLocaleString('zh-CN')}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary uppercase">
                  标题
                </label>
                <p className="text-gray-800 dark:text-dark-text mt-1">
                  {selectedVersion?.title || currentVersion.title}
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary uppercase">
                  内容预览
                </label>
                <div className="text-gray-700 dark:text-dark-text mt-1 text-sm bg-gray-50 dark:bg-dark-surface-light p-3 rounded border border-gray-200 dark:border-dark-border max-h-48 md:max-h-64 overflow-y-auto whitespace-pre-wrap wrap-break-word">
                  {(selectedVersion?.content || currentVersion.content).slice(0, 500)}
                  {(selectedVersion?.content || currentVersion.content).length > 500 && '...'}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary uppercase">
                    分类
                  </label>
                  <p className="text-gray-800 dark:text-dark-text mt-1">
                    {selectedVersion?.category || currentVersion.category}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary uppercase">
                    标签
                  </label>
                  <p className="text-gray-800 dark:text-dark-text mt-1">
                    {(selectedVersion?.tags || currentVersion.tags).join(', ') || '无'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-gray-50 dark:bg-dark-surface-light border-t border-gray-200 dark:border-dark-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-2 justify-end">
            {selectedVersion && (
              <button
                onClick={() => {
                  onRevert(selectedVersion);
                  onClose();
                }}
                className="flex-1 md:flex-none px-4 py-3 md:py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-semibold"
              >
                ↩️ 恢复此版本
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 md:flex-none px-4 py-3 md:py-2 bg-gray-300 dark:bg-dark-border text-gray-800 dark:text-dark-text rounded hover:bg-gray-400 transition text-sm font-semibold"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

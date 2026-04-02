import React, { useState } from 'react';
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
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(
    null,
  );

  if (!isVisible || !note || !note.versions || note.versions.length === 0) {
    return null;
  }

  const versions = [...note.versions].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
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
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-96 flex">
        {/* Version List */}
        <div className="w-80 border-r border-gray-200 overflow-y-auto bg-gray-50">
          <div className="sticky top-0 bg-gray-100 border-b border-gray-200 p-4">
            <h3 className="font-bold text-gray-800">版本历史</h3>
            <p className="text-xs text-gray-500 mt-1">
              共 {versions.length + 1} 个版本
            </p>
          </div>

          {/* Current Version */}
          <button
            onClick={() => setSelectedVersion(null)}
            className={`w-full text-left p-4 border-b border-gray-200 hover:bg-blue-50 transition ${
              selectedVersion === null ? 'bg-blue-100' : ''
            }`}
          >
            <div className="font-semibold text-gray-800 text-sm truncate">
              {currentVersion.title}
            </div>
            <p className="text-xs text-gray-500 mt-1">
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
              className={`w-full text-left p-4 border-b border-gray-200 hover:bg-blue-50 transition ${
                selectedVersion === version ? 'bg-blue-100' : ''
              }`}
            >
              <div className="font-semibold text-gray-800 text-sm truncate">
                {version.title}
              </div>
              <p className="text-xs text-gray-500 mt-1">
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
        <div className="flex-1 flex flex-col bg-white">
          <div className="bg-gray-50 border-b border-gray-200 p-4">
            <h3 className="font-bold text-gray-800">
              {selectedVersion
                ? `预览版本 v${
                    versions.length - versions.indexOf(selectedVersion)
                  }`
                : '当前版本预览'}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {selectedVersion
                ? new Date(selectedVersion.updatedAt).toLocaleString('zh-CN')
                : new Date(currentVersion.updatedAt).toLocaleString('zh-CN')}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">
                  标题
                </label>
                <p className="text-gray-800 mt-1">
                  {selectedVersion?.title || currentVersion.title}
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">
                  内容预览
                </label>
                <div className="text-gray-700 mt-1 text-sm bg-gray-50 p-3 rounded border border-gray-200 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {(selectedVersion?.content || currentVersion.content).slice(
                    0,
                    500,
                  )}
                  {(selectedVersion?.content || currentVersion.content)
                    .length > 500 && '...'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    分类
                  </label>
                  <p className="text-gray-800 mt-1">
                    {selectedVersion?.category || currentVersion.category}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">
                    标签
                  </label>
                  <p className="text-gray-800 mt-1">
                    {(
                      selectedVersion?.tags ||
                      currentVersion.tags
                    ).join(', ') || '无'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-gray-50 border-t border-gray-200 p-4 flex gap-2 justify-end">
            {selectedVersion && (
              <button
                onClick={() => {
                  onRevert(selectedVersion);
                  onClose();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-semibold"
              >
                ↩️ 恢复此版本
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition text-sm font-semibold"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

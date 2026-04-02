import React, { useState, useEffect } from 'react';
import { NoteItem } from '../lib/storage';

interface TrashProps {
  trashNotes: NoteItem[];
  onRestore: (id: string) => void;
  onPermanentlyDelete: (id: string) => void;
}

export const Trash: React.FC<TrashProps> = ({
  trashNotes,
  onRestore,
  onPermanentlyDelete,
}) => {
  if (trashNotes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        <div className="text-center">
          <p className="text-lg">🗑️ 回收站是空的</p>
          <p className="text-sm mt-2">已删除的笔记将在这里显示</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800">
          🗑️ 回收站 ({trashNotes.length})
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          删除的笔记可在{' '}
          <span className="text-red-500">30天后</span>
          永久删除
        </p>
      </div>

      <div className="space-y-2">
        {trashNotes.map((note) => (
          <div
            key={note.id}
            className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-800 truncate">
                {note.title}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                {note.category} •{' '}
                {note.deletedAt
                  ? new Date(note.deletedAt).toLocaleDateString('zh-CN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '未知时间'}
              </p>
            </div>

            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => onRestore(note.id)}
                className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition"
                title="还原此笔记"
              >
                ↩️ 还原
              </button>
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      '确定要永久删除此笔记吗？此操作无法撤销。',
                    )
                  ) {
                    onPermanentlyDelete(note.id);
                  }
                }}
                className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition"
                title="永久删除"
              >
                🗑️ 完全删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

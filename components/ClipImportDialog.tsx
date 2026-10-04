import React, { useEffect, useState } from 'react';
import type { ClipPayload } from '../lib/clipImport';

interface ClipImportDialogProps {
  clip: ClipPayload | null;
  onConfirm: (clip: ClipPayload) => Promise<void> | void;
  onDiscard: () => void;
}

const PREVIEW_LENGTH = 600;

/**
 * 浏览器扩展剪藏的确认框。剪藏数据来自 URL hash，任何链接都可能带有，
 * 所以必须先展示给用户，确认后才会写入笔记。
 */
export default function ClipImportDialog({ clip, onConfirm, onDiscard }: ClipImportDialogProps) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSaving(false);
  }, [clip]);

  if (!clip) return null;

  const preview =
    clip.content.length > PREVIEW_LENGTH
      ? `${clip.content.slice(0, PREVIEW_LENGTH)}…`
      : clip.content;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(clip);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="clip-import-title"
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6"
      >
        <h2
          id="clip-import-title"
          className="text-lg font-semibold mb-1 text-gray-900 dark:text-white"
        >
          保存网页剪藏？
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          内容来自浏览器扩展或一个链接，请确认后再保存到你的笔记。
        </p>
        <p className="font-medium text-gray-900 dark:text-white break-words">{clip.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 break-all mb-3">{clip.url}</p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 rounded p-3 mb-4">
          {preview}
        </pre>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="px-4 py-2 rounded text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700 hover:opacity-80 disabled:opacity-50"
          >
            放弃
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存为笔记'}
          </button>
        </div>
      </div>
    </div>
  );
}

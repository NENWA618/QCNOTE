import React from 'react';
import { confirmDialog } from '../../lib/dialog';
import { suspensionMessage, type PublicSuspensionNotice } from '../../lib/publicNotes';
import type { PublishedNoteInfo } from '../../types/ugc-types';

interface EditorHeaderProps {
  noteId: string;
  dirty: boolean;
  sentimentLabel: string;
  modLabel: string;
  isPreview: boolean;
  /** 宽屏时才有分屏开关 */
  canSplit: boolean;
  splitPref: boolean;
  versionCount: number;
  /** 登录用户才有发布按钮 */
  canPublish: boolean;
  canUnpublish: boolean;
  publishInfo?: PublishedNoteInfo;
  publishSuspension?: PublicSuspensionNotice | null;
  publishBusy: boolean;
  publishError: string | null;
  unpublishedChanges: boolean;
  onCancel: () => void;
  onSave: () => void;
  onTogglePreview: () => void;
  onToggleSplit: () => void;
  onShowHistory: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: (id: string) => void;
}

const ACTIVE_TOGGLE = 'bg-ink dark:bg-accent-pink text-white';
const SUSPENDED_TITLE = '你的个人主页和公开笔记已被管理员关闭';

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  noteId,
  dirty,
  sentimentLabel,
  modLabel,
  isPreview,
  canSplit,
  splitPref,
  versionCount,
  canPublish,
  canUnpublish,
  publishInfo,
  publishSuspension,
  publishBusy,
  publishError,
  unpublishedChanges,
  onCancel,
  onSave,
  onTogglePreview,
  onToggleSplit,
  onShowHistory,
  onPublish,
  onUnpublish,
  onDelete,
}) => {
  const suspended = Boolean(publishSuspension);

  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: '删除这篇笔记？',
      description: '它将被移到回收站，之后仍可以在回收站里还原。',
      confirmLabel: '移到回收站',
      tone: 'danger',
    });
    if (ok) onDelete(noteId);
  };

  return (
    <div className="shrink-0 border-b border-gray-200 dark:border-dark-border px-4 py-3 sm:p-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="note-editor-title"
            className="flex items-center gap-2 text-lg sm:text-2xl font-bold text-ink dark:text-dark-text"
          >
            {noteId ? '编辑笔记' : '新建笔记'}
            {dirty && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                未保存
              </span>
            )}
          </h2>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
            {sentimentLabel}
            {publishInfo && !publishSuspension && (
              <span className="ml-3 text-green-600 dark:text-green-400">
                🌐 已公开{unpublishedChanges ? '（有未发布的更改）' : ''}
              </span>
            )}
          </div>
          {publishSuspension && (
            <div
              role="status"
              className="text-sm text-amber-700 dark:text-amber-300 mt-1 break-words"
            >
              {suspensionMessage(publishSuspension)}
            </div>
          )}
          {publishError && !publishSuspension && (
            <div className="text-sm text-red-600 dark:text-red-300 mt-1">{publishError}</div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={onCancel} className="btn-secondary btn-sm" title="关闭 (Esc)">
            取消
          </button>
          <button
            onClick={onSave}
            className="btn-primary btn-sm"
            title={`保存并关闭（${modLabel}+S 保存并继续编辑）`}
          >
            保存
          </button>
        </div>
      </div>

      {/* 次要操作：移动端横向滚动，桌面端自动换行 */}
      <div className="flex gap-2 mt-3 overflow-x-auto sm:overflow-visible sm:flex-wrap -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0 *:shrink-0 *:whitespace-nowrap">
        <button
          onClick={onTogglePreview}
          title="切换编辑/预览 (Ctrl/Cmd+Shift+P)"
          className={`btn-secondary btn-sm ${isPreview ? ACTIVE_TOGGLE : ''}`}
        >
          {isPreview ? '编辑' : '预览'}
        </button>
        {canSplit && !isPreview && (
          <button
            type="button"
            onClick={onToggleSplit}
            aria-pressed={splitPref}
            title="左边写、右边实时预览"
            className={`btn-secondary btn-sm ${splitPref ? ACTIVE_TOGGLE : ''}`}
          >
            分屏
          </button>
        )}
        {versionCount > 0 && (
          <button onClick={onShowHistory} className="btn-secondary btn-sm" title="查看版本历史">
            ⏱️ 历史 ({versionCount})
          </button>
        )}
        {canPublish && noteId && (
          <>
            <button
              onClick={onPublish}
              disabled={publishBusy || suspended}
              className="btn-secondary btn-sm"
              title={suspended ? SUSPENDED_TITLE : '把这篇笔记的副本公开到你的个人主页'}
            >
              {publishBusy ? '处理中…' : publishInfo ? '更新发布' : '发布到主页'}
            </button>
            {publishInfo && canUnpublish && (
              <button
                onClick={onUnpublish}
                disabled={publishBusy || suspended}
                className="btn-secondary btn-sm"
                title={suspended ? SUSPENDED_TITLE : undefined}
              >
                取消发布
              </button>
            )}
          </>
        )}
        {noteId && (
          <button onClick={handleDelete} className="btn-danger btn-sm">
            删除
          </button>
        )}
      </div>
    </div>
  );
};

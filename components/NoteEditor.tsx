import React, { useState, useEffect, useRef } from 'react';
import type { Pluggable } from 'unified';
import SentimentUtil from '../lib/sentiment';
import { NoteItem, NoteVersion, ColoredRange } from '../lib/storage';
import TextColorUtils from '../lib/textColorUtils';
import { VersionHistory } from './VersionHistory';
import ColoredMarkdown from './ColoredMarkdown';
import { hasUnpublishedChanges, type PublishResult } from '../lib/publicNotes';
import type { PublishedNoteInfo } from '../types/ugc-types';

interface NoteEditorProps {
  note: NoteItem | null;
  isVisible: boolean;
  isPreview: boolean;
  relatedNotes?: NoteItem[];
  onSave: () => void;
  onCancel: () => void;
  onChange: (field: keyof NoteItem, value: NoteItem[keyof NoteItem]) => void;
  onTogglePreview: () => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onOpenRelatedNote?: (note: NoteItem) => void;
  onRevertVersion?: (version: NoteVersion) => void;
  /** 仅登录用户传入；未传入时不显示发布按钮 */
  onPublish?: (note: NoteItem) => Promise<PublishResult>;
  onUnpublish?: (localNoteId: string) => Promise<PublishResult>;
  publishInfo?: PublishedNoteInfo;
}

const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  isVisible,
  isPreview,
  relatedNotes = [],
  onSave,
  onCancel,
  onChange,
  onTogglePreview,
  onDelete,
  onToggleFavorite,
  onToggleArchive,
  onOpenRelatedNote,
  onRevertVersion,
  onPublish,
  onUnpublish,
  publishInfo,
}) => {
  const [localNote, setLocalNote] = useState<NoteItem | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>('#ff6b6b');
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalNote(note);
  }, [note]);

  useEffect(() => {
    setPublishError(null);
  }, [note?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!localNote) {
      return;
    }

    const sentiment = SentimentUtil.analyzeEmotion(`${localNote.title} ${localNote.content}`);
    const payload = {
      noteId: localNote.id,
      score: sentiment.score,
      comparative: sentiment.comparative,
      title: localNote.title,
    };

    const debounceId = window.setTimeout(() => {
      try {
        window.dispatchEvent(new CustomEvent('qcnote:sentiment-update', { detail: payload }));
      } catch (e) {
        console.warn('[NoteEditor] 无法更新情感状态', e);
      }
    }, 800);

    return () => {
      window.clearTimeout(debounceId);
    };
  }, [localNote?.id, localNote?.title, localNote?.content, localNote]);

  const isOpen = isVisible && !!localNote;

  // 打开时锁定背景滚动，避免移动端滑动穿透到下方列表
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // 桌面端快捷键：Ctrl/Cmd+S 保存，Ctrl/Cmd+Shift+P 切换预览
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        onSave();
      } else if (key === 'p' && e.shiftKey) {
        e.preventDefault();
        onTogglePreview();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onSave, onTogglePreview]);

  if (!isVisible || !localNote) return null;

  const handleFieldChange = (field: keyof NoteItem, value: NoteItem[keyof NoteItem]) => {
    // 函数式更新：同一轮事件里连续调用（如恢复版本）时，不会互相覆盖
    setLocalNote((prev) => (prev ? { ...prev, [field]: value } : prev));
    onChange(field, value);
  };

  const handlePublish = async () => {
    if (!onPublish) return;
    if (!localNote.content.trim()) {
      setPublishError('笔记内容为空，无法发布');
      return;
    }
    const message = publishInfo
      ? '将用当前内容更新已公开的版本。\n更新后，任何人都能在你的个人主页看到新内容。是否继续？'
      : '发布后，这篇笔记的标题和正文会以明文保存在服务器上，并显示在你的个人主页，任何人（包括未登录的访客）都能看到。\n\n发布的是此刻内容的一份副本，之后修改本地笔记不会自动同步；你可以随时取消发布并删除这份副本。\n\n确定要发布吗？';
    if (!window.confirm(message)) return;

    setPublishBusy(true);
    setPublishError(null);
    const result = await onPublish(localNote);
    setPublishBusy(false);
    if (!result.ok) setPublishError(result.error);
  };

  const handleUnpublish = async () => {
    if (!onUnpublish) return;
    if (!window.confirm('取消发布后，服务器上的公开副本会被删除，别人将无法再访问。是否继续？')) {
      return;
    }
    setPublishBusy(true);
    setPublishError(null);
    const result = await onUnpublish(localNote.id);
    setPublishBusy(false);
    if (!result.ok) setPublishError(result.error);
  };

  const handleTogglePreview = () => {
    setSelectionStart(null);
    setSelectionEnd(null);
    onTogglePreview();
  };

  const unpublishedChanges = hasUnpublishedChanges(localNote, publishInfo);

  // Handle text selection in the content textarea
  const handleTextSelection = () => {
    if (!contentTextareaRef.current) return;

    const start = contentTextareaRef.current.selectionStart;
    const end = contentTextareaRef.current.selectionEnd;

    if (start !== end) {
      setSelectionStart(start);
      setSelectionEnd(end);
    } else {
      // Clear selection if no text is selected
      setSelectionStart(null);
      setSelectionEnd(null);
    }
  };

  // Apply color to selected text
  const applyColorToSelection = (color: string) => {
    if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) {
      return;
    }

    if (!localNote) return;

    const updatedRanges = TextColorUtils.applyColorToSelection(
      selectionStart,
      selectionEnd,
      color,
      localNote.coloredRanges || [],
    );

    handleFieldChange('coloredRanges', updatedRanges);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  // Clear color from selected text
  const clearColorFromSelection = () => {
    if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) {
      return;
    }

    if (!localNote) return;

    const updatedRanges = TextColorUtils.clearColorInSelection(
      selectionStart,
      selectionEnd,
      localNote.coloredRanges || [],
    );

    handleFieldChange('coloredRanges', updatedRanges);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const categories = ['生活', '工作', '学习', '灵感', '其他'];
  const colors = [
    '#ff6b6b',
    '#4ecdc4',
    '#45b7d1',
    '#96ceb4',
    '#ffeaa7',
    '#dda0dd',
    '#98d8c8',
    '#f7dc6f',
    '#bb8fce',
    '#85c1e9',
  ];

  const currentSentiment = SentimentUtil.analyzeEmotion(`${localNote.title} ${localNote.content}`);
  const currentSentimentCategory = SentimentUtil.getSentimentCategory(
    currentSentiment.score,
    currentSentiment.comparative,
  );
  const sentimentLabel = `当前情绪：${
    currentSentimentCategory === 'positive'
      ? '正面'
      : currentSentimentCategory === 'negative'
        ? '低落'
        : '平静'
  }`;

  const forwardLinks = (localNote.links || [])
    .map((title) => relatedNotes.find((note) => note.title === title))
    .filter(Boolean) as NoteItem[];

  const backlinkNotes = (localNote.backlinks || [])
    .map((id) => relatedNotes.find((note) => note.id === id))
    .filter(Boolean) as NoteItem[];

  const unresolvedForwardLinks = (localNote.links || []).filter(
    (title) => !forwardLinks.some((note) => note.title === title),
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-stretch sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-dark-surface sm:rounded-lg shadow-xl w-full sm:max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden sm:border border-gray-200 dark:border-dark-border">
        {/* Header */}
        <div className="shrink-0 border-b border-gray-200 dark:border-dark-border px-4 py-3 sm:p-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold text-primary-dark dark:text-dark-text">
                {localNote.id ? '编辑笔记' : '新建笔记'}
              </h2>
              <div className="text-xs sm:text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
                {sentimentLabel}
                {publishInfo && (
                  <span className="ml-3 text-green-600 dark:text-green-400">
                    🌐 已公开{unpublishedChanges ? '（有未发布的更改）' : ''}
                  </span>
                )}
              </div>
              {publishError && (
                <div className="text-sm text-red-600 dark:text-red-300 mt-1">{publishError}</div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={onCancel} className="btn-secondary btn-sm">
                取消
              </button>
              <button onClick={onSave} className="btn-primary btn-sm" title="保存 (Ctrl/Cmd+S)">
                保存
              </button>
            </div>
          </div>

          {/* 次要操作：移动端横向滚动，桌面端自动换行 */}
          <div className="flex gap-2 mt-3 overflow-x-auto sm:overflow-visible sm:flex-wrap -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0 [&>*]:shrink-0 [&>*]:whitespace-nowrap">
            <button
              onClick={handleTogglePreview}
              title="切换编辑/预览 (Ctrl/Cmd+Shift+P)"
              className={`btn-secondary btn-sm ${isPreview ? 'bg-primary-dark dark:bg-accent-pink text-white' : ''}`}
            >
              {isPreview ? '编辑' : '预览'}
            </button>
            {localNote.versions && localNote.versions.length > 0 && (
              <button
                onClick={() => setShowVersionHistory(true)}
                className="btn-secondary btn-sm"
                title="查看版本历史"
              >
                ⏱️ 历史 ({localNote.versions.length})
              </button>
            )}
            {onPublish && localNote.id && (
              <>
                <button
                  onClick={handlePublish}
                  disabled={publishBusy}
                  className="btn-secondary btn-sm"
                  title="把这篇笔记的副本公开到你的个人主页"
                >
                  {publishBusy ? '处理中…' : publishInfo ? '更新发布' : '发布到主页'}
                </button>
                {publishInfo && onUnpublish && (
                  <button
                    onClick={handleUnpublish}
                    disabled={publishBusy}
                    className="btn-secondary btn-sm"
                  >
                    取消发布
                  </button>
                )}
              </>
            )}
            {localNote?.id && (
              <button
                onClick={() => {
                  if (window.confirm('确定要删除此笔记吗？它将被移到回收站。')) {
                    onDelete(localNote.id);
                  }
                }}
                className="btn-danger btn-sm"
              >
                删除
              </button>
            )}
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex flex-1 min-h-0 sm:h-[calc(90vh-9rem)]">
          {/* Editor Panel */}
          {!isPreview && (
            <div className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto overscroll-contain dark:bg-dark-surface">
              {/* Title */}
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-700 dark:text-dark-text">
                  标题
                </label>
                <input
                  type="text"
                  value={localNote.title}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  placeholder="笔记标题"
                  className="w-full text-xl sm:text-2xl font-bold border-none outline-none bg-transparent dark:text-dark-text dark:placeholder-dark-text-secondary"
                />
              </div>

              {/* Content */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
                  内容 (支持 Markdown 和 LaTeX 公式语法)
                </label>
                {selectionStart !== null &&
                  selectionEnd !== null &&
                  selectionStart !== selectionEnd && (
                    // onMouseDown 阻止默认行为，避免点击颜色时文本框失焦丢失选区
                    <div
                      className="flex flex-wrap gap-2 items-center mb-2 p-2 rounded bg-gray-50 dark:bg-dark-surface-light"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
                        已选中 {selectionEnd - selectionStart} 字符
                      </span>
                      {colors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => applyColorToSelection(color)}
                          className="w-8 h-8 sm:w-6 sm:h-6 rounded border border-gray-300 dark:border-dark-border hover:border-gray-800 dark:hover:border-gray-400 transition"
                          style={{ backgroundColor: color }}
                          title={`应用${color}颜色`}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={clearColorFromSelection}
                        className="text-xs px-3 py-2 sm:px-2 sm:py-1 bg-gray-200 dark:bg-dark-border hover:bg-gray-300 rounded transition"
                        title="清除颜色"
                      >
                        清除
                      </button>
                    </div>
                  )}
                <textarea
                  ref={contentTextareaRef}
                  value={localNote.content}
                  onChange={(e) => handleFieldChange('content', e.target.value)}
                  onSelect={handleTextSelection}
                  onMouseUp={handleTextSelection}
                  onKeyUp={handleTextSelection}
                  onTouchEnd={handleTextSelection}
                  placeholder="开始记录您的想法... (支持 Markdown 和 LaTeX 公式语法)"
                  className="w-full h-[45dvh] min-h-48 sm:h-80 resize-y border rounded p-2 outline-none bg-white dark:bg-dark-surface-light font-mono text-base sm:text-sm border-gray-300 dark:border-dark-border text-gray-800 dark:text-dark-text"
                />
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">
                    分类
                  </label>
                  <select
                    value={localNote.category}
                    onChange={(e) => handleFieldChange('category', e.target.value)}
                    className="w-full p-2 border rounded text-base sm:text-sm dark:bg-dark-surface-light dark:border-dark-border dark:text-dark-text"
                  >
                    <option value="">选择分类</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">
                    颜色主题
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => handleFieldChange('color', color)}
                        className={`w-8 h-8 rounded-full border-2 ${
                          localNote.color === color
                            ? 'border-gray-800 dark:border-white'
                            : 'border-gray-300 dark:border-dark-border'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">
                  标签 (用逗号分隔)
                </label>
                <input
                  type="text"
                  value={localNote.tags.join(', ')}
                  onChange={(e) =>
                    handleFieldChange(
                      'tags',
                      e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter((t) => t),
                    )
                  }
                  placeholder="标签1, 标签2, 标签3"
                  className="w-full p-2 border rounded text-base sm:text-sm dark:bg-dark-surface-light dark:border-dark-border dark:text-dark-text"
                />
              </div>

              {/* Options */}
              <div className="flex gap-6 dark:text-dark-text">
                <label className="flex items-center min-h-[2.25rem]">
                  <input
                    type="checkbox"
                    checked={localNote.isFavorite}
                    onChange={(e) => handleFieldChange('isFavorite', e.target.checked)}
                    className="mr-2"
                  />
                  收藏
                </label>
                <label className="flex items-center min-h-[2.25rem]">
                  <input
                    type="checkbox"
                    checked={localNote.isArchived}
                    onChange={(e) => handleFieldChange('isArchived', e.target.checked)}
                    className="mr-2"
                  />
                  归档
                </label>
              </div>
            </div>
          )}

          {/* Preview Panel */}
          {isPreview && (
            <div className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto overscroll-contain dark:text-dark-text">
              <h1
                className="text-2xl sm:text-3xl font-bold mb-4 break-words"
                style={{ color: localNote.color }}
              >
                {localNote.title || '无标题'}
              </h1>

              <div className="mb-3 text-sm text-gray-600 dark:text-dark-text-secondary">
                <span className="inline-flex items-center gap-1 mr-3">
                  🔗 引用: {localNote.links?.length ?? 0}
                </span>
                <span className="inline-flex items-center gap-1">
                  ↩️ 被引用: {localNote.backlinks?.length ?? 0}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 mb-4">
                <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface-light p-4">
                  <div className="text-sm font-semibold mb-2">引用笔记</div>
                  {forwardLinks.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {forwardLinks.map((linkedNote) => (
                        <li key={linkedNote.id}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenRelatedNote?.(linkedNote);
                            }}
                            className="text-primary-dark hover:text-accent-pink transition"
                          >
                            {linkedNote.title || '无标题'}
                          </button>
                        </li>
                      ))}
                      {unresolvedForwardLinks.length > 0 && (
                        <li className="text-gray-500 dark:text-dark-text-secondary">
                          未匹配笔记: {unresolvedForwardLinks.join('、')}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <div className="text-gray-500 dark:text-dark-text-secondary">
                      还未引用其他笔记。
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface-light p-4">
                  <div className="text-sm font-semibold mb-2">被引用笔记</div>
                  {backlinkNotes.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {backlinkNotes.map((linkedNote) => (
                        <li key={linkedNote.id}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenRelatedNote?.(linkedNote);
                            }}
                            className="text-primary-dark hover:text-accent-pink transition"
                          >
                            {linkedNote.title || '无标题'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-gray-500 dark:text-dark-text-secondary">
                      暂时没有其他笔记引用此笔记。
                    </div>
                  )}
                </div>
              </div>
              {localNote.versions && localNote.versions.length > 0 && (
                <div className="mb-4 p-3 border border-gray-200 dark:border-dark-border rounded bg-gray-50 dark:bg-dark-surface-light text-xs">
                  最近版本：{localNote.versions.length} 次，最早版本{' '}
                  {new Date(localNote.versions[0].updatedAt).toLocaleString()}
                </div>
              )}

              <div className="prose dark:prose-invert md:prose-lg max-w-none break-words overflow-x-auto">
                <ColoredMarkdown
                  content={localNote.content}
                  coloredRanges={localNote.coloredRanges}
                />
              </div>

              {/* Metadata in Preview */}
              <div className="mt-6 pt-4 border-t dark:border-dark-border text-sm text-gray-500 dark:text-dark-text-secondary">
                {localNote.category && <span className="mr-4">📁 {localNote.category}</span>}
                {localNote.tags.length > 0 && (
                  <span className="mr-4">🏷️ {localNote.tags.join(', ')}</span>
                )}
                {localNote.isFavorite && <span className="mr-4">⭐ 已收藏</span>}
                {localNote.isArchived && <span className="mr-4">📦 已归档</span>}
              </div>

              {relatedNotes.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-dark-surface-light rounded border border-gray-200 dark:border-dark-border">
                  <p className="text-sm font-semibold mb-2">相关笔记</p>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    {relatedNotes.slice(0, 5).map((related) => (
                      <li key={related.id}>{related.title || '无标题'}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <VersionHistory
        note={localNote}
        isVisible={showVersionHistory}
        onRevert={(version) => {
          if (onRevertVersion) {
            onRevertVersion(version);
            handleFieldChange('title', version.title);
            handleFieldChange('content', version.content);
            handleFieldChange('category', version.category);
            handleFieldChange('tags', version.tags);
            handleFieldChange('color', version.color);
            handleFieldChange('coloredRanges', version.coloredRanges);
            handleFieldChange('isFavorite', version.isFavorite);
            handleFieldChange('isArchived', version.isArchived);
          }
        }}
        onClose={() => setShowVersionHistory(false)}
      />
    </div>
  );
};

export default NoteEditor;

import React, { useState, useEffect, useRef } from 'react';
import type { Pluggable } from 'unified';
import SentimentUtil from '../lib/sentiment';
import { NoteItem, NoteVersion, ColoredRange } from '../lib/storage';
import TextColorUtils from '../lib/textColorUtils';
import { VersionHistory } from './VersionHistory';
import ColoredMarkdown from './ColoredMarkdown';

interface NoteEditorProps {
  note: NoteItem | null;
  isVisible: boolean;
  isPreview: boolean;
  relatedNotes?: NoteItem[];
  onSave: () => void;
  onCancel: () => void;
  onChange: (field: keyof NoteItem, value: any) => void;
  onTogglePreview: () => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onOpenRelatedNote?: (note: NoteItem) => void;
  onRevertVersion?: (version: NoteVersion) => void;
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
}) => {
  const [localNote, setLocalNote] = useState<NoteItem | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>('#ff6b6b');
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalNote(note);
  }, [note]);

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

  if (!isVisible || !localNote) return null;

  const handleFieldChange = (field: keyof NoteItem, value: any) => {
    const updatedNote = { ...localNote, [field]: value };
    setLocalNote(updatedNote);
    onChange(field, value);
  };

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-200 dark:border-dark-border">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-dark-border">
          <div>
            <h2 className="text-2xl font-bold text-primary-dark dark:text-dark-text">
              {localNote.id ? '编辑笔记' : '新建笔记'}
            </h2>
            <div className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
              {sentimentLabel}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {localNote.versions && localNote.versions.length > 0 && (
              <button
                onClick={() => setShowVersionHistory(true)}
                className="btn-secondary btn-sm"
                title="查看版本历史"
              >
                ⏱️ 历史 ({localNote.versions.length})
              </button>
            )}
            <button
              onClick={onTogglePreview}
              className={`btn-secondary btn-sm ${isPreview ? 'bg-primary-dark dark:bg-accent-pink text-white' : ''}`}
            >
              {isPreview ? '编辑' : '预览'}
            </button>
            {localNote?.id && (
              <>
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
              </>
            )}
            <button onClick={onCancel} className="btn-secondary btn-sm">
              取消
            </button>
            <button onClick={onSave} className="btn-primary btn-sm">
              保存
            </button>
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex h-[calc(90vh-120px)]">
          {/* Editor Panel */}
          {!isPreview && (
            <div className="flex-1 p-6 overflow-y-auto dark:bg-dark-surface">
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
                  className="w-full text-2xl font-bold border-none outline-none bg-transparent dark:text-dark-text dark:placeholder-dark-text-secondary"
                />
              </div>

              {/* Content */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-dark-text">
                    内容 (支持 Markdown 和 LaTeX 公式语法)
                  </label>
                  {selectionStart !== null &&
                    selectionEnd !== null &&
                    selectionStart !== selectionEnd && (
                      <div className="flex gap-1 items-center">
                        <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
                          已选中 {selectionEnd - selectionStart} 字符
                        </span>
                        <div className="flex gap-1 ml-2">
                          {colors.map((color) => (
                            <button
                              key={color}
                              onClick={() => applyColorToSelection(color)}
                              className="w-6 h-6 rounded border border-gray-300 dark:border-dark-border hover:border-gray-800 dark:hover:border-gray-400 transition"
                              style={{ backgroundColor: color }}
                              title={`应用${color}颜色`}
                            />
                          ))}
                          <button
                            onClick={clearColorFromSelection}
                            className="text-xs px-2 py-1 bg-gray-200 dark:bg-dark-surface-light hover:bg-gray-300 dark:hover:bg-dark-border rounded transition"
                            title="清除颜色"
                          >
                            清除
                          </button>
                        </div>
                      </div>
                    )}
                </div>
                <textarea
                  ref={contentTextareaRef}
                  value={localNote.content}
                  onChange={(e) => handleFieldChange('content', e.target.value)}
                  onSelect={handleTextSelection}
                  onMouseUp={handleTextSelection}
                  onKeyUp={handleTextSelection}
                  placeholder="开始记录您的想法... (支持 Markdown 和 LaTeX 公式语法)"
                  className="w-full h-64 resize-none border rounded p-2 outline-none bg-white dark:bg-dark-surface-light font-mono text-sm border-gray-300 dark:border-dark-border text-gray-800 dark:text-dark-text"
                />
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-1">
                    分类
                  </label>
                  <select
                    value={localNote.category}
                    onChange={(e) => handleFieldChange('category', e.target.value)}
                    className="w-full p-2 border rounded"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">颜色主题</label>
                  <div className="flex gap-2">
                    {colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => handleFieldChange('color', color)}
                        className={`w-8 h-8 rounded-full border-2 ${
                          localNote.color === color ? 'border-gray-800' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full p-2 border rounded"
                />
              </div>

              {/* Options */}
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={localNote.isFavorite}
                    onChange={(e) => handleFieldChange('isFavorite', e.target.checked)}
                    className="mr-2"
                  />
                  收藏
                </label>
                <label className="flex items-center">
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
            <div className="flex-1 p-6 overflow-y-auto border-l">
              <h1 className="text-3xl font-bold mb-4" style={{ color: localNote.color }}>
                {localNote.title || '无标题'}
              </h1>

              <div className="mb-3 text-sm text-gray-600">
                <span className="inline-flex items-center gap-1 mr-3">
                  🔗 引用: {localNote.links?.length ?? 0}
                </span>
                <span className="inline-flex items-center gap-1">
                  ↩️ 被引用: {localNote.backlinks?.length ?? 0}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 mb-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
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
                        <li className="text-gray-500">
                          未匹配笔记: {unresolvedForwardLinks.join('、')}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <div className="text-gray-500">还未引用其他笔记。</div>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
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
                    <div className="text-gray-500">暂时没有其他笔记引用此笔记。</div>
                  )}
                </div>
              </div>
              {localNote.versions && localNote.versions.length > 0 && (
                <div className="mb-4 p-3 border border-gray-200 rounded bg-gray-50 text-xs">
                  最近版本：{localNote.versions.length} 次，最早版本{' '}
                  {new Date(localNote.versions[0].updatedAt).toLocaleString()}
                </div>
              )}

              <div className="prose prose-lg max-w-none">
                <ColoredMarkdown
                  content={localNote.content}
                  coloredRanges={localNote.coloredRanges}
                />
              </div>

              {/* Metadata in Preview */}
              <div className="mt-6 pt-4 border-t text-sm text-gray-500">
                {localNote.category && <span className="mr-4">📁 {localNote.category}</span>}
                {localNote.tags.length > 0 && (
                  <span className="mr-4">🏷️ {localNote.tags.join(', ')}</span>
                )}
                {localNote.isFavorite && <span className="mr-4">⭐ 已收藏</span>}
                {localNote.isArchived && <span className="mr-4">📦 已归档</span>}
              </div>

              {relatedNotes.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
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

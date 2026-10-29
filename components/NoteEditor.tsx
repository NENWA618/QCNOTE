import React, { useState, useEffect, useRef, useCallback, useDeferredValue, useMemo } from 'react';
import { confirmDialog } from '../lib/dialog';
import { isImeComposing } from '../lib/ime';
import { useFocusTrap } from '../lib/hooks/useFocusTrap';
import { useLocalStorageFlag } from '../lib/hooks/useLocalStorageFlag';
import { useMediaQuery } from '../lib/hooks/useMediaQuery';
import { useModKeyLabel } from '../lib/hooks/useModKeyLabel';
import {
  continueList,
  indentSelection,
  insertLink,
  toggleWrap,
  type TextEdit,
} from '../lib/markdownEditing';
import { computeTextStats } from '../lib/textStats';
import { NoteItem, NoteVersion } from '../lib/storage';
import TextColorUtils from '../lib/textColorUtils';
import { VersionHistory } from './VersionHistory';
import {
  hasUnpublishedChanges,
  type PublicSuspensionNotice,
  type PublishResult,
} from '../lib/publicNotes';
import type { PublishedNoteInfo } from '../types/ugc-types';
import { ColorSelectionBar } from './note-editor/ColorSelectionBar';
import { EditorHeader } from './note-editor/EditorHeader';
import { createFormatActions, type FormatAction } from './note-editor/formatActions';
import { FormatToolbar } from './note-editor/FormatToolbar';
import { MetadataFields } from './note-editor/MetadataFields';
import { PreviewPanel } from './note-editor/PreviewPanel';
import { SplitPreview } from './note-editor/SplitPreview';
import { StatusBar } from './note-editor/StatusBar';
import { useNoteSentiment } from './note-editor/useNoteSentiment';
import { usePublishActions } from './note-editor/usePublishActions';
import { useWikiLinkCompletion } from './note-editor/useWikiLinkCompletion';
import { WikiSuggestionList } from './note-editor/WikiSuggestionList';
import { applyEditToTextarea, noteFingerprint, parseTags, sameTags } from './note-editor/utils';

interface NoteEditorProps {
  note: NoteItem | null;
  isVisible: boolean;
  isPreview: boolean;
  relatedNotes?: NoteItem[];
  /** 全部笔记，用于输入 `[[` 时补全标题；不传则不提供补全 */
  allNotes?: NoteItem[];
  /**
   * 保存。`keepOpen` 为 true（Ctrl/Cmd+S）时保存后不关闭编辑器。
   * 返回 false 表示保存失败，编辑器会继续显示“未保存”。
   */
  onSave: (options?: { keepOpen?: boolean }) => void | boolean | Promise<void | boolean>;
  onCancel: () => void;
  onChange: (field: keyof NoteItem, value: NoteItem[keyof NoteItem]) => void;
  onTogglePreview: () => void;
  onDelete: (id: string) => void;
  onOpenRelatedNote?: (note: NoteItem) => void;
  onRevertVersion?: (version: NoteVersion) => void;
  /** 仅登录用户传入；未传入时不显示发布按钮 */
  onPublish?: (note: NoteItem) => Promise<PublishResult>;
  onUnpublish?: (localNoteId: string) => Promise<PublishResult>;
  publishInfo?: PublishedNoteInfo;
  /** 非空表示管理员关闭了该用户的主页和公开笔记：发布相关按钮置灰并说明原因 */
  publishSuspension?: PublicSuspensionNotice | null;
}

const SPLIT_PREF_KEY = 'qcnote:editor-split';
const EMPTY_NOTES: NoteItem[] = [];

const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  isVisible,
  isPreview,
  relatedNotes = EMPTY_NOTES,
  allNotes,
  onSave,
  onCancel,
  onChange,
  onTogglePreview,
  onDelete,
  onOpenRelatedNote,
  onRevertVersion,
  onPublish,
  onUnpublish,
  publishInfo,
  publishSuspension,
}) => {
  const [localNote, setLocalNote] = useState<NoteItem | null>(note);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  // 标签输入框保留原始文本：原来每次输入都 split + join，刚打出的逗号会被立刻吃掉，没法输入第二个标签
  const [tagsText, setTagsText] = useState(() => note?.tags.join(', ') ?? '');
  // 打开时的内容快照，用来判断关闭前有没有未保存的更改
  const [snapshot, setSnapshot] = useState(() => noteFingerprint(note));

  const publish = usePublishActions({
    note: localNote,
    onPublish,
    onUnpublish,
    publishInfo,
    suspension: publishSuspension,
  });

  // 跟随外部传入的 note（渲染期调整：比在 effect 里同步 setState 少一次多余渲染）
  const [prevNote, setPrevNote] = useState(note);
  if (prevNote !== note) {
    setPrevNote(note);
    setLocalNote(note);
    if (!prevNote || prevNote.id !== note?.id) {
      publish.clearError();
      setSnapshot(noteFingerprint(note));
      setTagsText(note?.tags.join(', ') ?? '');
    } else if (note && !sameTags(parseTags(tagsText), note.tags)) {
      // 标签被外部改了（如恢复版本），才覆盖输入框
      setTagsText(note.tags.join(', '));
    }
  }

  const sentimentLabel = useNoteSentiment(localNote?.id, localNote?.title, localNote?.content);

  // 指纹要对整篇笔记 JSON.stringify：只在笔记本身变了才算，选区 / 补全菜单等状态变化不再重复计算
  const fingerprint = useMemo(() => noteFingerprint(localNote), [localNote]);
  const isOpen = isVisible && !!localNote;
  const dirty = !!localNote && fingerprint !== snapshot;

  // 打开：新笔记直接聚焦标题，已有笔记聚焦面板本身（不在手机上弹出键盘）；
  // Tab 锁在编辑器内；关闭后焦点回到触发它的卡片
  const isNewNote = !localNote?.id;
  useFocusTrap(panelRef, isVisible && !!localNote, () =>
    isNewNote ? titleInputRef.current : null,
  );

  const requestClose = useCallback(async () => {
    if (dirty) {
      const discard = await confirmDialog({
        title: '放弃未保存的更改？',
        description: '有未保存的更改，确定要放弃吗？',
        confirmLabel: '放弃更改',
        cancelLabel: '继续编辑',
        tone: 'danger',
      });
      if (!discard) return;
    }
    onCancel();
  }, [dirty, onCancel]);

  const modLabel = useModKeyLabel();

  // ---- 分屏实时预览（宽屏）----
  const isWide = useMediaQuery('(min-width: 1024px)');
  const [splitPref, setSplitPref] = useLocalStorageFlag(SPLIT_PREF_KEY);
  const showSplit = splitPref && isWide && !isPreview;
  const previewPaneRef = useRef<HTMLDivElement>(null);
  // 预览渲染（Markdown + KaTeX）比输入慢：让它排在输入之后，打字不会被预览拖住
  const deferredContent = useDeferredValue(localNote?.content ?? '');
  const deferredRanges = useDeferredValue(localNote?.coloredRanges);

  const stats = useMemo(() => computeTextStats(localNote?.content ?? ''), [localNote?.content]);

  // ---- 保存 ----
  // Ctrl/Cmd+S 保存后留在编辑器里；“保存”按钮保存并关闭。
  // 保存期间再触发会被忽略，避免连按产生重复的版本记录
  const savingRef = useRef(false);
  const saveNow = useCallback(
    async (keepOpen: boolean) => {
      if (savingRef.current || !fingerprint) return;
      savingRef.current = true;
      // 以触发保存那一刻的内容为准：保存期间继续输入的字，保存后仍然算“未保存”
      const savedFingerprint = fingerprint;
      try {
        const result = await onSave(keepOpen ? { keepOpen: true } : undefined);
        if (keepOpen && result !== false) setSnapshot(savedFingerprint);
      } finally {
        savingRef.current = false;
      }
    },
    [fingerprint, onSave],
  );

  // 有未保存的更改时关闭/刷新标签页，让浏览器弹出确认
  useEffect(() => {
    if (!isOpen || !dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isOpen, dirty]);

  // ---- `[[` 双链补全 ----
  const wiki = useWikiLinkCompletion({
    textareaRef: contentTextareaRef,
    allNotes,
    editingId: localNote?.id,
  });

  const formatActions = useMemo(() => createFormatActions(modLabel), [modLabel]);

  // 打开时锁定背景滚动，避免移动端滑动穿透到下方列表
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // 桌面端快捷键：Ctrl/Cmd+S 保存（不关闭），Ctrl/Cmd+Shift+P 切换预览，Esc 关闭（有更改时先确认）
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // 输入法选词时 Esc 是取消候选，不能当成“关闭编辑器”
      if (e.key === 'Escape' && !isImeComposing(e) && !showVersionHistory && !e.defaultPrevented) {
        e.preventDefault();
        requestClose();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void saveNow(true);
      } else if (key === 'p' && e.shiftKey) {
        e.preventDefault();
        onTogglePreview();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, saveNow, onTogglePreview, requestClose, showVersionHistory]);

  if (!isVisible || !localNote) return null;

  const handleFieldChange = (field: keyof NoteItem, value: NoteItem[keyof NoteItem]) => {
    // 函数式更新：同一轮事件里连续调用（如恢复版本）时，不会互相覆盖
    setLocalNote((prev) => (prev ? { ...prev, [field]: value } : prev));
    onChange(field, value);
  };

  // 正文变化时，着色区间要跟着移动，否则颜色会落到别的文字上
  const handleContentChange = (content: string) => {
    const ranges = localNote.coloredRanges;
    handleFieldChange('content', content);
    if (ranges && ranges.length > 0) {
      handleFieldChange(
        'coloredRanges',
        TextColorUtils.rebaseRanges(localNote.content, content, ranges),
      );
    }
  };

  const handleTagsTextChange = (text: string) => {
    setTagsText(text);
    const next = parseTags(text);
    if (!sameTags(next, localNote.tags)) handleFieldChange('tags', next);
  };

  const handleRevert = (version: NoteVersion) => {
    if (!onRevertVersion) return;
    onRevertVersion(version);
    handleFieldChange('title', version.title);
    handleFieldChange('content', version.content);
    handleFieldChange('category', version.category);
    handleFieldChange('tags', version.tags);
    setTagsText(version.tags.join(', '));
    handleFieldChange('color', version.color);
    handleFieldChange('coloredRanges', version.coloredRanges);
  };

  const handleTogglePreview = () => {
    setSelectionStart(null);
    setSelectionEnd(null);
    onTogglePreview();
  };

  const unpublishedChanges = hasUnpublishedChanges(localNote, publishInfo);

  // Handle text selection in the content textarea
  const handleTextSelection = () => {
    const ta = contentTextareaRef.current;
    if (!ta) return;

    if (ta.selectionStart !== ta.selectionEnd) {
      setSelectionStart(ta.selectionStart);
      setSelectionEnd(ta.selectionEnd);
    } else {
      setSelectionStart(null);
      setSelectionEnd(null);
    }
    wiki.update();
  };

  /** 对 textarea 的当前选区执行一次编辑；返回是否真的改了东西 */
  const runEdit = (build: (value: string, start: number, end: number) => TextEdit | null) => {
    const ta = contentTextareaRef.current;
    if (!ta) return false;
    const edit = build(ta.value, ta.selectionStart, ta.selectionEnd);
    if (!edit) return false;
    applyEditToTextarea(ta, edit);
    return true;
  };

  const runFormat = (action: FormatAction) => {
    if (runEdit(action.build) && action.key === 'wikilink') wiki.update();
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 输入法选词时的 Enter / Tab / 方向键 / Esc 是给输入法的
    if (isImeComposing(e.nativeEvent)) return;

    // 补全菜单打开时，它优先接管 ↑ ↓ Enter Tab Esc
    if (wiki.handleKeyDown(e)) return;

    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        runEdit((v, s, en) => toggleWrap(v, s, en, '**', '粗体'));
      } else if (key === 'i') {
        e.preventDefault();
        runEdit((v, s, en) => toggleWrap(v, s, en, '*', '斜体'));
      } else if (key === 'k') {
        e.preventDefault();
        runEdit(insertLink);
      }
      return;
    }
    if (mod || e.altKey) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      // 不在列表里 → 返回 false，保持浏览器默认的换行
      if (runEdit(continueList)) e.preventDefault();
    } else if (e.key === 'Tab') {
      // 只在列表项/多行选区里接管；其他情况 Tab 照常移动焦点，键盘用户不会被困在编辑区
      if (runEdit((v, s, en) => indentSelection(v, s, en, e.shiftKey))) e.preventDefault();
    }
  };

  // 分屏时让预览跟着编辑区滚动（按比例）
  const handleTextareaScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    wiki.close();
    const preview = previewPaneRef.current;
    if (!showSplit || !preview) return;
    const ta = e.currentTarget;
    const max = ta.scrollHeight - ta.clientHeight;
    if (max <= 0) return;
    preview.scrollTop = (ta.scrollTop / max) * (preview.scrollHeight - preview.clientHeight);
  };

  // 着色：选区在选中时记录，应用 / 清除后复位
  const hasSelection =
    selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd;

  const updateColorRanges = (
    update: (
      start: number,
      end: number,
      ranges: NonNullable<NoteItem['coloredRanges']>,
    ) => NoteItem['coloredRanges'],
  ) => {
    if (!hasSelection) return;
    handleFieldChange(
      'coloredRanges',
      update(selectionStart, selectionEnd, localNote.coloredRanges || []),
    );
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const applyColorToSelection = (color: string) =>
    updateColorRanges((s, e, ranges) => TextColorUtils.applyColorToSelection(s, e, color, ranges));

  const clearColorFromSelection = () =>
    updateColorRanges((s, e, ranges) => TextColorUtils.clearColorInSelection(s, e, ranges));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-stretch sm:items-center justify-center z-50 sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-editor-title"
        tabIndex={-1}
        className={`bg-white dark:bg-dark-surface sm:rounded-lg shadow-xl w-full ${showSplit ? 'sm:max-w-7xl' : 'sm:max-w-4xl'} h-dvh sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden sm:border border-gray-200 dark:border-dark-border`}
      >
        <EditorHeader
          noteId={localNote.id}
          dirty={dirty}
          sentimentLabel={sentimentLabel}
          modLabel={modLabel}
          isPreview={isPreview}
          canSplit={isWide}
          splitPref={splitPref}
          versionCount={localNote.versions?.length ?? 0}
          canPublish={Boolean(onPublish)}
          canUnpublish={Boolean(onUnpublish)}
          publishInfo={publishInfo}
          publishSuspension={publishSuspension}
          publishBusy={publish.busy}
          publishError={publish.error}
          unpublishedChanges={unpublishedChanges}
          onCancel={requestClose}
          onSave={() => void saveNow(false)}
          onTogglePreview={handleTogglePreview}
          onToggleSplit={() => setSplitPref(!splitPref)}
          onShowHistory={() => setShowVersionHistory(true)}
          onPublish={publish.publish}
          onUnpublish={publish.unpublish}
          onDelete={onDelete}
        />

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
                  ref={titleInputRef}
                  type="text"
                  value={localNote.title}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  placeholder="笔记标题"
                  className="w-full text-xl sm:text-2xl font-bold border-none outline-hidden bg-transparent dark:text-dark-text dark:placeholder-dark-text-secondary"
                />
              </div>

              {/* Content */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text mb-2">
                  内容 (支持 Markdown 和 LaTeX 公式语法)
                </label>
                {hasSelection && (
                  <ColorSelectionBar
                    selectedCount={selectionEnd - selectionStart}
                    onApply={applyColorToSelection}
                    onClear={clearColorFromSelection}
                  />
                )}
                <FormatToolbar actions={formatActions} onRun={runFormat} />
                <div className="relative">
                  <textarea
                    ref={contentTextareaRef}
                    value={localNote.content}
                    onChange={(e) => {
                      handleContentChange(e.target.value);
                      wiki.update();
                    }}
                    onKeyDown={handleTextareaKeyDown}
                    onSelect={handleTextSelection}
                    onMouseUp={handleTextSelection}
                    onKeyUp={handleTextSelection}
                    onTouchEnd={handleTextSelection}
                    onScroll={handleTextareaScroll}
                    onBlur={wiki.close}
                    aria-autocomplete={allNotes ? 'list' : undefined}
                    aria-haspopup={wiki.isOpen ? 'listbox' : undefined}
                    aria-controls={wiki.isOpen ? wiki.listId : undefined}
                    aria-activedescendant={
                      wiki.isOpen ? `${wiki.listId}-${wiki.activeIndex}` : undefined
                    }
                    placeholder="开始记录您的想法... (支持 Markdown 和 LaTeX 公式语法)"
                    className={`w-full ${showSplit ? 'h-[55vh] sm:max-h-none' : 'h-[45dvh] sm:h-[45vh] sm:max-h-[32rem]'} min-h-48 resize-y border rounded-lg p-3 outline-hidden focus:border-accent-pink focus:ring-2 focus:ring-accent-pink/20 bg-white dark:bg-dark-surface-light font-mono text-base sm:text-sm leading-relaxed border-gray-300 dark:border-dark-border text-gray-800 dark:text-dark-text`}
                  />
                  {wiki.isOpen && wiki.wiki && (
                    <WikiSuggestionList
                      id={wiki.listId}
                      items={wiki.suggestions}
                      activeIndex={wiki.activeIndex}
                      left={wiki.wiki.left}
                      top={wiki.wiki.top}
                      flip={wiki.wiki.flip}
                      onHover={wiki.setIndex}
                      onAccept={wiki.accept}
                    />
                  )}
                </div>
              </div>

              <MetadataFields
                category={localNote.category}
                color={localNote.color}
                tagsText={tagsText}
                onCategoryChange={(category) => handleFieldChange('category', category)}
                onColorChange={(color) => handleFieldChange('color', color)}
                onTagsTextChange={handleTagsTextChange}
              />
            </div>
          )}

          {/* 分屏：右侧实时预览 */}
          {showSplit && (
            <SplitPreview
              ref={previewPaneRef}
              title={localNote.title}
              color={localNote.color}
              content={deferredContent}
              coloredRanges={deferredRanges}
            />
          )}

          {isPreview && (
            <PreviewPanel
              note={localNote}
              relatedNotes={relatedNotes}
              onOpenRelatedNote={onOpenRelatedNote}
            />
          )}
        </div>

        <StatusBar stats={stats} modLabel={modLabel} />
      </div>

      <VersionHistory
        note={localNote}
        isVisible={showVersionHistory}
        onRevert={handleRevert}
        onClose={() => setShowVersionHistory(false)}
      />
    </div>
  );
};

export default NoteEditor;

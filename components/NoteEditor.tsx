import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useDeferredValue,
  useId,
  useMemo,
} from 'react';
import SentimentUtil from '../lib/sentiment';
import { confirmDialog } from '../lib/dialog';
import { isImeComposing } from '../lib/ime';
import { useFocusTrap } from '../lib/hooks/useFocusTrap';
import { useLocalStorageFlag } from '../lib/hooks/useLocalStorageFlag';
import { useMediaQuery } from '../lib/hooks/useMediaQuery';
import { useModKeyLabel } from '../lib/hooks/useModKeyLabel';
import { getCaretCoordinates } from '../lib/caret';
import { rankByFuzzy } from '../lib/fuzzy';
import {
  completeWikiLink,
  continueList,
  cycleHeading,
  findWikiLinkTrigger,
  indentSelection,
  insertLink,
  isLinkableTitle,
  toggleLinePrefix,
  toggleWrap,
  type TextEdit,
} from '../lib/markdownEditing';
import { computeTextStats } from '../lib/textStats';
import { NoteItem, NoteVersion } from '../lib/storage';
import TextColorUtils from '../lib/textColorUtils';
import { VersionHistory } from './VersionHistory';
import ColoredMarkdown from './ColoredMarkdown';
import {
  hasUnpublishedChanges,
  suspensionMessage,
  type PublicSuspensionNotice,
  type PublishResult,
} from '../lib/publicNotes';
import type { PublishedNoteInfo } from '../types/ugc-types';

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

const parseTags = (text: string) =>
  text
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter((t) => t);

const sameTags = (a: string[], b: string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

/** 参与“是否有未保存更改”判断的字段 */
function noteFingerprint(n: NoteItem | null) {
  if (!n) return '';
  return JSON.stringify([n.title, n.content, n.category, n.tags, n.color, n.coloredRanges ?? []]);
}

const WIKI_SUGGESTION_LIMIT = 8;
const SPLIT_PREF_KEY = 'qcnote:editor-split';

/**
 * 把一次编辑应用到 textarea。优先用 `execCommand('insertText')`：它走浏览器自己的编辑通道，
 * Ctrl+Z 能一步步撤销；直接改 value 会清空撤销栈。execCommand 不可用时（个别环境）退回 setRangeText。
 */
function applyEditToTextarea(ta: HTMLTextAreaElement, edit: TextEdit) {
  ta.focus();
  ta.setSelectionRange(edit.from, edit.to);
  let done: boolean;
  try {
    done =
      edit.insert === ''
        ? document.execCommand('delete')
        : document.execCommand('insertText', false, edit.insert);
  } catch {
    done = false;
  }
  if (!done) {
    ta.setRangeText(edit.insert, edit.from, edit.to, 'end');
    // React 的 onChange 监听 input 事件
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  ta.setSelectionRange(edit.selectionStart, edit.selectionEnd);
}

const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  isVisible,
  isPreview,
  relatedNotes = [],
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
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
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

  // 跟随外部传入的 note（渲染期调整：比在 effect 里同步 setState 少一次多余渲染）
  const [prevNote, setPrevNote] = useState(note);
  if (prevNote !== note) {
    setPrevNote(note);
    setLocalNote(note);
    if (!prevNote || prevNote.id !== note?.id) {
      setPublishError(null);
      setSnapshot(noteFingerprint(note));
      setTagsText(note?.tags.join(', ') ?? '');
    } else if (note && !sameTags(parseTags(tagsText), note.tags)) {
      // 标签被外部改了（如恢复版本），才覆盖输入框
      setTagsText(note.tags.join(', '));
    }
  }

  // 情绪分析要扫一遍全文：只在打开笔记时立即算，输入时等停顿 800ms 再算，
  // 而不是每次按键（每次渲染）都分析一次，长笔记会拖慢输入
  const noteId = localNote?.id;
  const noteTitle = localNote?.title;
  const noteContent = localNote?.content;
  const [sentiment, setSentiment] = useState<{
    noteId: string;
    score: number;
    comparative: number;
  } | null>(null);
  const analyzedNoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (noteId === undefined) {
      return;
    }

    const delay = analyzedNoteIdRef.current === noteId ? 800 : 0;
    const debounceId = window.setTimeout(() => {
      try {
        const result = SentimentUtil.analyzeEmotion(`${noteTitle} ${noteContent}`);
        analyzedNoteIdRef.current = noteId;
        setSentiment({ noteId, ...result });
        window.dispatchEvent(
          new CustomEvent('qcnote:sentiment-update', {
            detail: { noteId, ...result, title: noteTitle },
          }),
        );
      } catch (e) {
        console.warn('[NoteEditor] 无法更新情感状态', e);
      }
    }, delay);

    return () => {
      window.clearTimeout(debounceId);
    };
  }, [noteId, noteTitle, noteContent]);

  const isOpen = isVisible && !!localNote;
  const dirty = !!localNote && noteFingerprint(localNote) !== snapshot;

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
      if (savingRef.current || !localNote) return;
      savingRef.current = true;
      // 以触发保存那一刻的内容为准：保存期间继续输入的字，保存后仍然算“未保存”
      const savedFingerprint = noteFingerprint(localNote);
      try {
        const result = await onSave(keepOpen ? { keepOpen: true } : undefined);
        if (keepOpen && result !== false) setSnapshot(savedFingerprint);
      } finally {
        savingRef.current = false;
      }
    },
    [localNote, onSave],
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
  const [wiki, setWiki] = useState<{
    start: number;
    query: string;
    top: number;
    left: number;
    flip: boolean;
    index: number;
  } | null>(null);
  // Esc 关闭补全后，在用户继续输入之前不要因为 keyup/选区变化又弹出来
  const dismissedWikiRef = useRef<string | null>(null);
  const wikiListId = useId();
  const wikiQuery = wiki ? wiki.query : null;
  const editingId = localNote?.id;
  const wikiSuggestions = useMemo(() => {
    if (wikiQuery === null || !allNotes) return [];
    const seen = new Set<string>();
    // 双链按标题解析：同名笔记只列最近编辑的那一篇，否则选哪个都一样
    const pool = [...allNotes]
      .filter((n) => !n.isDeleted && n.id !== editingId && isLinkableTitle(n.title))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((n) => (seen.has(n.title) ? false : (seen.add(n.title), true)));
    const q = wikiQuery.trim();
    const ranked = q ? rankByFuzzy(pool, q, (n) => n.title).map((r) => r.item) : pool;
    return ranked.slice(0, WIKI_SUGGESTION_LIMIT);
  }, [wikiQuery, allNotes, editingId]);
  const wikiOpen = wiki !== null && wikiSuggestions.length > 0;
  const wikiIndex = Math.min(wiki?.index ?? 0, Math.max(wikiSuggestions.length - 1, 0));

  // 格式工具栏：同一时刻只有一个按钮在 Tab 顺序里（roving tabindex），方向键在按钮间移动
  const [toolIndex, setToolIndex] = useState(0);

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

  const handlePublish = async () => {
    if (!onPublish || publishSuspension) return;
    if (!localNote.content.trim()) {
      setPublishError('笔记内容为空，无法发布');
      return;
    }
    const message = publishInfo
      ? '将用当前内容更新已公开的版本。\n更新后，任何人都能在你的个人主页看到新内容。是否继续？'
      : '发布后，这篇笔记的标题和正文会以明文保存在服务器上，并显示在你的个人主页，任何人（包括未登录的访客）都能看到。\n\n发布的是此刻内容的一份副本，之后修改本地笔记不会自动同步；你可以随时取消发布并删除这份副本。\n\n确定要发布吗？';
    const ok = await confirmDialog({
      title: publishInfo ? '更新已公开的版本' : '发布到个人主页',
      description: message,
      confirmLabel: publishInfo ? '更新发布' : '发布',
    });
    if (!ok) return;

    setPublishBusy(true);
    setPublishError(null);
    const result = await onPublish(localNote);
    setPublishBusy(false);
    if (!result.ok) setPublishError(result.error);
  };

  const handleUnpublish = async () => {
    if (!onUnpublish || publishSuspension) return;
    const ok = await confirmDialog({
      title: '取消发布？',
      description: '取消发布后，服务器上的公开副本会被删除，别人将无法再访问。是否继续？',
      confirmLabel: '取消发布',
      cancelLabel: '保留',
      tone: 'danger',
    });
    if (!ok) return;
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
    updateWiki();
  };

  // 光标是否在一个未闭合的 `[[…` 里：是则（重新）定位并打开补全菜单，否则关闭
  const updateWiki = () => {
    const ta = contentTextareaRef.current;
    if (!ta || !allNotes || ta.selectionStart !== ta.selectionEnd) {
      setWiki(null);
      return;
    }
    const trigger = findWikiLinkTrigger(ta.value, ta.selectionStart);
    if (!trigger) {
      dismissedWikiRef.current = null;
      setWiki(null);
      return;
    }
    if (dismissedWikiRef.current === `${trigger.start}:${trigger.query}`) {
      setWiki(null);
      return;
    }
    dismissedWikiRef.current = null;
    const caret = getCaretCoordinates(ta, ta.selectionStart);
    // 菜单宽 16rem；贴着右边缘时往左收，别被裁掉
    const left = Math.max(0, Math.min(caret.left, ta.offsetWidth - 264));
    // 光标在输入框下半部分时菜单向上展开，免得被面板底部遮住
    const flip = caret.top > ta.clientHeight / 2;
    const top = flip ? caret.top - 4 : caret.top + caret.height + 4;
    setWiki((prev) => {
      const same = prev && prev.start === trigger.start && prev.query === trigger.query;
      if (same && prev.left === left && prev.top === top && prev.flip === flip) return prev;
      return {
        start: trigger.start,
        query: trigger.query,
        left,
        top,
        flip,
        index: same ? prev.index : 0,
      };
    });
  };

  const acceptWiki = (title: string) => {
    const ta = contentTextareaRef.current;
    if (!ta) return;
    const trigger = findWikiLinkTrigger(ta.value, ta.selectionStart);
    if (!trigger) return;
    applyEditToTextarea(ta, completeWikiLink(ta.value, trigger, ta.selectionStart, title));
    dismissedWikiRef.current = null;
    setWiki(null);
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

  const formatActions: {
    key: string;
    label: string;
    aria: string;
    title: string;
    className?: string;
    /** 纯函数：由当前文本和选区算出一次编辑；真正应用在点击时（runFormat） */
    build: (value: string, start: number, end: number) => TextEdit | null;
  }[] = [
    {
      key: 'bold',
      label: 'B',
      aria: '粗体',
      title: `粗体 (${modLabel}+B)`,
      className: 'font-bold',
      build: (v, s, e) => toggleWrap(v, s, e, '**', '粗体'),
    },
    {
      key: 'italic',
      label: 'I',
      aria: '斜体',
      title: `斜体 (${modLabel}+I)`,
      className: 'italic',
      build: (v, s, e) => toggleWrap(v, s, e, '*', '斜体'),
    },
    {
      key: 'strike',
      label: 'S',
      aria: '删除线',
      title: '删除线',
      className: 'line-through',
      build: (v, s, e) => toggleWrap(v, s, e, '~~', '删除线'),
    },
    {
      key: 'code',
      label: '</>',
      aria: '行内代码',
      title: '行内代码',
      className: 'font-mono text-xs',
      build: (v, s, e) => toggleWrap(v, s, e, '`'),
    },
    {
      key: 'heading',
      label: 'H',
      aria: '标题（再按切换级别）',
      title: '标题：## → ### → 无',
      className: 'font-bold',
      build: (v, s) => cycleHeading(v, s),
    },
    {
      key: 'bullet',
      label: '•',
      aria: '无序列表',
      title: '无序列表',
      build: (v, s, e) => toggleLinePrefix(v, s, e, 'bullet'),
    },
    {
      key: 'ordered',
      label: '1.',
      aria: '有序列表',
      title: '有序列表',
      className: 'tabular-nums',
      build: (v, s, e) => toggleLinePrefix(v, s, e, 'ordered'),
    },
    {
      key: 'task',
      label: '☑',
      aria: '待办事项',
      title: '待办事项',
      build: (v, s, e) => toggleLinePrefix(v, s, e, 'task'),
    },
    {
      key: 'quote',
      label: '❝',
      aria: '引用',
      title: '引用',
      build: (v, s, e) => toggleLinePrefix(v, s, e, 'quote'),
    },
    {
      key: 'link',
      label: '🔗',
      aria: '插入链接',
      title: `插入链接 (${modLabel}+K)`,
      build: insertLink,
    },
    {
      key: 'wikilink',
      label: '[[ ]]',
      aria: '链接到其他笔记',
      title: '链接到其他笔记：输入 [[ 也可以',
      className: 'font-mono text-xs',
      build: (v, s, e) => {
        const selected = v.slice(s, e);
        const insert = `[[${selected}]]`;
        // 有选中文字：包成双链；没有：光标放进 [[ ]] 中间，随即弹出补全
        const caret = selected ? s + insert.length : s + 2;
        return { from: s, to: e, insert, selectionStart: caret, selectionEnd: caret };
      },
    },
  ];

  const runFormat = (action: (typeof formatActions)[number]) => {
    if (runEdit(action.build) && action.key === 'wikilink') updateWiki();
  };

  const handleToolbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const buttons = Array.from(e.currentTarget.querySelectorAll('button'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    const n = buttons.length;
    const next =
      e.key === 'ArrowRight'
        ? (current + 1) % n
        : e.key === 'ArrowLeft'
          ? (current - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : n - 1;
    e.preventDefault();
    buttons[next].focus();
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 输入法选词时的 Enter / Tab / 方向键 / Esc 是给输入法的
    if (isImeComposing(e.nativeEvent)) return;

    // 补全菜单打开时，它优先接管这几个键
    if (wikiOpen && wiki) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const index = (wikiIndex + step + wikiSuggestions.length) % wikiSuggestions.length;
        setWiki({ ...wiki, index });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        acceptWiki(wikiSuggestions[wikiIndex].title);
        return;
      }
      if (e.key === 'Escape') {
        // preventDefault 之后，下面窗口级的 Esc 处理器（关闭编辑器）会跳过这次按键
        e.preventDefault();
        dismissedWikiRef.current = `${wiki.start}:${wiki.query}`;
        setWiki(null);
        return;
      }
    }

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
    if (wiki) setWiki(null);
    const preview = previewPaneRef.current;
    if (!showSplit || !preview) return;
    const ta = e.currentTarget;
    const max = ta.scrollHeight - ta.clientHeight;
    if (max <= 0) return;
    preview.scrollTop = (ta.scrollTop / max) * (preview.scrollHeight - preview.clientHeight);
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

  const currentSentimentCategory =
    sentiment && sentiment.noteId === localNote.id
      ? SentimentUtil.getSentimentCategory(sentiment.score, sentiment.comparative)
      : 'neutral';
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
    <div className="fixed inset-0 bg-black/50 flex items-stretch sm:items-center justify-center z-50 sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-editor-title"
        tabIndex={-1}
        className={`bg-white dark:bg-dark-surface sm:rounded-lg shadow-xl w-full ${showSplit ? 'sm:max-w-7xl' : 'sm:max-w-4xl'} h-dvh sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden sm:border border-gray-200 dark:border-dark-border`}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-gray-200 dark:border-dark-border px-4 py-3 sm:p-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="note-editor-title"
                className="flex items-center gap-2 text-lg sm:text-2xl font-bold text-ink dark:text-dark-text"
              >
                {localNote.id ? '编辑笔记' : '新建笔记'}
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
              <button onClick={requestClose} className="btn-secondary btn-sm" title="关闭 (Esc)">
                取消
              </button>
              <button
                onClick={() => void saveNow(false)}
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
              onClick={handleTogglePreview}
              title="切换编辑/预览 (Ctrl/Cmd+Shift+P)"
              className={`btn-secondary btn-sm ${isPreview ? 'bg-ink dark:bg-accent-pink text-white' : ''}`}
            >
              {isPreview ? '编辑' : '预览'}
            </button>
            {isWide && !isPreview && (
              <button
                type="button"
                onClick={() => setSplitPref(!splitPref)}
                aria-pressed={splitPref}
                title="左边写、右边实时预览"
                className={`btn-secondary btn-sm ${splitPref ? 'bg-ink dark:bg-accent-pink text-white' : ''}`}
              >
                分屏
              </button>
            )}
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
                  disabled={publishBusy || Boolean(publishSuspension)}
                  className="btn-secondary btn-sm"
                  title={
                    publishSuspension
                      ? '你的个人主页和公开笔记已被管理员关闭'
                      : '把这篇笔记的副本公开到你的个人主页'
                  }
                >
                  {publishBusy ? '处理中…' : publishInfo ? '更新发布' : '发布到主页'}
                </button>
                {publishInfo && onUnpublish && (
                  <button
                    onClick={handleUnpublish}
                    disabled={publishBusy || Boolean(publishSuspension)}
                    className="btn-secondary btn-sm"
                    title={publishSuspension ? '你的个人主页和公开笔记已被管理员关闭' : undefined}
                  >
                    取消发布
                  </button>
                )}
              </>
            )}
            {localNote?.id && (
              <button
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: '删除这篇笔记？',
                    description: '它将被移到回收站，之后仍可以在回收站里还原。',
                    confirmLabel: '移到回收站',
                    tone: 'danger',
                  });
                  if (ok) onDelete(localNote.id);
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
                          aria-label={`把选中文字设为 ${color}`}
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
                <div
                  role="toolbar"
                  aria-label="Markdown 格式"
                  onKeyDown={handleToolbarKeyDown}
                  className="-mx-1 mb-2 flex gap-0.5 overflow-x-auto px-1 pb-1"
                >
                  {formatActions.map((action, i) => (
                    <button
                      key={action.key}
                      type="button"
                      tabIndex={i === toolIndex ? 0 : -1}
                      aria-label={action.aria}
                      title={action.title}
                      className={`tool-btn ${action.className ?? ''}`}
                      // 阻止按下时 textarea 失焦，选区才不会丢
                      onMouseDown={(e) => e.preventDefault()}
                      onFocus={() => setToolIndex(i)}
                      onClick={() => runFormat(action)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <textarea
                    ref={contentTextareaRef}
                    value={localNote.content}
                    onChange={(e) => {
                      handleContentChange(e.target.value);
                      updateWiki();
                    }}
                    onKeyDown={handleTextareaKeyDown}
                    onSelect={handleTextSelection}
                    onMouseUp={handleTextSelection}
                    onKeyUp={handleTextSelection}
                    onTouchEnd={handleTextSelection}
                    onScroll={handleTextareaScroll}
                    onBlur={() => setWiki(null)}
                    aria-autocomplete={allNotes ? 'list' : undefined}
                    aria-haspopup={wikiOpen ? 'listbox' : undefined}
                    aria-controls={wikiOpen ? wikiListId : undefined}
                    aria-activedescendant={wikiOpen ? `${wikiListId}-${wikiIndex}` : undefined}
                    placeholder="开始记录您的想法... (支持 Markdown 和 LaTeX 公式语法)"
                    className={`w-full ${showSplit ? 'h-[55vh] sm:max-h-none' : 'h-[45dvh] sm:h-[45vh] sm:max-h-[32rem]'} min-h-48 resize-y border rounded-lg p-3 outline-hidden focus:border-accent-pink focus:ring-2 focus:ring-accent-pink/20 bg-white dark:bg-dark-surface-light font-mono text-base sm:text-sm leading-relaxed border-gray-300 dark:border-dark-border text-gray-800 dark:text-dark-text`}
                  />
                  {wikiOpen && wiki && (
                    <ul
                      id={wikiListId}
                      role="listbox"
                      aria-label="链接到笔记"
                      className="absolute z-20 max-h-56 w-64 overflow-y-auto rounded-lg border border-primary-dark/20 bg-white p-1 shadow-lg dark:border-dark-border dark:bg-dark-surface"
                      style={{
                        left: wiki.left,
                        top: wiki.top,
                        transform: wiki.flip ? 'translateY(-100%)' : undefined,
                      }}
                    >
                      {wikiSuggestions.map((n, i) => (
                        <li
                          key={n.id}
                          id={`${wikiListId}-${i}`}
                          role="option"
                          aria-selected={i === wikiIndex}
                          // mousedown 默认会让 textarea 失焦（并关闭菜单）：阻止它
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseMove={() => i !== wikiIndex && setWiki({ ...wiki, index: i })}
                          onClick={() => acceptWiki(n.title)}
                          className={`cursor-pointer truncate rounded-md px-2 py-1.5 text-sm text-ink dark:text-dark-text ${
                            i === wikiIndex ? 'bg-primary-light dark:bg-dark-surface-light' : ''
                          }`}
                        >
                          {n.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
                    {colors.map((color) => {
                      const active = localNote.color === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => handleFieldChange('color', color)}
                          aria-label={`笔记颜色 ${color}`}
                          aria-pressed={active}
                          className={`flex w-8 h-8 items-center justify-center rounded-full border-2 text-xs font-bold text-gray-800 transition-transform ${
                            active
                              ? 'scale-110 border-gray-800 dark:border-white'
                              : 'border-white/60 hover:scale-105 dark:border-dark-border'
                          }`}
                          style={{ backgroundColor: color }}
                        >
                          {active ? '✓' : ''}
                        </button>
                      );
                    })}
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
                  value={tagsText}
                  onChange={(e) => {
                    setTagsText(e.target.value);
                    const next = parseTags(e.target.value);
                    if (!sameTags(next, localNote.tags)) handleFieldChange('tags', next);
                  }}
                  placeholder="标签1, 标签2, 标签3"
                  className="w-full p-2 border rounded text-base sm:text-sm dark:bg-dark-surface-light dark:border-dark-border dark:text-dark-text"
                />
              </div>
            </div>
          )}

          {/* 分屏：右侧实时预览 */}
          {showSplit && (
            <div
              ref={previewPaneRef}
              role="region"
              aria-label="实时预览"
              className="flex-1 min-w-0 overflow-y-auto overscroll-contain border-l border-gray-200 p-6 dark:border-dark-border dark:text-dark-text"
            >
              <h1
                className="mb-4 border-l-4 pl-3 text-2xl font-bold wrap-break-word text-ink dark:text-dark-text"
                style={{ borderColor: localNote.color }}
              >
                {localNote.title || '无标题'}
              </h1>
              <div className="prose dark:prose-invert max-w-none wrap-break-word overflow-x-auto">
                <ColoredMarkdown content={deferredContent} coloredRanges={deferredRanges} />
              </div>
            </div>
          )}

          {/* Preview Panel */}
          {isPreview && (
            <div className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto overscroll-contain dark:text-dark-text">
              {/* 笔记颜色用作左侧色条：直接当文字色时，浅黄等颜色在白底上几乎看不见 */}
              <h1
                className="text-2xl sm:text-3xl font-bold mb-4 wrap-break-word border-l-4 pl-3 text-ink dark:text-dark-text"
                style={{ borderColor: localNote.color }}
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
                            className="text-ink hover:text-ink-pink transition"
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
                            className="text-ink hover:text-ink-pink transition"
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

              <div className="prose dark:prose-invert md:prose-lg max-w-none wrap-break-word overflow-x-auto">
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

        {/* 状态栏 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-4 py-1.5 text-xs text-text-light dark:border-dark-border">
          <span
            className="tabular-nums"
            title={`${stats.chars.toLocaleString()} 个字符（不含空白）`}
          >
            {stats.words.toLocaleString()} 字
            {stats.readingMinutes > 0 && ` · 约 ${stats.readingMinutes} 分钟读完`}
          </span>
          <span className="hidden truncate sm:inline">
            {modLabel}+S 保存 · {modLabel}+B / I 加粗 / 斜体 · 输入 [[ 链接笔记
          </span>
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
            setTagsText(version.tags.join(', '));
            handleFieldChange('color', version.color);
            handleFieldChange('coloredRanges', version.coloredRanges);
          }
        }}
        onClose={() => setShowVersionHistory(false)}
      />
    </div>
  );
};

export default NoteEditor;

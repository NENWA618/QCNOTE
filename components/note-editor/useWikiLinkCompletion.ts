import { useCallback, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { rankByFuzzy } from '../../lib/fuzzy';
import { completeWikiLink, findWikiLinkTrigger, isLinkableTitle } from '../../lib/markdownEditing';
import type { NoteItem } from '../../lib/storage';
import type { MarkdownEditorHandle } from './MarkdownCodeEditor';

const WIKI_SUGGESTION_LIMIT = 8;
/** 菜单宽 16rem（256px）加 8px 余量；贴着右边缘时往左收，别被裁掉 */
const MENU_WIDTH = 264;

interface WikiState {
  start: number;
  query: string;
  top: number;
  left: number;
  flip: boolean;
  index: number;
}

/** 补全菜单只需要键盘事件的这两个成员，原生和 React 的键盘事件都满足 */
interface KeyLike {
  key: string;
  preventDefault(): void;
}

interface Options {
  editorRef: RefObject<MarkdownEditorHandle | null>;
  /** 全部笔记；不传则不提供补全 */
  allNotes?: NoteItem[];
  /** 正在编辑的笔记 id（补全里排除自己） */
  editingId?: string;
}

/** 输入 `[[` 时的笔记标题补全：状态、候选项、定位和键盘处理 */
export function useWikiLinkCompletion({ editorRef, allNotes, editingId }: Options) {
  const [wiki, setWiki] = useState<WikiState | null>(null);
  // Esc 关闭补全后，在用户继续输入之前不要因为 keyup/选区变化又弹出来
  const dismissedRef = useRef<string | null>(null);
  const listId = useId();
  const query = wiki ? wiki.query : null;
  const active = query !== null;

  // 候选池只在 allNotes 变化时重排；在 `[[` 里每多输入一个字，只重新做模糊匹配
  const pool = useMemo(() => {
    if (!active || !allNotes) return [];
    const seen = new Set<string>();
    // 双链按标题解析：同名笔记只列最近编辑的那一篇，否则选哪个都一样
    return allNotes
      .filter((n) => !n.isDeleted && n.id !== editingId && isLinkableTitle(n.title))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((n) => (seen.has(n.title) ? false : (seen.add(n.title), true)));
  }, [active, allNotes, editingId]);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.trim();
    const ranked = q ? rankByFuzzy(pool, q, (n) => n.title).map((r) => r.item) : pool;
    return ranked.slice(0, WIKI_SUGGESTION_LIMIT);
  }, [query, pool]);

  const isOpen = wiki !== null && suggestions.length > 0;
  const activeIndex = Math.min(wiki?.index ?? 0, Math.max(suggestions.length - 1, 0));

  /** 光标是否在一个未闭合的 `[[…` 里：是则（重新）定位并打开补全菜单，否则关闭 */
  const update = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !allNotes) {
      setWiki(null);
      return;
    }
    const { from, to } = editor.getSelection();
    if (from !== to) {
      setWiki(null);
      return;
    }
    const trigger = findWikiLinkTrigger(editor.getValue(), from);
    if (!trigger) {
      dismissedRef.current = null;
      setWiki(null);
      return;
    }
    if (dismissedRef.current === `${trigger.start}:${trigger.query}`) {
      setWiki(null);
      return;
    }
    dismissedRef.current = null;
    const caret = editor.caretRect(from);
    if (!caret) {
      setWiki(null);
      return;
    }
    const size = editor.size();
    const left = Math.max(0, Math.min(caret.left, size.width - MENU_WIDTH));
    // 光标在编辑区下半部分时菜单向上展开，免得被面板底部遮住
    const flip = caret.top > size.height / 2;
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
  }, [editorRef, allNotes]);

  const close = useCallback(() => setWiki(null), []);

  const setIndex = useCallback(
    (index: number) =>
      setWiki((prev) => (prev && prev.index !== index ? { ...prev, index } : prev)),
    [],
  );

  const accept = useCallback(
    (title: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const value = editor.getValue();
      const caret = editor.getSelection().from;
      const trigger = findWikiLinkTrigger(value, caret);
      if (!trigger) return;
      editor.applyEdit(completeWikiLink(value, trigger, caret, title));
      dismissedRef.current = null;
      setWiki(null);
    },
    [editorRef],
  );

  /** 菜单打开时它优先接管 ↑ ↓ Enter Tab Esc；返回 true 表示这个键已处理 */
  const handleKeyDown = (e: KeyLike): boolean => {
    if (!isOpen || !wiki) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setIndex((activeIndex + step + suggestions.length) % suggestions.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      accept(suggestions[activeIndex].title);
      return true;
    }
    if (e.key === 'Escape') {
      // preventDefault 之后，窗口级的 Esc 处理器（关闭编辑器）会跳过这次按键
      e.preventDefault();
      dismissedRef.current = `${wiki.start}:${wiki.query}`;
      setWiki(null);
      return true;
    }
    return false;
  };

  return {
    wiki,
    listId,
    suggestions,
    isOpen,
    activeIndex,
    update,
    close,
    setIndex,
    accept,
    handleKeyDown,
  };
}

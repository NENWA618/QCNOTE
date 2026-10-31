import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { Annotation, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, insertNewline } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { classHighlighter } from '@lezer/highlight';
import { isImeComposing } from '../../lib/ime';
import {
  continueList,
  indentSelection,
  insertLink,
  toggleWrap,
  type TextEdit,
} from '../../lib/markdownEditing';

/**
 * 笔记正文编辑器（CodeMirror 6）。
 *
 * 对外仍是“受控文本 + 选区”的接口，和原来的 <textarea> 一致：
 * - 所有下标都是 UTF-16 字符串下标，与 coloredRanges、TextEdit 一致；
 * - 加粗 / 斜体 / 链接 / 列表续写 / Tab 缩进复用 lib/markdownEditing 里的纯函数；
 * - `[[` 双链补全的弹层仍由 React 渲染，按键通过 `onKeyDown` 先交给它处理。
 */

/** 标记“这次改动来自外部（props.value），不要再回调 onChange” */
const External = Annotation.define<boolean>();

export interface CaretRect {
  /** 相对编辑器左上角的坐标 */
  left: number;
  top: number;
  height: number;
}

export interface MarkdownEditorHandle {
  getValue(): string;
  getSelection(): { from: number; to: number };
  /** 应用一次编辑；走 CodeMirror 的历史记录，Ctrl+Z 可以逐步撤销 */
  applyEdit(edit: TextEdit): void;
  /** 某个位置的光标矩形；编辑器未挂载时为 null */
  caretRect(pos: number): CaretRect | null;
  size(): { width: number; height: number };
  focus(): void;
}

interface MarkdownCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** 文本或选区变化之后调用；from === to 表示只有光标 */
  onSelectionChange?: (from: number, to: number) => void;
  /** 先于编辑器自己的快捷键处理按键；返回 true 表示已处理（会阻止默认行为） */
  onKeyDown?: (e: KeyboardEvent) => boolean;
  onScroll?: (info: { top: number; max: number }) => void;
  onBlur?: () => void;
  ariaLabel: string;
  placeholder?: string;
  /** 外层容器的 class：负责尺寸、边框、颜色 */
  className?: string;
  /** 补全菜单相关的 ARIA 属性，直接设到可编辑元素上 */
  aria?: Partial<
    Record<
      'aria-autocomplete' | 'aria-haspopup' | 'aria-controls' | 'aria-activedescendant',
      string
    >
  >;
}

export function applyEditToView(view: EditorView, edit: TextEdit) {
  view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.insert },
    // 选区以编辑后的文本为准，与 TextEdit 的约定一致
    selection: { anchor: edit.selectionStart, head: edit.selectionEnd },
    userEvent: 'input',
    scrollIntoView: true,
  });
}

/** 对当前选区执行一次纯函数编辑；返回是否真的改了东西 */
function runEdit(
  view: EditorView,
  build: (value: string, start: number, end: number) => TextEdit | null,
): boolean {
  const { from, to } = view.state.selection.main;
  const edit = build(view.state.doc.toString(), from, to);
  if (!edit) return false;
  applyEditToView(view, edit);
  return true;
}

// 颜色交给外层容器的 Tailwind 类（含深色模式）；这里只设字重 / 字形，所以不用单独做深色主题
const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'inherit' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.625',
    overflow: 'auto',
    overscrollBehavior: 'contain',
  },
  '.cm-content': { padding: '0.75rem', caretColor: 'currentColor' },
  '.cm-line': { padding: '0' },
  '.cm-placeholder': { color: 'rgb(156 163 175)' },
  '.tok-heading': { fontWeight: '700' },
  '.tok-strong': { fontWeight: '700' },
  '.tok-emphasis': { fontStyle: 'italic' },
  '.tok-link, .tok-url': { textDecoration: 'underline' },
  '.tok-meta, .tok-comment': { opacity: '0.6' },
});

export const MarkdownCodeEditor = forwardRef<MarkdownEditorHandle, MarkdownCodeEditorProps>(
  function MarkdownCodeEditor(props, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    // 回调总是读最新的 props：扩展只在挂载时创建一次，不会因为父组件重渲染而重建
    const propsRef = useRef(props);
    useLayoutEffect(() => {
      propsRef.current = props;
    });
    // 最近一次通过 onChange 发出去的文本；父组件回传同样的值时不需要再同步
    const emittedRef = useRef(props.value);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      // 当前这次按键是不是输入法在用（isComposing，或 Safari 的 keyCode 229）。
      // keydown 处理器先于 keymap 运行，所以 keymap 里读到的总是这一次按键的状态；
      // CodeMirror 自己的 view.composing 要等合成产生改动后才为 true，覆盖不到这些情况
      let imeKey = false;
      const blocked = (v: EditorView) => imeKey || v.composing;
      const edit =
        (build: (value: string, start: number, end: number) => TextEdit | null) =>
        (v: EditorView) =>
          !blocked(v) && runEdit(v, build);

      const view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: propsRef.current.value,
          extensions: [
            // 补全菜单要先于编辑器自己的 Enter / Tab / 方向键 / Esc 处理
            Prec.highest(
              EditorView.domEventHandlers({
                keydown: (e) => {
                  // 输入法选词时的 Enter / Tab / 方向键 / Esc 是给输入法的
                  imeKey = isImeComposing(e);
                  if (imeKey) return false;
                  return propsRef.current.onKeyDown?.(e) ?? false;
                },
                blur: () => {
                  propsRef.current.onBlur?.();
                  return false;
                },
              }),
            ),
            Prec.high(
              keymap.of([
                {
                  key: 'Mod-b',
                  preventDefault: true,
                  run: edit((val, s, e) => toggleWrap(val, s, e, '**', '粗体')),
                },
                {
                  key: 'Mod-i',
                  preventDefault: true,
                  run: edit((val, s, e) => toggleWrap(val, s, e, '*', '斜体')),
                },
                { key: 'Mod-k', preventDefault: true, run: edit(insertLink) },
                // 不在列表里就是普通换行：不做自动缩进，与原来的 textarea 一致
                {
                  key: 'Enter',
                  run: (v) => !blocked(v) && (runEdit(v, continueList) || insertNewline(v)),
                },
                { key: 'Shift-Enter', run: (v) => !blocked(v) && insertNewline(v) },
                // 只在列表项 / 多行选区里接管 Tab；其他情况 Tab 照常移动焦点，键盘用户不会被困在编辑区
                { key: 'Tab', run: edit((val, s, e) => indentSelection(val, s, e, false)) },
                { key: 'Shift-Tab', run: edit((val, s, e) => indentSelection(val, s, e, true)) },
              ]),
            ),
            history(),
            keymap.of([
              // Esc 留给外层：窗口级处理器用它关闭编辑器。
              // Enter 上面已经完整处理（列表续写 / 普通换行）；这里不能留默认的 Enter，
              // 否则输入法选词时让路的 Enter 会落到它头上，变成多余的换行
              ...defaultKeymap.filter((b) => b.key !== 'Escape' && b.key !== 'Enter'),
              ...historyKeymap,
            ]),
            // addKeymap: false：lang-markdown 自带的 Enter / Backspace 会和 lib/markdownEditing
            // 的列表续写打架（续写规则、空项结束行为都不一样），这里统一用项目自己的
            markdown({ base: markdownLanguage, addKeymap: false }),
            syntaxHighlighting(classHighlighter),
            EditorView.lineWrapping,
            placeholderExtension(propsRef.current.placeholder ?? ''),
            EditorView.contentAttributes.of({
              'aria-label': propsRef.current.ariaLabel,
              spellcheck: 'true',
            }),
            editorTheme,
            EditorView.updateListener.of((update) => {
              if (update.docChanged && !update.transactions.some((tr) => tr.annotation(External))) {
                const next = update.state.doc.toString();
                emittedRef.current = next;
                propsRef.current.onChange(next);
              }
              if (update.docChanged || update.selectionSet) {
                // 更新进行中不能读布局（补全菜单要用 coordsAtPos 取光标位置），推迟到更新结束后；
                // 到时候读最新的选区，中间若又有新的改动也不会用到过期的值
                queueMicrotask(() => {
                  if (viewRef.current !== update.view) return;
                  const { from, to } = update.view.state.selection.main;
                  propsRef.current.onSelectionChange?.(from, to);
                });
              }
            }),
          ],
        }),
      });
      viewRef.current = view;

      const onScroll = () => {
        const el = view.scrollDOM;
        propsRef.current.onScroll?.({
          top: el.scrollTop,
          max: el.scrollHeight - el.clientHeight,
        });
      };
      view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

      return () => {
        view.scrollDOM.removeEventListener('scroll', onScroll);
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    // 外部改了文本（如恢复版本）才写回编辑器；自己发出去又传回来的值不处理
    const { value } = props;
    useEffect(() => {
      const view = viewRef.current;
      if (!view || value === emittedRef.current) return;
      emittedRef.current = value;
      const doc = view.state.doc;
      if (doc.length === value.length && doc.toString() === value) return;
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: value },
        selection: { anchor: Math.min(view.state.selection.main.head, value.length) },
        annotations: External.of(true),
      });
    }, [value]);

    // 补全菜单的 ARIA 属性：CodeMirror 只管理它自己设置过的属性，直接写在可编辑元素上不会被覆盖
    const { aria } = props;
    useEffect(() => {
      const el = viewRef.current?.contentDOM;
      if (!el) return;
      const names = [
        'aria-autocomplete',
        'aria-haspopup',
        'aria-controls',
        'aria-activedescendant',
      ] as const;
      for (const name of names) {
        const v = aria?.[name];
        if (v === undefined) el.removeAttribute(name);
        else el.setAttribute(name, v);
      }
    }, [aria]);

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => viewRef.current?.state.doc.toString() ?? '',
        getSelection: () => {
          const sel = viewRef.current?.state.selection.main;
          return { from: sel?.from ?? 0, to: sel?.to ?? 0 };
        },
        applyEdit: (edit) => {
          const view = viewRef.current;
          if (!view) return;
          view.focus();
          applyEditToView(view, edit);
        },
        caretRect: (pos) => {
          const view = viewRef.current;
          if (!view) return null;
          const c = view.coordsAtPos(pos);
          if (!c) return null;
          const box = view.dom.getBoundingClientRect();
          return { left: c.left - box.left, top: c.top - box.top, height: c.bottom - c.top };
        },
        size: () => {
          const el = viewRef.current?.dom;
          return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 };
        },
        focus: () => viewRef.current?.focus(),
      }),
      [],
    );

    return <div ref={hostRef} className={props.className} />;
  },
);

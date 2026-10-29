import {
  cycleHeading,
  insertLink,
  toggleLinePrefix,
  toggleWrap,
  type TextEdit,
} from '../../lib/markdownEditing';

export interface FormatAction {
  key: string;
  label: string;
  aria: string;
  title: string;
  className?: string;
  /** 纯函数：由当前文本和选区算出一次编辑；真正应用在点击时 */
  build: (value: string, start: number, end: number) => TextEdit | null;
}

/** 格式工具栏按钮定义；只有快捷键文案（modLabel）会变，调用方用 useMemo 缓存 */
export function createFormatActions(modLabel: string): FormatAction[] {
  return [
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
}

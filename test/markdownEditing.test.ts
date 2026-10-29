import { describe, it, expect } from 'vitest';
import {
  applyEdit,
  completeWikiLink,
  continueList,
  cycleHeading,
  findWikiLinkTrigger,
  indentSelection,
  insertLink,
  isInsideCodeFence,
  isLinkableTitle,
  toggleLinePrefix,
  toggleWrap,
  type TextEdit,
} from '../lib/markdownEditing';

/** 用 `|` 表示光标、`[`…`]` 之间表示选区（测试文本里不会出现真正的方括号） */
function parse(marked: string): { value: string; start: number; end: number } {
  const open = marked.indexOf('«');
  const close = marked.indexOf('»');
  if (open !== -1 && close !== -1) {
    const value = marked.replace('«', '').replace('»', '');
    return { value, start: open, end: close - 1 };
  }
  const caret = marked.indexOf('|');
  return { value: marked.replace('|', ''), start: caret, end: caret };
}

/** 应用编辑，并把结果选区重新标注成 `|` / `«»` 形式，便于断言 */
function run(marked: string, fn: (v: string, s: number, e: number) => TextEdit | null): string {
  const { value, start, end } = parse(marked);
  const edit = fn(value, start, end);
  if (!edit) return 'NULL';
  const next = applyEdit(value, edit);
  const { selectionStart: s, selectionEnd: e } = edit;
  if (s === e) return next.slice(0, s) + '|' + next.slice(s);
  return next.slice(0, s) + '«' + next.slice(s, e) + '»' + next.slice(e);
}

describe('toggleWrap', () => {
  const bold = (m: string) => run(m, (v, s, e) => toggleWrap(v, s, e, '**', '粗体'));
  const italic = (m: string) => run(m, (v, s, e) => toggleWrap(v, s, e, '*', '斜体'));

  it('给选区加上标记并保持选中', () => {
    expect(bold('a «bc» d')).toBe('a **«bc»** d');
  });

  it('再次触发时去掉外侧标记', () => {
    expect(bold('a **«bc»** d')).toBe('a «bc» d');
  });

  it('选区自带两端标记时也能去掉', () => {
    expect(bold('a «**bc**» d')).toBe('a «bc» d');
  });

  it('没有选区：放一对标记并选中占位文字', () => {
    expect(bold('a |')).toBe('a **«粗体»**');
  });

  it('没有占位文字时光标落在标记中间', () => {
    expect(run('x |', (v, s, e) => toggleWrap(v, s, e, '`'))).toBe('x `|`');
  });

  it('空标记对里再触发：去掉', () => {
    expect(run('x `|`', (v, s, e) => toggleWrap(v, s, e, '`'))).toBe('x |');
  });

  it('选区两端的空白留在标记外面', () => {
    expect(bold('a« bc »d')).toBe('a **«bc»** d');
  });

  it('斜体：不把加粗误判成已斜体', () => {
    expect(italic('**«bc»**')).toBe('***«bc»***');
  });

  it('斜体：已是斜体则去掉', () => {
    expect(italic('*«bc»*')).toBe('«bc»');
  });

  it('加粗+斜体（***）：各自可以单独去掉', () => {
    expect(italic('***«bc»***')).toBe('**«bc»**');
    expect(bold('***«bc»***')).toBe('*«bc»*');
  });

  it('支持中文与多字节字符', () => {
    expect(bold('你«好😀»吗')).toBe('你**«好😀»**吗');
  });
});

describe('insertLink', () => {
  const link = (m: string) => run(m, insertLink);

  it('选中文字：包成 [文字](url) 并选中 url', () => {
    expect(link('看«这里»吧')).toBe('看[这里](«url»)吧');
  });

  it('选中网址：网址放进括号，选中占位文字', () => {
    expect(link('«https://a.com/x»')).toBe('[«链接文字»](https://a.com/x)');
  });

  it('没有选区：光标放进方括号', () => {
    expect(link('a |')).toBe('a [|](url)');
  });
});

describe('toggleLinePrefix', () => {
  const bullet = (m: string) => run(m, (v, s, e) => toggleLinePrefix(v, s, e, 'bullet'));
  const task = (m: string) => run(m, (v, s, e) => toggleLinePrefix(v, s, e, 'task'));
  const ordered = (m: string) => run(m, (v, s, e) => toggleLinePrefix(v, s, e, 'ordered'));
  const quote = (m: string) => run(m, (v, s, e) => toggleLinePrefix(v, s, e, 'quote'));

  it('给当前行加项目符号，光标仍在行内原位置之后', () => {
    expect(bullet('ab|c')).toBe('- ab|c');
  });

  it('再次触发则去掉', () => {
    expect(bullet('- ab|c')).toBe('ab|c');
  });

  it('多行选区：逐行加前缀，空行跳过', () => {
    expect(bullet('«a\n\nb»')).toBe('«- a\n\n- b»');
  });

  it('多行编号会按顺序重新编号', () => {
    expect(ordered('«a\nb\nc»')).toBe('«1. a\n2. b\n3. c»');
  });

  it('在不同列表类型之间切换时替换前缀而不是叠加', () => {
    expect(task('- ab|c')).toBe('- [ ] ab|c');
    expect(bullet('1. ab|c')).toBe('- ab|c');
  });

  it('待办和项目符号互不误判', () => {
    // “- [ ] x” 不算“已有项目符号”，所以切到项目符号是替换而不是去掉
    expect(bullet('- [ ] x|')).toBe('- x|');
  });

  it('引用', () => {
    expect(quote('a|')).toBe('> a|');
    expect(quote('> a|')).toBe('a|');
  });

  it('保留缩进', () => {
    expect(bullet('  a|')).toBe('  - a|');
  });
});

describe('cycleHeading', () => {
  const h = (m: string) => run(m, (v, s) => cycleHeading(v, s));
  it('无 → ## → ### → 无', () => {
    expect(h('a|')).toBe('## a|');
    expect(h('## a|')).toBe('### a|');
    expect(h('### a|')).toBe('a|');
  });
  it('# 一级标题会进入 ##', () => {
    expect(h('# a|')).toBe('## a|');
  });
});

describe('continueList', () => {
  const enter = (m: string) => run(m, continueList);

  it('项目符号续写', () => {
    expect(enter('- a|')).toBe('- a\n- |');
    expect(enter('* a|')).toBe('* a\n* |');
  });

  it('编号自动加一，保留分隔符', () => {
    expect(enter('1. a|')).toBe('1. a\n2. |');
    expect(enter('9) a|')).toBe('9) a\n10) |');
  });

  it('待办续写为未完成', () => {
    expect(enter('- [x] 做完了|')).toBe('- [x] 做完了\n- [ ] |');
  });

  it('引用续写', () => {
    expect(enter('> 话|')).toBe('> 话\n> |');
  });

  it('保留缩进', () => {
    expect(enter('  - a|')).toBe('  - a\n  - |');
  });

  it('光标在行中间：后半段进入新的一项', () => {
    expect(enter('- ab|cd')).toBe('- ab\n- |cd');
  });

  it('空项：去掉前缀，结束列表', () => {
    expect(enter('- |')).toBe('|');
    expect(enter('1. |')).toBe('|');
    expect(enter('- [ ] |')).toBe('|');
  });

  it('空的嵌套项：先减一级缩进', () => {
    expect(enter('  - |')).toBe('- |');
  });

  it('不是列表行 / 光标在前缀里 / 有选区：交给浏览器', () => {
    expect(enter('普通文字|')).toBe('NULL');
    expect(enter('|- a')).toBe('NULL');
    expect(enter('-| a')).toBe('NULL');
    expect(enter('- «a»')).toBe('NULL');
  });

  it('代码块里不续写', () => {
    expect(enter('```\n- a|\n```')).toBe('NULL');
  });

  it('代码块结束后恢复续写', () => {
    expect(enter('```\nx\n```\n- a|')).toBe('```\nx\n```\n- a\n- |');
  });

  it('粗体/斜体行首的 * 不会被当成列表', () => {
    expect(enter('**粗**|')).toBe('NULL');
    expect(enter('*斜*|')).toBe('NULL');
  });
});

describe('indentSelection', () => {
  const tab = (m: string) => run(m, (v, s, e) => indentSelection(v, s, e, false));
  const shiftTab = (m: string) => run(m, (v, s, e) => indentSelection(v, s, e, true));

  it('列表项上 Tab：缩进一级', () => {
    expect(tab('- a|')).toBe('  - a|');
  });

  it('列表项上 Shift+Tab：减一级', () => {
    expect(shiftTab('  - a|')).toBe('- a|');
  });

  it('已经没有缩进时 Shift+Tab 不处理（让焦点正常移动）', () => {
    expect(shiftTab('- a|')).toBe('NULL');
  });

  it('普通文字上 Tab 不接管：键盘用户不会被困在编辑区', () => {
    expect(tab('hello|')).toBe('NULL');
    expect(tab('«hel»lo')).toBe('NULL');
  });

  it('多行选区：每行缩进，空行不加空格', () => {
    expect(tab('«a\n\nb»')).toBe('«  a\n\n  b»');
  });

  it('多行选区 Shift+Tab', () => {
    expect(shiftTab('«  a\n    b»')).toBe('«a\n  b»');
  });
});

describe('wikilink 补全', () => {
  it('检测未闭合的 [[ 和已输入的查询', () => {
    expect(findWikiLinkTrigger('见 [[项目', 7)).toEqual({ start: 2, query: '项目' });
    expect(findWikiLinkTrigger('[[', 2)).toEqual({ start: 0, query: '' });
  });

  it('已闭合、跨行、单个 [ 都不触发', () => {
    expect(findWikiLinkTrigger('[[a]] b', 7)).toBeNull();
    expect(findWikiLinkTrigger('[[a\nb', 5)).toBeNull();
    expect(findWikiLinkTrigger('[文字](url', 10)).toBeNull();
    expect(findWikiLinkTrigger('没有链接', 4)).toBeNull();
  });

  it('补全为 [[标题]]，光标落在 ]] 之后', () => {
    const value = '见 [[项';
    const trigger = findWikiLinkTrigger(value, value.length)!;
    const edit = completeWikiLink(value, trigger, value.length, '项目计划');
    expect(applyEdit(value, edit)).toBe('见 [[项目计划]]');
    expect(edit.selectionStart).toBe('见 [[项目计划]]'.length);
  });

  it('光标后已有 ]] 时不重复', () => {
    const value = '[[项]] 后文';
    const caret = 3;
    const trigger = findWikiLinkTrigger(value, caret)!;
    const edit = completeWikiLink(value, trigger, caret, '项目');
    expect(applyEdit(value, edit)).toBe('[[项目]] 后文');
  });

  it('isLinkableTitle 排除空标题和含 ] 的标题', () => {
    expect(isLinkableTitle('正常')).toBe(true);
    expect(isLinkableTitle('  ')).toBe(false);
    expect(isLinkableTitle('a]b')).toBe(false);
  });
});

describe('isInsideCodeFence', () => {
  it('按围栏行的奇偶判断', () => {
    expect(isInsideCodeFence('```\nx', 5)).toBe(true);
    expect(isInsideCodeFence('```\nx\n```\ny', 11)).toBe(false);
    expect(isInsideCodeFence('plain', 3)).toBe(false);
  });
});

describe('文本以换行开头、光标在 0（行首边界）', () => {
  // 回归：lineStartOf 在 pos=0 时曾把下标 0 的换行当成“上一行的结尾”，返回 1，
  // 前缀被插到错误的位置（"\nabc" → "\n## \nabc"）
  it('cycleHeading 作用在第一行（空行）上', () => {
    expect(applyEdit('\nabc', cycleHeading('\nabc', 0))).toBe('## \nabc');
  });

  it('toggleLinePrefix 作用在第一行（空行）上', () => {
    expect(applyEdit('\nabc', toggleLinePrefix('\nabc', 0, 0, 'bullet'))).toBe('- \nabc');
  });

  it('findWikiLinkTrigger 在文本开头仍然可用', () => {
    expect(findWikiLinkTrigger('[[ab', 4)).toEqual({ start: 0, query: 'ab' });
    expect(findWikiLinkTrigger('\n[[ab', 5)).toEqual({ start: 1, query: 'ab' });
  });
});

describe('isInsideCodeFence（更多情形）', () => {
  it('只数光标所在行之前的围栏', () => {
    const v = '```\na\n```\nb\n```\nc';
    expect(isInsideCodeFence(v, v.indexOf('a'))).toBe(true);
    expect(isInsideCodeFence(v, v.indexOf('b'))).toBe(false);
    expect(isInsideCodeFence(v, v.indexOf('c'))).toBe(true);
  });

  it('围栏行本身不算“在代码块里”，缩进的围栏和 ~~~ 也算围栏', () => {
    expect(isInsideCodeFence('```\nx', 1)).toBe(false);
    expect(isInsideCodeFence('  ~~~\nx', 7)).toBe(true);
  });

  it('光标在最开头不会误判', () => {
    expect(isInsideCodeFence('```\nx', 0)).toBe(false);
    expect(isInsideCodeFence('', 0)).toBe(false);
  });
});

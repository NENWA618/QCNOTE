import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import NoteEditor from '../components/NoteEditor';
import type { NoteItem } from '../lib/storage';
import {
  editorContent,
  editorSelection,
  editorText,
  editorView,
  pressKey,
  setContent,
  typeText,
} from './editorHarness';

afterEach(() => cleanup());

const note = (over: Partial<NoteItem> = {}): NoteItem => ({
  id: 'cur',
  title: '当前笔记',
  content: '',
  category: '',
  tags: [],
  color: '#dc96b4',
  createdAt: 1,
  updatedAt: 1,
  links: [],
  backlinks: [],
  versions: [],
  ...over,
});

const OTHERS = [
  note({ id: 'a', title: '项目计划', updatedAt: 30 }),
  note({ id: 'b', title: '读书笔记', updatedAt: 20 }),
  note({ id: 'c', title: '已删除的', updatedAt: 40, isDeleted: true }),
  note({ id: 'd', title: '含]括号', updatedAt: 50 }),
];

function setup(over: Partial<React.ComponentProps<typeof NoteEditor>> = {}) {
  const props = {
    note: note(),
    isVisible: true,
    isPreview: false,
    relatedNotes: [],
    allNotes: [note(), ...OTHERS],
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onChange: vi.fn(),
    onTogglePreview: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
  render(<NoteEditor {...props} />);
  return props;
}

describe('格式工具栏与快捷键', () => {
  it('有带名称的工具栏，Tab 顺序里只有一个按钮（roving tabindex）', () => {
    setup();
    const toolbar = screen.getByRole('toolbar', { name: 'Markdown 格式' });
    const buttons = Array.from(toolbar.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(8);
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByRole('button', { name: '粗体' })).toBeInTheDocument();
  });

  it('方向键在工具栏按钮之间移动焦点', async () => {
    const user = userEvent.setup();
    setup();
    const bold = screen.getByRole('button', { name: '粗体' });
    bold.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: '斜体' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    // 回绕到最后一个
    expect(screen.getByRole('button', { name: '链接到其他笔记' })).toHaveFocus();
  });

  it('点“粗体”：把选中的文字包上 **', () => {
    const { onChange } = setup();
    setContent('你好世界', 0, 2);
    fireEvent.click(screen.getByRole('button', { name: '粗体' }));
    expect(editorText()).toBe('**你好**世界');
    expect(onChange).toHaveBeenLastCalledWith('content', '**你好**世界');
  });

  it('Ctrl+B / Ctrl+I / Ctrl+K', async () => {
    setup();
    setContent('abc', 0, 3);
    expect(await pressKey('b', { ctrlKey: true })).toBe(false); // 编辑器接管了
    expect(editorText()).toBe('**abc**');

    setContent('abc', 0, 3);
    await pressKey('i', { ctrlKey: true });
    expect(editorText()).toBe('*abc*');

    setContent('abc', 0, 3);
    await pressKey('k', { ctrlKey: true });
    expect(editorText()).toBe('[abc](url)');
  });

  it('在列表项末尾按 Enter：续写下一项；空项再按一次：结束列表', async () => {
    setup();
    setContent('- 买菜');
    expect(await pressKey('Enter')).toBe(false);
    expect(editorText()).toBe('- 买菜\n- ');

    expect(await pressKey('Enter')).toBe(false);
    expect(editorText()).toBe('- 买菜\n');
  });

  it('普通文字上按 Enter 只换行（不自动缩进）；Shift+Enter 不续写列表', async () => {
    setup();
    setContent('  普通文字');
    await pressKey('Enter');
    expect(editorText()).toBe('  普通文字\n');

    setContent('- 列表');
    await pressKey('Enter', { shiftKey: true });
    expect(editorText()).toBe('- 列表\n');
  });

  it('输入法选词中按 Enter 不会续写列表', async () => {
    setup();
    setContent('- 买菜');
    await pressKey('Enter', { isComposing: true });
    expect(editorText()).toBe('- 买菜');
    // Safari 在 compositionend 之后的同一个 keydown 里 isComposing 已是 false，但 keyCode 仍是 229
    await pressKey('Enter', { keyCode: 229 });
    expect(editorText()).toBe('- 买菜');
    // 普通的 Enter 仍然续写
    await pressKey('Enter');
    expect(editorText()).toBe('- 买菜\n- ');
  });

  it('列表项上 Tab 缩进；普通文字上 Tab 不拦截（键盘用户能离开编辑区）', async () => {
    setup();
    setContent('- a');
    expect(await pressKey('Tab')).toBe(false);
    expect(editorText()).toBe('  - a');

    setContent('普通文字');
    expect(await pressKey('Tab')).toBe(true);
    expect(editorText()).toBe('普通文字');
  });

  it('Ctrl+Z 能撤销一次格式化（编辑走 CodeMirror 的历史记录）', async () => {
    setup();
    setContent('abc', 0, 3);
    await pressKey('b', { ctrlKey: true });
    expect(editorText()).toBe('**abc**');
    await pressKey('z', { ctrlKey: true });
    expect(editorText()).toBe('abc');
  });

  it('Esc 不被编辑器吞掉：能传到外层关闭编辑器', async () => {
    const props = setup();
    await pressKey('Escape');
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('可编辑区有名称，并带 textbox 语义', () => {
    setup();
    expect(editorContent()).toHaveAttribute('aria-multiline', 'true');
  });
});

describe('[[ 双链补全', () => {
  const typeInto = async (text: string) => {
    editorView().focus();
    await typeText(text);
  };

  it('输入 [[ 后列出其他笔记：不含自己、回收站里的、标题含 ] 的', async () => {
    setup();
    await typeInto('[[');
    const list = await screen.findByRole('listbox', { name: '链接到笔记' });
    const names = Array.from(list.querySelectorAll('[role=option]')).map((o) => o.textContent);
    expect(names).toEqual(['项目计划', '读书笔记']); // 按最近编辑排序
    expect(editorContent()).toHaveAttribute(
      'aria-activedescendant',
      list.querySelector('[role=option]')!.id,
    );
    expect(editorContent()).toHaveAttribute('aria-controls', list.id);
  });

  it('继续输入会过滤；Enter 补全为 [[标题]] 并关闭菜单', async () => {
    setup();
    await typeInto('见 [[读书');
    const list = await screen.findByRole('listbox', { name: '链接到笔记' });
    // 限定在菜单内：分类下拉框里的 <option> 也是 option 角色
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    expect(await pressKey('Enter')).toBe(false); // 菜单接管了 Enter
    expect(editorText()).toBe('见 [[读书笔记]]');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('方向键选择，Tab 确认', async () => {
    setup();
    await typeInto('[[');
    await screen.findByRole('listbox');
    await pressKey('ArrowDown');
    await pressKey('Tab');
    expect(editorText()).toBe('[[读书笔记]]');
  });

  it('Esc 只关闭菜单，不关闭编辑器；继续输入前不会再弹出', async () => {
    const props = setup();
    await typeInto('[[');
    await screen.findByRole('listbox');
    expect(await pressKey('Escape')).toBe(false); // 菜单吃掉了这个 Esc
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(props.onCancel).not.toHaveBeenCalled();
    // 再输入字符 → 视为新一轮，重新出现
    await typeText('项');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('没有匹配时不显示菜单，Enter 照常（不被吞掉）', async () => {
    setup();
    await typeInto('[[zzzz');
    expect(screen.queryByRole('listbox')).toBeNull();
    await pressKey('Enter');
    expect(editorText()).toBe('[[zzzz\n');
  });

  it('不传 allNotes 时没有补全', async () => {
    setup({ allNotes: undefined });
    await typeInto('[[');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(editorContent()).not.toHaveAttribute('aria-autocomplete');
  });

  it('点击选项补全', async () => {
    setup();
    await typeInto('[[');
    fireEvent.click(await screen.findByRole('option', { name: '项目计划' }));
    expect(editorText()).toBe('[[项目计划]]');
  });

  it('工具栏的 [[ ]] 按钮：光标落在中间并弹出补全', async () => {
    setup();
    editorView().focus();
    fireEvent.click(screen.getByRole('button', { name: '链接到其他笔记' }));
    expect(editorText()).toBe('[[]]');
    expect(editorSelection()).toEqual({ from: 2, to: 2 });
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });
});

describe('保存与未保存提示', () => {
  it('Ctrl+S 保存但不关闭，并以 keepOpen 通知上层；保存成功后“未保存”消失', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const props = setup({ onSave });
    setContent('改动');
    expect(await screen.findByText('未保存')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ keepOpen: true }));
    await waitFor(() => expect(screen.queryByText('未保存')).toBeNull());
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('保存失败（返回 false）：仍显示“未保存”', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    setup({ onSave });
    setContent('改动');
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(screen.getByText('未保存')).toBeInTheDocument();
  });

  it('保存期间继续输入的内容，保存后仍算未保存', async () => {
    let finish: (v: boolean) => void = () => {};
    const onSave = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
    setup({ onSave });
    setContent('第一版');
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    setContent('第一版，又写了一点');
    await act(async () => finish(true));
    expect(screen.getByText('未保存')).toBeInTheDocument();
  });

  it('保存进行中重复触发会被忽略', async () => {
    let finish: (v: boolean) => void = () => {};
    const onSave = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
    setup({ onSave });
    setContent('x');
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => finish(true));
  });

  it('“保存”按钮：保存并关闭（不带 keepOpen）', () => {
    const onSave = vi.fn();
    setup({ onSave });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it('有未保存更改时，关闭标签页会触发浏览器确认；没有更改时不拦截', () => {
    setup();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    setContent('改动');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

describe('状态栏', () => {
  it('显示中英文混排的字数和阅读时间', () => {
    setup();
    setContent('你好世界 hello world');
    expect(screen.getByText(/6 字 · 约 1 分钟读完/)).toBeInTheDocument();
  });

  it('没有内容时只显示 0 字', () => {
    setup();
    expect(screen.getByText(/^0 字$/)).toBeInTheDocument();
  });
});

describe('分屏', () => {
  it('窄屏不提供分屏按钮', () => {
    setup();
    expect(screen.queryByRole('button', { name: '分屏' })).toBeNull();
  });

  it('宽屏：按钮切换实时预览，并记住偏好', async () => {
    const mm = window.matchMedia as unknown as ReturnType<typeof vi.fn>;
    const original = mm.getMockImplementation();
    mm.mockImplementation((query: string) => ({
      matches: query.includes('min-width: 1024px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    try {
      localStorage.removeItem('qcnote:editor-split');
      setup({ note: note({ content: '# 标题一' }) });
      const toggle = screen.getByRole('button', { name: '分屏' });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByRole('region', { name: '实时预览' })).toBeNull();

      fireEvent.click(toggle);
      const pane = await screen.findByRole('region', { name: '实时预览' });
      expect(pane).toHaveTextContent('当前笔记');
      expect(localStorage.getItem('qcnote:editor-split')).toBe('true');
    } finally {
      mm.mockImplementation(original!);
      localStorage.removeItem('qcnote:editor-split');
    }
  });
});

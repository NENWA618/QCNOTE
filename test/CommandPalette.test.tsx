import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CommandPalette, { type PaletteCommand } from '../components/CommandPalette';
import type { NoteItem } from '../lib/storage';

afterEach(() => cleanup());

const note = (id: string, title: string, over: Partial<NoteItem> = {}): NoteItem => ({
  id,
  title,
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

const NOTES = [
  note('a', '项目计划', { updatedAt: 10, category: '工作', content: '本季度的 [[里程碑]] 安排' }),
  note('b', '读书笔记', { updatedAt: 30, tags: ['阅读'] }),
  note('c', '周报 2024', { updatedAt: 20 }),
];

function setup(over: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const run = vi.fn();
  const onClose = vi.fn();
  const commands: PaletteCommand[] = [
    { id: 'new', label: '新建笔记', icon: '➕', shortcut: 'N', run },
    { id: 'cal', label: '切换到日历视图', keywords: 'calendar 月历', run: vi.fn() },
  ];
  const props = {
    isOpen: true,
    notes: NOTES,
    commands,
    onClose,
    onOpenNote: vi.fn(),
    onCreateNote: vi.fn(),
    ...over,
  };
  render(<CommandPalette {...props} />);
  return { props, run, commands, onClose };
}

const input = () => screen.getByRole('combobox');
const options = () => screen.getAllByRole('option');

describe('CommandPalette', () => {
  it('关闭时不渲染任何东西', () => {
    setup({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('打开后是带名称的模态对话框，焦点在输入框', () => {
    setup();
    expect(screen.getByRole('dialog', { name: '快速跳转与命令' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(input()).toHaveFocus();
  });

  it('没有输入时：按最近编辑时间列出笔记，并列出全部命令', () => {
    setup();
    const names = options().map((o) => o.textContent);
    expect(names[0]).toContain('读书笔记'); // updatedAt 最大
    expect(names[1]).toContain('周报 2024');
    expect(names[2]).toContain('项目计划');
    expect(screen.getByRole('option', { name: /新建笔记/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /日历视图/ })).toBeInTheDocument();
  });

  it('输入查询：模糊匹配标题，并提供“新建笔记「查询」”', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), '计划');
    expect(options()[0]).toHaveTextContent('项目计划');
    expect(screen.queryByText('读书笔记')).toBeNull();
    expect(screen.getByRole('option', { name: /新建笔记「计划」/ })).toBeInTheDocument();
  });

  it('命中的字符会被高亮', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), '计划');
    const hit = options()[0].querySelector('.text-ink-pink');
    expect(hit).toHaveTextContent('计划');
  });

  it('标题没命中时，可以按标签找到笔记', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), '阅读');
    expect(options()[0]).toHaveTextContent('读书笔记');
  });

  it('命令可以通过关键词（不显示的搜索词）找到', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), 'calendar');
    expect(screen.getByRole('option', { name: /日历视图/ })).toBeInTheDocument();
  });

  it('已有同名笔记时不提供“新建”，避免做出重名笔记', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(input(), '读书笔记');
    expect(screen.queryByRole('option', { name: /新建笔记「/ })).toBeNull();
  });

  it('Enter 打开选中的笔记并关闭面板', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.type(input(), '周报');
    await user.keyboard('{Enter}');
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onOpenNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
  });

  it('方向键移动选中项，aria-activedescendant 跟随；到底后回绕', async () => {
    const user = userEvent.setup();
    setup();
    const first = options()[0];
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', first.id);

    await user.keyboard('{ArrowDown}');
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', options()[1].id);

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(options()[options().length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('选中“新建笔记「…」”并回车：用查询词作标题新建', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.type(input(), '全新的想法');
    await user.keyboard('{Enter}');
    expect(props.onCreateNote).toHaveBeenCalledWith('全新的想法');
    expect(props.onOpenNote).not.toHaveBeenCalled();
  });

  it('选中命令并回车：先关闭，再执行命令', async () => {
    const user = userEvent.setup();
    const { run, onClose } = setup();
    const order: string[] = [];
    onClose.mockImplementation(() => order.push('close'));
    run.mockImplementation(() => order.push('run'));
    await user.type(input(), '新建笔记');
    // 图标是 aria-hidden 的，所以命令项的可访问名称是“标签 + 快捷键”；
    // 同时存在的“新建笔记「新建笔记」”是另一项
    await user.click(screen.getByRole('option', { name: '新建笔记 N' }));
    expect(order).toEqual(['close', 'run']);
  });

  it('Esc 关闭，且不会冒泡给外层的 Esc 处理器', () => {
    const outer = vi.fn();
    const { props } = setup();
    document.addEventListener('keydown', outer);
    fireEvent.keyDown(input(), { key: 'Escape' });
    document.removeEventListener('keydown', outer);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('点击背景关闭', () => {
    const { props } = setup();
    fireEvent.click(document.querySelector('.dialog-backdrop')!);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('输入法选词中：Enter 和 Esc 都不触发面板操作', () => {
    const { props } = setup();
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input(), { key: 'Escape', isComposing: true });
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onOpenNote).not.toHaveBeenCalled();
  });

  it('关闭再打开：输入框是空的', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.type(input(), '计划');
    cleanup();
    render(<CommandPalette {...props} />);
    expect(input()).toHaveValue('');
  });
});

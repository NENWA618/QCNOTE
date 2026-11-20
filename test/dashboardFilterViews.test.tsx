import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import type { NoteItem } from '../lib/storage';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signOut: vi.fn(),
}));
vi.mock('next/head', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
// 这三个视图只关心“拿到了哪些笔记”：用桩把收到的 props 露出来
vi.mock('../components/Calendar', () => ({
  Calendar: ({ notes }: { notes: NoteItem[] }) => (
    <div data-testid="calendar">{notes.map((n) => n.content).join('|')}</div>
  ),
}));
vi.mock('../components/Timeline', () => ({
  Timeline: ({ notes }: { notes: NoteItem[] }) => (
    <div data-testid="timeline">{notes.map((n) => n.content).join('|')}</div>
  ),
}));
vi.mock('../components/KnowledgeGraph', () => ({
  KnowledgeGraph: ({
    notes,
    highlightIds,
  }: {
    notes: NoteItem[];
    highlightIds?: ReadonlySet<string>;
  }) => (
    <div
      data-testid="graph"
      data-total={notes.filter((n) => !n.isDeleted).length}
      data-highlight={highlightIds ? highlightIds.size : 'none'}
    />
  ),
}));

import Dashboard from '../pages/dashboard';
import { setContent } from './editorHarness';

afterEach(() => cleanup());

// 笔记走真实存储（fake-indexeddb），整套并行跑时可能比较慢：每一步都等可观察的结果，
// 并给足超时，而不是靠固定睡眠去猜它什么时候写完
const SLOW = { timeout: 5000 };
const count = () => Number(screen.getByText(/^\d+( \/ \d+)? 篇$/).textContent!.match(/^\d+/)![0]);

async function createNote(content: string) {
  const before = count();
  fireEvent.click(screen.getByRole('button', { name: '新建笔记' }));
  await screen.findByRole('dialog', { name: '新建笔记' }, SLOW);
  setContent(content);
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(count()).toBe(before + 1), SLOW);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), SLOW);
}

const goto = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const searchBox = () => screen.getByRole('searchbox', { name: '搜索笔记' });

describe('Dashboard：列表的筛选条件对日历、时间线、图谱同样生效', () => {
  it('搜索词让日历和时间线只剩命中的笔记，图谱保留全部节点但只高亮命中的', async () => {
    render(<Dashboard />);
    await screen.findByRole('heading', { name: '笔记管理' }, SLOW);
    await createNote('苹果派的做法');
    await createNote('香蕉船的做法');

    // 没有筛选：三个视图拿到全部笔记，图谱没有高亮集合，标题旁也没有计数
    goto('日历');
    expect(screen.getByTestId('calendar').textContent).toContain('苹果派');
    expect(screen.getByTestId('calendar').textContent).toContain('香蕉船');
    expect(screen.queryByText(/^\d+ \/ \d+ 篇$/)).toBeNull();
    goto('图谱');
    expect(screen.getByTestId('graph')).toHaveAttribute('data-highlight', 'none');
    expect(screen.getByTestId('graph')).toHaveAttribute('data-total', '2');

    await userEvent.type(searchBox(), '苹果');
    await waitFor(
      () => expect(screen.getByTestId('graph')).toHaveAttribute('data-highlight', '1'),
      SLOW,
    );
    // 图谱：全部 2 个节点都还在（只是淡化），布局不会因为输入搜索词而重来
    expect(screen.getByTestId('graph')).toHaveAttribute('data-total', '2');
    // 非列表视图在有筛选时也显示“命中 / 总数”
    expect(screen.getByText('1 / 2 篇')).toBeInTheDocument();

    goto('日历');
    expect(screen.getByTestId('calendar').textContent).toBe('苹果派的做法');
    goto('时间线');
    expect(screen.getByTestId('timeline').textContent).toBe('苹果派的做法');

    // 清掉搜索词后恢复
    fireEvent.change(searchBox(), { target: { value: '' } });
    await waitFor(
      () => expect(screen.getByTestId('timeline').textContent).toContain('香蕉船'),
      SLOW,
    );
    goto('图谱');
    expect(screen.getByTestId('graph')).toHaveAttribute('data-highlight', 'none');
  });
});

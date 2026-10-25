import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

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

import Dashboard from '../pages/dashboard';

afterEach(() => cleanup());

describe('Dashboard 命令面板', () => {
  it('Ctrl+K 打开、再按一次关闭；🔎 按钮也能打开', async () => {
    render(<Dashboard />);
    await screen.findByRole('heading', { name: '笔记管理' });

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await screen.findByRole('dialog', { name: '快速跳转与命令' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '快速跳转与命令' })).toBeNull(),
    );

    fireEvent.click(screen.getByRole('button', { name: '快速跳转' }));
    expect(await screen.findByRole('dialog', { name: '快速跳转与命令' })).toBeInTheDocument();
  });

  it('选择“新建笔记”命令：关闭面板并打开编辑器', async () => {
    render(<Dashboard />);
    await screen.findByRole('heading', { name: '笔记管理' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const option = await screen.findByRole('option', { name: /^新建笔记$/ });
    fireEvent.click(option);

    expect(await screen.findByRole('dialog', { name: '编辑笔记' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '快速跳转与命令' })).toBeNull();
  });

  it('编辑器打开时 Ctrl+K 不会叠出面板', async () => {
    render(<Dashboard />);
    await screen.findByRole('heading', { name: '笔记管理' });
    fireEvent.click(screen.getByRole('button', { name: '新建笔记' }));
    await screen.findByRole('dialog', { name: '编辑笔记' });

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog', { name: '快速跳转与命令' })).toBeNull();
  });

  it('切换视图命令生效', async () => {
    render(<Dashboard />);
    await screen.findByRole('heading', { name: '笔记管理' });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.click(await screen.findByRole('option', { name: '切换到日历视图' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '日历' })).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('Ctrl+S 保存后编辑器保持打开，输入的内容不丢，“未保存”消失', async () => {
    render(<Dashboard />);
    await screen.findByRole('heading', { name: '笔记管理' });
    fireEvent.click(screen.getByRole('button', { name: '新建笔记' }));
    await screen.findByRole('dialog', { name: '编辑笔记' });

    const area = screen.getByPlaceholderText(/开始记录您的想法/) as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: '第一段内容' } });
    expect(await screen.findByText('未保存')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(screen.queryByText('未保存')).toBeNull());

    expect(screen.getByRole('dialog', { name: '编辑笔记' })).toBeInTheDocument();
    expect(area.value).toBe('第一段内容');
  });

  describe('取消新建的空笔记', () => {
    const countText = () => screen.getByText(/^\d+( \/ \d+)? 篇$/).textContent;
    const openNew = async () => {
      render(<Dashboard />);
      await screen.findByRole('heading', { name: '笔记管理' });
      // 笔记是异步从存储加载的（前面的用例也往同一个库里留下了笔记）：等列表稳定后再取基线
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });
      const before = countText();
      fireEvent.click(screen.getByRole('button', { name: '新建笔记' }));
      await screen.findByRole('dialog', { name: '编辑笔记' });
      return before;
    };

    it('什么都没写就取消：空笔记被清掉，不进回收站', async () => {
      const before = await openNew();
      await waitFor(() => expect(countText()).not.toBe(before)); // 建出来了
      fireEvent.click(screen.getByRole('button', { name: '取消' }));
      await waitFor(() => expect(countText()).toBe(before));
    });

    it('写了内容再取消（确认放弃更改）：笔记保留，因为它已被改动过', async () => {
      const before = await openNew();
      const area = screen.getByPlaceholderText(/开始记录您的想法/);
      fireEvent.change(area, { target: { value: '有内容' } });
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
      await waitFor(() => expect(screen.queryByText('未保存')).toBeNull());
      fireEvent.click(screen.getByRole('button', { name: '取消' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑笔记' })).toBeNull());
      expect(countText()).not.toBe(before);
    });

    it('改了标题（还没写正文）再取消：不会被当成空壳删掉', async () => {
      const before = await openNew();
      fireEvent.change(screen.getByPlaceholderText('笔记标题'), { target: { value: '我的标题' } });
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
      await waitFor(() => expect(screen.queryByText('未保存')).toBeNull());
      fireEvent.click(screen.getByRole('button', { name: '取消' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑笔记' })).toBeNull());
      expect(countText()).not.toBe(before);
    });
  });
});

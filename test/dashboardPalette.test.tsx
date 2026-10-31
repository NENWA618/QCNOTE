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
import { editorText, setContent } from './editorHarness';

afterEach(() => cleanup());

describe('Dashboard 命令面板', () => {
  it('Ctrl+K 打开、再按一次关闭；顶栏不再有跳转按钮', async () => {
    render(<Dashboard />);
    await screen.findByRole('heading', { name: '笔记管理' });

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(await screen.findByRole('dialog', { name: '快速跳转与命令' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '快速跳转与命令' })).toBeNull(),
    );

    expect(screen.queryByRole('button', { name: '快速跳转' })).toBeNull();
    expect(screen.getByPlaceholderText(/Ctrl\+K/)).toBeInTheDocument();
  });

  it('选择“新建笔记”命令：关闭面板并打开编辑器', async () => {
    render(<Dashboard />);
    await screen.findByRole('heading', { name: '笔记管理' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const option = await screen.findByRole('option', { name: /^新建笔记$/ });
    fireEvent.click(option);

    expect(await screen.findByRole('dialog', { name: '新建笔记' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '快速跳转与命令' })).toBeNull();
  });

  it('编辑器打开时 Ctrl+K 不会叠出面板', async () => {
    render(<Dashboard />);
    await screen.findByRole('heading', { name: '笔记管理' });
    fireEvent.click(screen.getByRole('button', { name: '新建笔记' }));
    await screen.findByRole('dialog', { name: '新建笔记' });

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
    await screen.findByRole('dialog', { name: '新建笔记' });

    setContent('第一段内容');
    expect(await screen.findByText('未保存')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(screen.queryByText('未保存')).toBeNull());

    // 保存后它已经是一篇真正的笔记了：对话框标题变成“编辑笔记”
    expect(screen.getByRole('dialog', { name: '编辑笔记' })).toBeInTheDocument();
    expect(editorText()).toBe('第一段内容');
  });

  describe('新建笔记是草稿：保存时才创建', () => {
    const countText = () => screen.getByText(/^\d+( \/ \d+)? 篇$/).textContent;
    const count = () => Number(countText()!.match(/^\d+/)![0]);
    const openNew = async () => {
      render(<Dashboard />);
      await screen.findByRole('heading', { name: '笔记管理' });
      // 笔记是异步从存储加载的（前面的用例也往同一个库里留下了笔记）：等列表稳定后再取基线
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });
      const before = count();
      fireEvent.click(screen.getByRole('button', { name: '新建笔记' }));
      await screen.findByRole('dialog', { name: '新建笔记' });
      return before;
    };

    it('点新建不会写入存储；什么都没写就取消，列表保持原样', async () => {
      const before = await openNew();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
      expect(count()).toBe(before); // 编辑器开着，但还没有这篇笔记
      fireEvent.click(screen.getByRole('button', { name: '取消' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
      expect(count()).toBe(before);
    });

    it('新建时没有“删除”和“历史”这类只对已有笔记有意义的按钮', async () => {
      await openNew();
      expect(screen.queryByRole('button', { name: '删除' })).toBeNull();
    });

    it('第一次保存才创建；继续编辑再保存是更新，不会重复创建', async () => {
      const before = await openNew();
      setContent('第一版');
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
      await waitFor(() => expect(count()).toBe(before + 1));

      setContent('第二版');
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
      await waitFor(() => expect(screen.queryByText('未保存')).toBeNull());
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
      expect(count()).toBe(before + 1);
      expect(editorText()).toBe('第二版');
    });

    it('“保存”按钮：创建并关闭编辑器', async () => {
      const before = await openNew();
      setContent('要保存的');
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(count()).toBe(before + 1));
    });

    it('命令面板带标题新建：标题已填好，保存前同样不入库', async () => {
      render(<Dashboard />);
      await screen.findByRole('heading', { name: '笔记管理' });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 150));
      });
      const before = count();
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      fireEvent.change(await screen.findByRole('combobox'), {
        target: { value: '全新的想法ZZ' },
      });
      fireEvent.click(await screen.findByRole('option', { name: /新建笔记「全新的想法ZZ」/ }));

      await screen.findByRole('dialog', { name: '新建笔记' });
      expect(screen.getByPlaceholderText('笔记标题')).toHaveValue('全新的想法ZZ');
      expect(count()).toBe(before);
    });
  });
});

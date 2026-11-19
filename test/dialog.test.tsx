import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import DialogHost from '../components/DialogHost';
import { confirmDialog, alertDialog, promptDialog } from '../lib/dialog';
import { isImeComposing } from '../lib/ime';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('isImeComposing', () => {
  it('识别 isComposing 和 Safari 的 keyCode 229', () => {
    expect(isImeComposing({ isComposing: true })).toBe(true);
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeComposing({ isComposing: false, keyCode: 27 })).toBe(false);
    expect(isImeComposing({})).toBe(false);
  });
});

describe('对话框宿主未挂载时', () => {
  it('退回原生 confirm，行为与改造前一致', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await expect(confirmDialog({ description: '确定？' })).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith('确定？');
  });
});

describe('DialogHost', () => {
  it('点击确定返回 true，点击取消返回 false', async () => {
    render(<DialogHost />);

    let result!: Promise<boolean>;
    act(() => {
      result = confirmDialog({ title: '删除？', description: '不可恢复', confirmLabel: '删除' });
    });
    expect(screen.getByRole('alertdialog', { name: '删除？' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await expect(result).resolves.toBe(true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    act(() => {
      result = confirmDialog({ description: '再来一次' });
    });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await expect(result).resolves.toBe(false);
  });

  it('危险操作默认聚焦“取消”，避免回车误触', () => {
    render(<DialogHost />);
    act(() => {
      void confirmDialog({ description: '危险', tone: 'danger', confirmLabel: '删除' });
    });
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
  });

  it('Esc 取消；输入法选词期间的 Esc 不关闭', async () => {
    render(<DialogHost />);
    let result!: Promise<boolean>;
    act(() => {
      result = confirmDialog({ description: '确定？' });
    });

    fireEvent.keyDown(document, { key: 'Escape', isComposing: true });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape', keyCode: 229 });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await expect(result).resolves.toBe(false);
  });

  it('Esc 不会冒泡到页面上其它的 Esc 处理器（如编辑器）', () => {
    const pageHandler = vi.fn();
    window.addEventListener('keydown', pageHandler);
    render(<DialogHost />);
    act(() => {
      void confirmDialog({ description: '确定？' });
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(pageHandler).not.toHaveBeenCalled();
    window.removeEventListener('keydown', pageHandler);
  });

  it('关闭后焦点还给打开前的元素', async () => {
    render(
      <>
        <button>触发</button>
        <DialogHost />
      </>,
    );
    const trigger = screen.getByRole('button', { name: '触发' });
    trigger.focus();
    act(() => {
      void confirmDialog({ description: '确定？' });
    });
    expect(trigger).not.toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger).toHaveFocus();
  });

  it('Tab 焦点在对话框内循环', () => {
    render(<DialogHost />);
    act(() => {
      void confirmDialog({ description: '确定？' });
    });
    const cancel = screen.getByRole('button', { name: '取消' });
    const ok = screen.getByRole('button', { name: '确定' });
    ok.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(ok).toHaveFocus();
  });

  it('alert 只有一个按钮，点击后 resolve', async () => {
    render(<DialogHost />);
    let result!: Promise<void>;
    act(() => {
      result = alertDialog({ description: '失败了' });
    });
    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    await expect(result).resolves.toBeUndefined();
  });

  it('prompt 返回输入内容；Enter 提交，输入法回车不提交；取消返回 null', async () => {
    render(<DialogHost />);
    let result!: Promise<string | null>;
    act(() => {
      result = promptDialog({ description: '输入“清空”', placeholder: '清空' });
    });
    const input = screen.getByPlaceholderText('清空');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '清空' } });

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    await expect(result).resolves.toBe('清空');

    act(() => {
      result = promptDialog({ description: '输入' });
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await expect(result).resolves.toBeNull();
  });

  it('多个对话框按顺序依次显示', async () => {
    render(<DialogHost />);
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = confirmDialog({ title: '第一个', description: 'a' });
      second = confirmDialog({ title: '第二个', description: 'b' });
    });
    expect(screen.getByRole('alertdialog', { name: '第一个' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await first;
    expect(screen.getByRole('alertdialog', { name: '第二个' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await expect(second).resolves.toBe(true);
  });
});

describe('宿主卸载', () => {
  it('排队中的对话框按取消收尾，调用方不会一直挂起', async () => {
    const { unmount } = render(<DialogHost />);
    let result!: Promise<boolean>;
    act(() => {
      result = confirmDialog({ description: '确定？', tone: 'danger' });
    });
    unmount();
    await expect(result).resolves.toBe(false);
  });
});

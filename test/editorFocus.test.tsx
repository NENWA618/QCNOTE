import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import NoteEditor from '../components/NoteEditor';
import { NoteItem } from '../lib/storage';

afterEach(() => cleanup());

const note = (over: Partial<NoteItem> = {}): NoteItem => ({
  id: 'n1',
  title: '标题',
  content: '正文',
  category: '学习',
  tags: [],
  color: '#dc96b4',
  createdAt: 1,
  updatedAt: 1,
  links: [],
  backlinks: [],
  versions: [],
  ...over,
});

const props = (n: NoteItem | null, isVisible = true) => ({
  note: n,
  isVisible,
  isPreview: false,
  relatedNotes: [],
  onSave: vi.fn(),
  onCancel: vi.fn(),
  onChange: vi.fn(),
  onTogglePreview: vi.fn(),
  onDelete: vi.fn(),
  onOpenRelatedNote: vi.fn(),
  onRevertVersion: vi.fn(),
});

describe('NoteEditor 作为模态面板', () => {
  it('暴露 dialog 语义，并以标题命名', () => {
    render(<NoteEditor {...props(note())} />);
    const dialog = screen.getByRole('dialog', { name: '编辑笔记' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('已有笔记：焦点落在面板上（不抢键盘）；新笔记：焦点落在标题输入框', () => {
    const { unmount } = render(<NoteEditor {...props(note())} />);
    expect(screen.getByRole('dialog')).toHaveFocus();
    unmount();

    render(<NoteEditor {...props(note({ id: '', title: '' }))} />);
    expect(screen.getByPlaceholderText('笔记标题')).toHaveFocus();
  });

  it('Tab 在面板内循环：最后一个控件 Tab 回到第一个，面板上 Shift+Tab 到最后一个', () => {
    render(<NoteEditor {...props(note())} />);
    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      ),
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    dialog.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('关闭后焦点还给打开前的元素', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(<NoteEditor {...props(note())} />);
    expect(trigger).not.toHaveFocus();

    rerender(<NoteEditor {...props(note(), false)} />);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});

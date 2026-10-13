import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { NoteItem } from '../lib/storage';

const makeNote = (over: Partial<NoteItem>): NoteItem => ({
  id: 'n',
  title: 'Note',
  content: '',
  category: 'Tech',
  tags: [],
  color: '#ff0000',
  createdAt: 0,
  updatedAt: 0,
  links: [],
  backlinks: [],
  ...over,
});

const CANVAS_SIZE = 300;

describe('KnowledgeGraph Component', () => {
  const linkedNotes: NoteItem[] = [
    makeNote({ id: '1', title: 'Machine Learning', links: ['Deep Learning', 'AI Ethics'] }),
    makeNote({ id: '2', title: 'Deep Learning', links: ['Machine Learning'], backlinks: ['1'] }),
    makeNote({ id: '3', title: 'AI Ethics', backlinks: ['1'] }),
  ];

  beforeEach(() => {
    // jsdom 没有 canvas 实现：给一个所有绘图方法都是空操作的 2D 上下文
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, prop: string) => (prop in target ? target[prop] : () => {}),
      set: (target, prop: string, value) => {
        target[prop] = value;
        return true;
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(CANVAS_SIZE);
    vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(CANVAS_SIZE);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    // 固定随机布局：没有连线时节点不受力，停在画布正中
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('summarises note and link counts, and labels the canvas for screen readers', () => {
    render(<KnowledgeGraph notes={linkedNotes} />);
    expect(screen.getByRole('heading', { name: '知识图谱' })).toBeInTheDocument();
    expect(screen.getByText('3 篇笔记 · 3 条链接')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '知识图谱：3 篇笔记，3 条链接' })).toBeInTheDocument();
    expect(screen.queryByText(/笔记之间还没有链接/)).not.toBeInTheDocument();
  });

  it('leaves out deleted notes and hints how to link when there are no links', () => {
    render(
      <KnowledgeGraph
        notes={[
          makeNote({ id: '1', title: 'Alone' }),
          makeNote({ id: '2', title: 'Gone', links: ['Alone'], isDeleted: true }),
        ]}
      />,
    );
    expect(screen.getByText('1 篇笔记 · 0 条链接')).toBeInTheDocument();
    expect(screen.getByText(/笔记之间还没有链接/)).toBeInTheDocument();
  });

  it('shows an empty state instead of a canvas when there are no notes', () => {
    render(<KnowledgeGraph notes={[]} />);
    expect(screen.getByText('还没有笔记')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('opens the note whose node is clicked, and ignores clicks on empty space', () => {
    const onSelectNote = vi.fn();
    const note = makeNote({ id: '1', title: 'Only Note' });
    render(<KnowledgeGraph notes={[note]} onSelectNote={onSelectNote} />);
    const canvas = screen.getByRole('img');

    fireEvent.click(canvas, { clientX: 5, clientY: 5 });
    expect(onSelectNote).not.toHaveBeenCalled();

    const center = CANVAS_SIZE / 2;
    fireEvent.click(canvas, { clientX: center, clientY: center });
    expect(onSelectNote).toHaveBeenCalledWith(note);
  });
});

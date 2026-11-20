import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import { GraphLayout } from '../lib/graphLayout';
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

  it('keeps the layout when notes are refreshed without changing the graph, and reuses positions when it does change', () => {
    const setGraph = vi.spyOn(GraphLayout.prototype, 'setGraph');
    const { rerender } = render(<KnowledgeGraph notes={linkedNotes} />);
    expect(setGraph).toHaveBeenCalledTimes(1);

    // 同步刷新了整个数组、正文也改了，但节点和连线都没变：不应重新布局
    const refreshed = linkedNotes.map((n) => ({
      ...n,
      content: `${n.content} edited`,
      updatedAt: 5,
    }));
    rerender(<KnowledgeGraph notes={refreshed} />);
    expect(setGraph).toHaveBeenCalledTimes(1);

    // 新增一篇链接到已有笔记的笔记：重新布局，但复用了原来三个节点的位置
    const extra = makeNote({ id: '4', title: 'Neural Nets', links: ['Deep Learning'] });
    rerender(<KnowledgeGraph notes={[...refreshed, extra]} />);
    expect(setGraph).toHaveBeenCalledTimes(2);
    expect(setGraph.mock.results[1].value).toEqual({ reused: 3 });
  });

  describe('筛选高亮（highlightIds）', () => {
    /** 记录所有 globalAlpha 赋值和 clearRect（每次重绘一次）的 2D 上下文 */
    function recordingContext() {
      const alphas: number[] = [];
      let redraws = 0;
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (target, prop: string) => {
          if (prop === 'clearRect') return () => void redraws++;
          return prop in target ? target[prop] : () => {};
        },
        set: (target, prop: string, value) => {
          if (prop === 'globalAlpha') alphas.push(value as number);
          target[prop] = value;
          return true;
        },
      });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        ctx as unknown as CanvasRenderingContext2D,
      );
      return { alphas, redraws: () => redraws };
    }

    it('没有筛选时所有节点都不透明，也没有匹配计数', () => {
      const rec = recordingContext();
      render(<KnowledgeGraph notes={linkedNotes} />);
      expect(rec.alphas.every((a) => a === 1)).toBe(true);
      expect(screen.queryByText(/匹配筛选/)).not.toBeInTheDocument();
    });

    it('筛选时淡化没命中的节点，并显示命中数和图例说明', () => {
      const rec = recordingContext();
      render(<KnowledgeGraph notes={linkedNotes} highlightIds={new Set(['1'])} />);
      expect(rec.alphas).toContain(0.18);
      expect(rec.alphas).toContain(1);
      expect(screen.getByText('3 篇笔记 · 3 条链接 · 匹配筛选 1 篇')).toBeInTheDocument();
      expect(screen.getByText('淡色：未匹配当前筛选')).toBeInTheDocument();
    });

    it('筛选变化只重绘，不会重新布局', () => {
      const setGraph = vi.spyOn(GraphLayout.prototype, 'setGraph');
      const rec = recordingContext();
      const { rerender } = render(<KnowledgeGraph notes={linkedNotes} />);
      expect(setGraph).toHaveBeenCalledTimes(1);

      const before = rec.redraws();
      rerender(<KnowledgeGraph notes={linkedNotes} highlightIds={new Set(['2'])} />);
      expect(setGraph).toHaveBeenCalledTimes(1);
      expect(rec.redraws()).toBeGreaterThan(before);
      expect(screen.getByText(/匹配筛选 1 篇/)).toBeInTheDocument();

      // 再换一个筛选结果、再清掉筛选，同样都不重新布局
      rerender(<KnowledgeGraph notes={linkedNotes} highlightIds={new Set(['1', '3'])} />);
      rerender(<KnowledgeGraph notes={linkedNotes} />);
      expect(setGraph).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/匹配筛选/)).not.toBeInTheDocument();
    });

    it('筛选结果里有已删除的笔记 id 时，匹配数只统计图里的笔记', () => {
      recordingContext();
      render(<KnowledgeGraph notes={linkedNotes} highlightIds={new Set(['1', 'deleted-id'])} />);
      expect(screen.getByText(/匹配筛选 1 篇/)).toBeInTheDocument();
    });
  });

  describe('视图交互：缩放、平移、拖拽、邻居高亮', () => {
    type Arc = { x: number; y: number; r: number; alpha: number };
    /** 记录每一帧里画出的圆（位置、半径、当时的透明度）；clearRect 是每一帧的开头 */
    function arcRecorder() {
      const arcs: Arc[] = [];
      const frameStarts: number[] = [];
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (target, prop: string) => {
          if (prop === 'clearRect') return () => void frameStarts.push(arcs.length);
          if (prop === 'arc') {
            return (x: number, y: number, r: number) =>
              void arcs.push({ x, y, r, alpha: (target.globalAlpha as number) ?? 1 });
          }
          return prop in target ? target[prop] : () => {};
        },
        set: (target, prop: string, value) => {
          target[prop] = value;
          return true;
        },
      });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        ctx as unknown as CanvasRenderingContext2D,
      );
      return { lastFrame: () => arcs.slice(frameStarts[frameStarts.length - 1] ?? 0) };
    }
    const mouse = { pointerType: 'mouse', button: 0 } as const;
    const C = CANVAS_SIZE / 2;
    const single = [makeNote({ id: '1', title: 'Only' })];
    // 单个节点：size 8，停在画布正中
    const NODE_R = 8;

    it('滚轮以光标为不动点缩放，并且阻止页面跟着滚动', () => {
      const rec = arcRecorder();
      render(<KnowledgeGraph notes={single} />);
      const canvas = screen.getByRole('img');
      expect(rec.lastFrame()[0]).toMatchObject({ x: C, y: C, r: NODE_R });

      // 向上滚 100 像素 → 放大 exp(100 × 0.0015)
      const ratio = Math.exp(0.15);
      const notPrevented = fireEvent.wheel(canvas, { deltaY: -100, clientX: 100, clientY: 100 });
      expect(notPrevented).toBe(false);
      const arc = rec.lastFrame()[0];
      expect(arc.x).toBeCloseTo(100 + (C - 100) * ratio, 6);
      expect(arc.y).toBeCloseTo(100 + (C - 100) * ratio, 6);
      expect(arc.r).toBeCloseTo(NODE_R * Math.sqrt(ratio), 6);

      // 在节点正上方缩放，节点不动
      fireEvent.wheel(canvas, { deltaY: -100, clientX: arc.x, clientY: arc.y });
      expect(rec.lastFrame()[0].x).toBeCloseTo(arc.x, 6);
    });

    it('缩放有上下限', () => {
      const rec = arcRecorder();
      render(<KnowledgeGraph notes={single} />);
      const canvas = screen.getByRole('img');
      fireEvent.wheel(canvas, { deltaY: -1e6, clientX: C, clientY: C });
      expect(rec.lastFrame()[0].r).toBeCloseTo(NODE_R * Math.sqrt(5), 6);
      fireEvent.wheel(canvas, { deltaY: 1e6, clientX: C, clientY: C });
      expect(rec.lastFrame()[0].r).toBeCloseTo(NODE_R * Math.sqrt(0.25), 6);
    });

    it('放大、缩小、复位按钮', () => {
      const rec = arcRecorder();
      render(<KnowledgeGraph notes={single} />);
      fireEvent.click(screen.getByRole('button', { name: '放大' }));
      expect(rec.lastFrame()[0].r).toBeCloseTo(NODE_R * Math.sqrt(1.25), 6);
      fireEvent.click(screen.getByRole('button', { name: '缩小' }));
      fireEvent.click(screen.getByRole('button', { name: '缩小' }));
      expect(rec.lastFrame()[0].r).toBeCloseTo(NODE_R * Math.sqrt(0.8), 6);

      // 画布被平移之后，复位回到原点和 1 倍
      const canvas = screen.getByRole('img');
      fireEvent.pointerDown(canvas, { ...mouse, clientX: 5, clientY: 5 });
      fireEvent.pointerMove(window, { ...mouse, clientX: 45, clientY: 35 });
      fireEvent.pointerUp(window, { ...mouse, clientX: 45, clientY: 35 });
      fireEvent.click(screen.getByRole('button', { name: '复位视图' }));
      expect(rec.lastFrame()[0]).toMatchObject({ x: C, y: C, r: NODE_R });
    });

    it('拖动空白处平移视图；移动不到阈值时不算拖拽', () => {
      const rec = arcRecorder();
      render(<KnowledgeGraph notes={single} />);
      const canvas = screen.getByRole('img');

      fireEvent.pointerDown(canvas, { ...mouse, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(window, { ...mouse, clientX: 12, clientY: 11 });
      expect(rec.lastFrame()[0]).toMatchObject({ x: C, y: C });

      fireEvent.pointerMove(window, { ...mouse, clientX: 40, clientY: 30 });
      expect(rec.lastFrame()[0]).toMatchObject({ x: C + 30, y: C + 20 });
      fireEvent.pointerUp(window, { ...mouse, clientX: 40, clientY: 30 });

      // 松手后不再跟着鼠标走
      fireEvent.pointerMove(window, { ...mouse, clientX: 200, clientY: 200 });
      expect(rec.lastFrame()[0]).toMatchObject({ x: C + 30, y: C + 20 });
    });

    it('触屏的拖动不会平移（单指留给页面滚动）', () => {
      const rec = arcRecorder();
      render(<KnowledgeGraph notes={single} />);
      const canvas = screen.getByRole('img');
      fireEvent.pointerDown(canvas, { pointerType: 'touch', button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(window, { pointerType: 'touch', clientX: 90, clientY: 90 });
      expect(rec.lastFrame()[0]).toMatchObject({ x: C, y: C });
    });

    it('拖动节点：节点跟着鼠标走，拖完不会误触发打开笔记', async () => {
      const onSelectNote = vi.fn();
      const rec = arcRecorder();
      render(<KnowledgeGraph notes={single} onSelectNote={onSelectNote} />);
      const canvas = screen.getByRole('img');

      fireEvent.pointerDown(canvas, { ...mouse, clientX: C, clientY: C });
      fireEvent.pointerMove(window, { ...mouse, clientX: 200, clientY: 170 });
      expect(rec.lastFrame()[0]).toMatchObject({ x: 200, y: 170 });
      fireEvent.pointerUp(window, { ...mouse, clientX: 200, clientY: 170 });
      // 浏览器在拖拽结束后补发的 click（与 pointerup 同一个事件循环里，动画帧还没来得及动它）
      fireEvent.click(canvas, { clientX: 200, clientY: 170 });
      expect(onSelectNote).not.toHaveBeenCalled();

      // 之后正常的点击仍然有效。松手后布局还在跑（节点会被“回中”拉回去），
      // 所以点它此刻真正所在的位置，而不是假设它还停在原地——后者取决于动画帧的调度，机器忙时会点空
      await new Promise((r) => setTimeout(r, 5));
      const { x, y } = rec.lastFrame()[0];
      fireEvent.click(canvas, { clientX: x, clientY: y });
      expect(onSelectNote).toHaveBeenCalledTimes(1);
    });

    it('没有移动的按下 + 抬起仍然是普通点击', () => {
      const onSelectNote = vi.fn();
      arcRecorder();
      render(<KnowledgeGraph notes={single} onSelectNote={onSelectNote} />);
      const canvas = screen.getByRole('img');
      fireEvent.pointerDown(canvas, { ...mouse, clientX: C, clientY: C });
      fireEvent.pointerUp(window, { ...mouse, clientX: C, clientY: C });
      fireEvent.click(canvas, { clientX: C, clientY: C });
      expect(onSelectNote).toHaveBeenCalledTimes(1);
    });

    it('缩放和平移在图变化（比如新增笔记）后保留', () => {
      const rec = arcRecorder();
      const { rerender } = render(<KnowledgeGraph notes={single} />);
      fireEvent.click(screen.getByRole('button', { name: '放大' }));
      const zoomed = NODE_R * Math.sqrt(1.25);
      expect(rec.lastFrame()[0].r).toBeCloseTo(zoomed, 6);

      rerender(<KnowledgeGraph notes={[...single, makeNote({ id: '2', title: 'Second' })]} />);
      const frame = rec.lastFrame();
      expect(frame).toHaveLength(2);
      frame.forEach((arc) => expect(arc.r).toBeCloseTo(zoomed, 6));
    });

    describe('悬停 / 选中时高亮直接邻居', () => {
      const notes = [
        ...linkedNotes, // 1 号是枢纽，链接 2、3
        makeNote({ id: '4', title: 'Isolated' }),
      ];
      const hub = (frame: Arc[]) => frame.reduce((a, b) => (b.r > a.r ? b : a));
      const dimmed = (frame: Arc[]) => frame.filter((a) => a.alpha === 0.25);

      it('悬停枢纽：它的邻居保持清晰，无关节点淡化；移开后恢复', () => {
        const rec = arcRecorder();
        render(<KnowledgeGraph notes={notes} />);
        const canvas = screen.getByRole('img');
        expect(dimmed(rec.lastFrame())).toHaveLength(0);

        const h = hub(rec.lastFrame());
        fireEvent.pointerMove(canvas, { ...mouse, clientX: h.x, clientY: h.y });
        // 4 个节点里只有孤立的那个与枢纽无关
        expect(dimmed(rec.lastFrame())).toHaveLength(1);
        expect(rec.lastFrame().filter((a) => a.alpha === 1)).toHaveLength(3);

        fireEvent.pointerLeave(canvas);
        expect(dimmed(rec.lastFrame())).toHaveLength(0);
      });

      it('点击选中后高亮保持，点空白处取消', () => {
        const rec = arcRecorder();
        render(<KnowledgeGraph notes={notes} onSelectNote={vi.fn()} />);
        const canvas = screen.getByRole('img');
        const h = hub(rec.lastFrame());

        fireEvent.click(canvas, { clientX: h.x, clientY: h.y });
        expect(dimmed(rec.lastFrame())).toHaveLength(1);

        fireEvent.click(canvas, { clientX: 2, clientY: 2 });
        expect(dimmed(rec.lastFrame())).toHaveLength(0);
      });
    });
  });

  describe('节点数量：不再悄悄隐藏笔记', () => {
    /** 每一帧里画出的圆的半径（clearRect 是一帧的开头） */
    function arcCounter() {
      let radii: number[] = [];
      const frames: number[][] = [];
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (target, prop: string) => {
          if (prop === 'clearRect') {
            return () => {
              frames.push(radii);
              radii = [];
            };
          }
          if (prop === 'arc') return (_x: number, _y: number, r: number) => void radii.push(r);
          return prop in target ? target[prop] : () => {};
        },
        set: (target, prop: string, value) => {
          target[prop] = value;
          return true;
        },
      });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        ctx as unknown as CanvasRenderingContext2D,
      );
      // 上一帧完整画出的圆（最后一帧可能还没结束，所以取已结束的最后一帧）
      return () => frames[frames.length - 1] ?? [];
    }
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => makeNote({ id: `n${i}`, title: `Note ${i}` }));

    it('300 篇笔记全部画出来（以前超过 200 篇就会藏掉 30%），没有提示', () => {
      const lastFrame = arcCounter();
      const { rerender } = render(<KnowledgeGraph notes={many(300)} />);
      // 再触发一次重绘，保证前一帧已经完整结束
      rerender(<KnowledgeGraph notes={many(300)} highlightIds={new Set()} />);
      expect(lastFrame()).toHaveLength(300);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('超过上限时只画链接最多的那些，并明确告知隐藏了多少', () => {
      const lastFrame = arcCounter();
      const notes = [
        // 一篇被 2 篇引用的“枢纽”，排在 2010 篇孤立笔记后面：重要度高，不该因为排在后面就被裁掉
        ...many(2010),
        makeNote({ id: 'hub', title: 'Hub' }),
        makeNote({ id: 'a', title: 'A', links: ['Hub'] }),
        makeNote({ id: 'b', title: 'B', links: ['Hub'] }),
      ];
      const { rerender } = render(<KnowledgeGraph notes={notes} />);
      rerender(<KnowledgeGraph notes={notes} highlightIds={new Set()} />);

      const total = notes.length; // 2013
      const radii = lastFrame();
      expect(radii).toHaveLength(2000);
      // 枢纽（被 2 篇引用，size 14）和两篇引用它的笔记（size 11）都在；孤立笔记 size 都是 8
      expect(radii.filter((r) => r === 14)).toHaveLength(1);
      expect(radii.filter((r) => r === 11)).toHaveLength(2);
      expect(screen.getByRole('status')).toHaveTextContent(
        `只显示了链接最多的 2000 / ${total} 篇，其余 ${total - 2000} 篇可以在列表里查看`,
      );
    });
  });
});

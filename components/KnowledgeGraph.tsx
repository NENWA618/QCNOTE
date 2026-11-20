import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NoteItem } from '../lib/storage';
import type { OptimizedGraphLink } from '../lib/graphOptimization';
import { GraphLayout, REHEAT_ALPHA as REHEAT_ON_DRAG } from '../lib/graphLayout';
import { buildGraphData, graphSignature, limitNodes } from '../lib/graphData';

interface KnowledgeGraphProps {
  notes: NoteItem[];
  onSelectNote?: (note: NoteItem) => void;
  /**
   * 当前筛选命中的笔记 id。传入后，没命中的节点和连线会淡化，命中的保持原样；
   * 不传表示没有筛选。图本身（节点、连线、布局）不受它影响，所以输入搜索词时图不会重新布局。
   */
  highlightIds?: ReadonlySet<string>;
}

// 节点不多时常驻显示标题（手机上没有悬停，否则根本看不到哪个点是哪篇笔记）
const ALWAYS_LABEL_LIMIT = 40;
// 动画在布局冷却完（GraphLayout.settled）后自动停止，避免一直占用 CPU / 电量；
// 悬停、点击、改变尺寸时只重绘一帧。这个上限只是兜底，防止极端情况下一直跑
const MAX_FRAMES = 1200;
// 筛选时没命中的节点 / 连线的透明度
const DIM_NODE_ALPHA = 0.18;
const DIM_EDGE_FACTOR = 0.3;
// 悬停 / 选中一个节点时，与它无关的节点和连线的透明度（它自己和直接邻居保持清晰）
const FOCUS_DIM_ALPHA = 0.25;
// 视图缩放范围；滚轮每滚一个像素缩放的指数系数
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
// 点缩放按钮一次缩放多少倍
const ZOOM_STEP = 1.25;
const WHEEL_ZOOM_SPEED = 0.0015;
// 放大到这个倍数后，所有节点都显示标题（节点太多时平时只显示悬停的）
const LABEL_ZOOM = 1.6;
// 按下后移动超过这么多像素才算拖拽，否则仍然是点击
const DRAG_THRESHOLD = 4;
// 首屏同步布局的时间预算：小图 100 轮几十毫秒就跑完；大图到点就收手，剩下的交给动画帧继续
const UPFRONT_BUDGET_MS = 80;
// 每个动画帧里布局计算最多占用的时间，保证大图也能维持流畅的帧率
const FRAME_BUDGET_MS = 8;

const isDark = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  notes,
  onSelectNote,
  highlightIds,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 回调放进 ref：控制台每次渲染都会传一个新函数，若放进依赖会让布局重新随机打乱
  const onSelectRef = useRef(onSelectNote);
  useEffect(() => {
    onSelectRef.current = onSelectNote;
  }, [onSelectNote]);

  const activeNotes = useMemo(() => notes.filter((n) => !n.isDeleted), [notes]);
  // 点击时要拿到最新的笔记对象，但笔记变化不应触发重新布局，所以放进 ref
  const activeNotesRef = useRef(activeNotes);
  useEffect(() => {
    activeNotesRef.current = activeNotes;
  }, [activeNotes]);
  // 筛选高亮同样放进 ref，变化时只重绘，不重建布局
  const highlightRef = useRef(highlightIds);
  const renderRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    highlightRef.current = highlightIds;
    renderRef.current?.();
  }, [highlightIds]);
  // 缩放 / 平移同样跨越"图变化"保留：后台同步一次，不能把用户放大的视角重置掉
  const viewRef = useRef({ k: 1, tx: 0, ty: 0 });
  const controlsRef = useRef<{ zoomBy: (factor: number) => void; reset: () => void } | null>(null);
  // 布局状态跨越"图变化"保留：新增一篇笔记只需要给它安排位置，其余节点原地不动
  const layoutRef = useRef<GraphLayout | null>(null);

  // 边在这里一次构建完：正向链接和反向链接合并去重，悬空链接与自引用不计入
  const { built, signature } = useMemo(() => {
    const data = buildGraphData(activeNotes);
    return { built: data, signature: graphSignature(data) };
  }, [activeNotes]);
  // 只有节点或连线真的变了才换新的 graph：后台同步刷新数组、编辑正文都不会让图重新布局
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const graph = useMemo(() => built, [signature]);
  const linkCount = graph.linkCount;
  // 节点超过上限才裁剪（按链接数保留），并且在界面上明确告知；不再悄悄隐藏
  const visibleNodes = useMemo(() => limitNodes(graph.nodes), [graph]);
  const hiddenCount = graph.nodes.length - visibleNodes.length;
  const matchCount = useMemo(
    () => (highlightIds ? activeNotes.filter((n) => highlightIds.has(n.id)).length : null),
    [activeNotes, highlightIds],
  );
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || graph.nodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 以 CSS 像素为坐标系，画布按设备像素比放大，高分屏上不会糊
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resizeCanvas();

    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const visibleLinks = graph.edges.filter(
      (link) => visibleIds.has(link.source) && visibleIds.has(link.target),
    );
    const optimizedLinks: OptimizedGraphLink[] = visibleLinks.map((link) => ({
      source: link.source,
      target: link.target,
      type: 'forward',
      weight: 1,
    }));

    let layout = layoutRef.current;
    if (!layout) layout = layoutRef.current = new GraphLayout(width, height);
    layout.setSize(width, height);
    const { reused } = layout.setGraph(visibleNodes, optimizedLinks);
    const { positions } = layout;

    const roundIterations = Math.min(20, Math.max(6, Math.floor(visibleNodes.length / 50)));
    // 单次迭代的平均耗时（指数平滑），用来把每帧的布局计算限制在时间预算内
    let msPerIteration = 0;
    const simulate = (iterations = roundIterations) => {
      const t = performance.now();
      layout.step(iterations);
      const per = (performance.now() - t) / iterations;
      msPerIteration = msPerIteration ? msPerIteration * 0.7 + per * 0.3 : per;
    };

    // 全新的图先同步算一阵，打开就是个像样的布局；
    // 增量更新（复用了旧位置）直接交给动画，让新节点自然地滑到位，而不是整张图跳一下
    if (reused === 0) {
      const upfrontStart = performance.now();
      // 先跑 1 次迭代量出单次耗时：大图一轮就要几十毫秒，不能不量就整轮跑下去
      simulate(1);
      for (let i = 0; i < 100 && !layout.settled; i++) {
        const remaining = UPFRONT_BUDGET_MS - (performance.now() - upfrontStart);
        if (remaining <= 0) break;
        const affordable =
          msPerIteration > 0 ? Math.floor(remaining / msPerIteration) : roundIterations;
        simulate(Math.max(1, Math.min(roundIterations, affordable)));
      }
    }

    // 邻接表：悬停 / 选中一个节点时用来找出它的直接邻居
    const adjacency = new Map<string, Set<string>>();
    const connect = (a: string, b: string) => {
      const set = adjacency.get(a);
      if (set) set.add(b);
      else adjacency.set(a, new Set([b]));
    };
    visibleLinks.forEach((link) => {
      connect(link.source, link.target);
      connect(link.target, link.source);
    });

    let hoveredId: string | null = null;
    let selectedId: string | null = null;
    const view = viewRef.current;
    const showAllLabels = visibleNodes.length <= ALWAYS_LABEL_LIMIT;

    const render = () => {
      const dark = isDark();
      ctx.clearRect(0, 0, width, height);

      // 布局坐标 → 屏幕坐标：x * k + tx。节点半径按 √k 缩放，放大时变大但不至于夸张
      const { k, tx, ty } = view;
      const radiusScale = Math.sqrt(k);
      const focus = hoveredId ?? selectedId;
      const focusNeighbors = focus !== null ? adjacency.get(focus) : undefined;
      const matches = highlightRef.current;

      const drawArrow = (fx: number, fy: number, x: number, y: number, color: string) => {
        const dx = x - fx;
        const dy = y - fy;
        const mx = fx + dx * 0.7;
        const my = fy + dy * 0.7;
        const angle = Math.atan2(dy, dx);
        const arrow = 7;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(
          mx - arrow * Math.cos(angle - Math.PI / 6),
          my - arrow * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
          mx - arrow * Math.cos(angle + Math.PI / 6),
          my - arrow * Math.sin(angle + Math.PI / 6),
        );
        ctx.fill();
      };

      // 每条引用只画一条线；互相引用画双箭头。
      // 悬停 / 选中某个节点时，指向它的单向引用变蓝（被引用），它发出的保持紫色（引用）
      visibleLinks.forEach((link) => {
        const p1 = positions.get(link.source);
        const p2 = positions.get(link.target);
        if (!p1 || !p2) return;
        const x1 = p1.x * k + tx;
        const y1 = p1.y * k + ty;
        const x2 = p2.x * k + tx;
        const y2 = p2.y * k + ty;
        const highlight = focus !== null && (link.source === focus || link.target === focus);
        const incoming = highlight && !link.mutual && link.target === focus;
        const rgb = incoming ? '100, 150, 220' : '170, 110, 210';
        // 没有被聚焦到的连线、或筛选中有一端没命中的连线都淡化
        const dim =
          !highlight &&
          (focus !== null ||
            (!!matches && !(matches.has(link.source) && matches.has(link.target))));
        const fade = dim ? DIM_EDGE_FACTOR : 1;
        ctx.strokeStyle = `rgba(${rgb}, ${(highlight ? 0.8 : 0.35) * fade})`;
        ctx.lineWidth = highlight ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const arrowColor = `rgba(${rgb}, ${(highlight ? 0.9 : 0.55) * fade})`;
        drawArrow(x1, y1, x2, y2, arrowColor);
        if (link.mutual) drawArrow(x2, y2, x1, y1, arrowColor);
      });

      visibleNodes.forEach((node) => {
        const pos = positions.get(node.id);
        if (!pos) return;
        const x = pos.x * k + tx;
        const y = pos.y * k + ty;
        const active = node.id === hoveredId || node.id === selectedId;
        const r = (active ? 1.3 : 1) * node.size * radiusScale;
        // 完全在画布外的节点不用画
        if (x < -r - 40 || y < -r - 40 || x > width + r + 40 || y > height + r + 40) return;

        const isNeighbor = focusNeighbors?.has(node.id) === true;
        // 淡化：筛选没命中的、与聚焦节点无关的；悬停或选中的节点自己始终清晰
        let alpha = 1;
        if (!active) {
          if (matches && !matches.has(node.id)) alpha = Math.min(alpha, DIM_NODE_ALPHA);
          if (focus !== null && !isNeighbor) alpha = Math.min(alpha, FOCUS_DIM_ALPHA);
        }
        ctx.globalAlpha = alpha;

        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = active ? 3 : 1.5;
        ctx.strokeStyle = active
          ? dark
            ? '#ffffff'
            : '#5f4f62'
          : dark
            ? 'rgba(0,0,0,0.5)'
            : 'rgba(255,255,255,0.9)';
        ctx.stroke();

        if (showAllLabels || active || isNeighbor || k >= LABEL_ZOOM) {
          const label = node.label.length > 14 ? `${node.label.slice(0, 14)}…` : node.label;
          ctx.font = `${active ? 'bold ' : ''}12px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          // 文字描边，压在连线上也能看清
          ctx.lineWidth = 3;
          ctx.strokeStyle = dark ? 'rgba(26,26,26,0.9)' : 'rgba(255,255,255,0.9)';
          ctx.strokeText(label, x, y + r + 4);
          ctx.fillStyle = dark ? '#e5e5e5' : '#5f4f62';
          ctx.fillText(label, x, y + r + 4);
        }
      });
      ctx.globalAlpha = 1;
    };
    renderRef.current = render;

    const hitTest = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const radiusScale = Math.sqrt(view.k);
      // 从上往下找（后画的在上层）；触摸目标至少 16px 半径
      for (let i = visibleNodes.length - 1; i >= 0; i--) {
        const node = visibleNodes[i];
        const pos = positions.get(node.id);
        if (!pos) continue;
        const sx = pos.x * view.k + view.tx;
        const sy = pos.y * view.k + view.ty;
        if (Math.hypot(x - sx, y - sy) < Math.max(16, node.size * radiusScale + 4)) return node;
      }
      return null;
    };

    let frames = 0;
    let animationId = 0;
    let running = true;
    const animate = () => {
      // 大图一帧跑不完整轮迭代时少跑几次，换取流畅的帧率（至少 1 次，布局照样推进）
      const affordable =
        msPerIteration > 0 ? Math.floor(FRAME_BUDGET_MS / msPerIteration) : roundIterations;
      simulate(Math.max(1, Math.min(roundIterations, affordable)));
      render();
      frames++;
      if (!layout.settled && frames < MAX_FRAMES) {
        animationId = requestAnimationFrame(animate);
      } else {
        running = false;
      }
    };
    animate();
    // 布局已经停了，但用户又拖动了节点：重新启动动画循环
    const ensureAnimating = () => {
      frames = 0;
      if (running) return;
      running = true;
      animationId = requestAnimationFrame(animate);
    };

    // --- 缩放 / 平移 / 拖拽节点（鼠标和触控笔；触屏只保留点选，单指仍然用来滚动页面）---
    const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
    /** 以画布内 (cx, cy) 为不动点缩放：这一点下面的内容缩放前后位置不变 */
    const zoomAt = (factor: number, cx: number, cy: number) => {
      const next = clampZoom(view.k * factor);
      const ratio = next / view.k;
      view.tx = cx - (cx - view.tx) * ratio;
      view.ty = cy - (cy - view.ty) * ratio;
      view.k = next;
      render();
    };
    controlsRef.current = {
      zoomBy: (factor) => zoomAt(factor, width / 2, height / 2),
      reset: () => {
        view.k = 1;
        view.tx = 0;
        view.ty = 0;
        render();
      },
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      // deltaMode 1 是按"行"滚动（部分鼠标 / Firefox），换算成像素
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * WHEEL_ZOOM_SPEED), e.clientX - rect.left, e.clientY - rect.top);
    };

    type Drag = {
      kind: 'pan' | 'node';
      id: string | null;
      startX: number;
      startY: number;
      startTx: number;
      startTy: number;
      moved: boolean;
    };
    let drag: Drag | null = null;
    let suppressClick = false;

    const handleDragMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        canvas.style.cursor = 'grabbing';
      }
      if (drag.kind === 'pan') {
        view.tx = drag.startTx + dx;
        view.ty = drag.startTy + dy;
        render();
      } else if (drag.id) {
        const rect = canvas.getBoundingClientRect();
        layout.pin(
          drag.id,
          (e.clientX - rect.left - view.tx) / view.k,
          (e.clientY - rect.top - view.ty) / view.k,
        );
        // 邻居被拖着的节点牵动，需要布局重新动起来
        layout.reheat(REHEAT_ON_DRAG);
        ensureAnimating();
        render();
      }
    };
    const endDrag = () => {
      window.removeEventListener('pointermove', handleDragMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      if (!drag) return;
      if (drag.kind === 'node' && drag.id) layout.unpin(drag.id);
      if (drag.moved) {
        // 拖拽结束后浏览器还会补发一个 click：吞掉它，免得拖完就打开了笔记
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
      drag = null;
      canvas.style.cursor = hoveredId ? 'pointer' : 'grab';
    };
    const handleDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      const node = hitTest(e.clientX, e.clientY);
      drag = {
        kind: node ? 'node' : 'pan',
        id: node?.id ?? null,
        startX: e.clientX,
        startY: e.clientY,
        startTx: view.tx,
        startTy: view.ty,
        moved: false,
      };
      // 用 window 监听：鼠标拖出画布也不会丢失事件
      window.addEventListener('pointermove', handleDragMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    };

    const handleMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || drag?.moved) return;
      const node = hitTest(e.clientX, e.clientY);
      const id = node?.id ?? null;
      if (id === hoveredId) return;
      hoveredId = id;
      canvas.style.cursor = id ? 'pointer' : 'grab';
      setHoverLabel(node?.label ?? null);
      render();
    };
    const handleLeave = () => {
      if (hoveredId === null || drag?.moved) return;
      hoveredId = null;
      setHoverLabel(null);
      render();
    };
    const handleClick = (e: MouseEvent) => {
      if (suppressClick) return;
      const node = hitTest(e.clientX, e.clientY);
      if (!node) {
        // 点空白处取消选中，邻居高亮随之消失
        if (selectedId !== null) {
          selectedId = null;
          render();
        }
        return;
      }
      selectedId = node.id;
      render();
      const note = activeNotesRef.current.find((n) => n.id === node.id);
      if (note) onSelectRef.current?.(note);
    };

    // 尺寸变化：按比例挪动节点，保持布局，只重绘
    const observer = new ResizeObserver(() => {
      resizeCanvas();
      layout.setSize(width, height);
      render();
    });
    observer.observe(canvas);

    // 切换深浅色时重绘
    const themeObserver = new MutationObserver(render);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', handleDown);
    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerleave', handleLeave);
    canvas.addEventListener('click', handleClick);
    // 滚轮要 preventDefault 才能不带着页面一起滚，所以必须是非 passive 的
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      renderRef.current = null;
      controlsRef.current = null;
      cancelAnimationFrame(animationId);
      endDrag();
      observer.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener('pointerdown', handleDown);
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerleave', handleLeave);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [graph, visibleNodes]);

  return (
    <section className="rounded-2xl border border-primary-light/40 bg-white/95 p-4 sm:p-6 dark:border-dark-border dark:bg-dark-surface">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-ink sm:text-xl dark:text-dark-text">知识图谱</h2>
        <p className="text-xs text-text-light">
          {activeNotes.length} 篇笔记 · {linkCount} 条链接
          {matchCount !== null && ` · 匹配筛选 ${matchCount} 篇`}
        </p>
      </div>

      {hiddenCount > 0 && (
        <p role="status" className="mb-3 text-xs text-amber-700 dark:text-amber-300">
          笔记太多，为保证流畅只显示了链接最多的 {visibleNodes.length} / {graph.nodes.length}{' '}
          篇，其余 {hiddenCount} 篇可以在列表里查看
        </p>
      )}

      {activeNotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-primary-dark/40 px-4 py-14 text-center text-text-light dark:border-dark-border">
          还没有笔记
        </div>
      ) : (
        <>
          <div className="relative">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`知识图谱：${activeNotes.length} 篇笔记，${linkCount} 条链接`}
              className="block h-[60vh] max-h-[640px] min-h-[320px] w-full touch-manipulation rounded-xl border border-gray-200 bg-gray-50/80 dark:border-dark-border dark:bg-dark-bg/60"
            />
            <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white/90 text-sm shadow-sm dark:border-dark-border dark:bg-dark-surface/90">
              <button
                type="button"
                aria-label="放大"
                onClick={() => controlsRef.current?.zoomBy(ZOOM_STEP)}
                className="px-2.5 py-1 text-ink hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-border"
              >
                ＋
              </button>
              <button
                type="button"
                aria-label="缩小"
                onClick={() => controlsRef.current?.zoomBy(1 / ZOOM_STEP)}
                className="border-t border-gray-200 px-2.5 py-1 text-ink hover:bg-gray-100 dark:border-dark-border dark:text-dark-text dark:hover:bg-dark-border"
              >
                －
              </button>
              <button
                type="button"
                aria-label="复位视图"
                onClick={() => controlsRef.current?.reset()}
                className="border-t border-gray-200 px-2.5 py-1 text-xs text-ink hover:bg-gray-100 dark:border-dark-border dark:text-dark-text dark:hover:bg-dark-border"
              >
                ⟲
              </button>
            </div>
            {hoverLabel && (
              <div className="pointer-events-none absolute top-3 left-3 max-w-[70%] truncate rounded-full bg-white/90 px-3 py-1 text-xs text-ink shadow-sm dark:bg-dark-surface/90 dark:text-dark-text">
                {hoverLabel}
              </div>
            )}
            {linkCount === 0 && (
              <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-white/90 px-3 py-2 text-center text-xs text-text-light dark:bg-dark-surface/90">
                笔记之间还没有链接。在正文里写 <code className="font-mono">[[笔记标题]]</code>{' '}
                就能互相引用
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-light">
            <span>圆越大，引用越多</span>
            {matchCount !== null && <span>淡色：未匹配当前筛选</span>}
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-4 bg-[rgb(170,110,210)]" />
              引用（带箭头，互相引用为双箭头）
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-4 bg-[rgb(100,150,220)]" />
              被引用（悬停时指向该笔记的线）
            </span>
            <span className="sm:ml-auto">
              点击圆点打开笔记 · 滚轮缩放 · 拖动空白处平移 · 拖动圆点调整位置
            </span>
          </div>
        </>
      )}
    </section>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NoteItem } from '../lib/storage';
import { LODManager, SimplifiedSimulation, OptimizedGraphLink } from '../lib/graphOptimization';

interface GraphNode {
  id: string;
  label: string;
  size: number;
  color: string;
  importance: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: 'forward' | 'backlink';
}

interface KnowledgeGraphProps {
  notes: NoteItem[];
  onSelectNote?: (note: NoteItem) => void;
}

// 节点不多时常驻显示标题（手机上没有悬停，否则根本看不到哪个点是哪篇笔记）
const ALWAYS_LABEL_LIMIT = 40;
// 布局稳定后停止动画，避免一直占用 CPU / 电量；悬停、点击、改变尺寸时只重绘一帧
const SETTLE_FRAMES = 180;

const isDark = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ notes, onSelectNote }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 回调放进 ref：控制台每次渲染都会传一个新函数，若放进依赖会让布局重新随机打乱
  const onSelectRef = useRef(onSelectNote);
  useEffect(() => {
    onSelectRef.current = onSelectNote;
  }, [onSelectNote]);

  const activeNotes = useMemo(() => notes.filter((n) => !n.isDeleted), [notes]);
  const linkCount = useMemo(
    () => activeNotes.reduce((n, note) => n + (note.links?.length || 0), 0),
    [activeNotes],
  );
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeNotes.length === 0) return;
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

    const nodes: Map<string, GraphNode> = new Map();
    const links: GraphLink[] = [];
    const titleToId = new Map(activeNotes.map((note) => [note.title, note.id]));

    activeNotes.forEach((note) => {
      const count = (note.links?.length || 0) + (note.backlinks?.length || 0);
      nodes.set(note.id, {
        id: note.id,
        label: note.title || '无标题',
        size: Math.max(8, Math.min(26, 8 + count * 3)),
        color: note.color || '#4ecdc4',
        importance: count + 1,
      });

      (note.backlinks || []).forEach((backlink) => {
        links.push({ source: backlink, target: note.id, type: 'backlink' });
      });

      (note.links || []).forEach((title) => {
        const targetId = titleToId.get(title);
        if (targetId) links.push({ source: note.id, target: targetId, type: 'forward' });
      });
    });

    const nodeArray = Array.from(nodes.values());
    const lod = new LODManager();
    lod.setZoom(Math.max(0.2, Math.min(1, 1 - Math.max(0, nodeArray.length - 200) / 1200)));

    const visibleNodes = lod.filterNodesByDetailLevel(nodeArray);
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const visibleLinks = links.filter(
      (link) => visibleIds.has(link.source) && visibleIds.has(link.target),
    );
    const optimizedLinks: OptimizedGraphLink[] = visibleLinks.map((link) => ({
      ...link,
      weight: 1,
    }));

    const positions: Map<string, { x: number; y: number }> = new Map();
    const velocities: Map<string, { vx: number; vy: number }> = new Map();
    const pad = 30;
    visibleNodes.forEach((node) => {
      positions.set(node.id, {
        x: pad + Math.random() * Math.max(1, width - pad * 2),
        y: pad + Math.random() * Math.max(1, height - pad * 2),
      });
      velocities.set(node.id, { vx: 0, vy: 0 });
    });

    const simulate = () =>
      SimplifiedSimulation.simulate(
        visibleNodes,
        optimizedLinks,
        positions,
        velocities,
        Math.min(20, Math.max(6, Math.floor(visibleNodes.length / 50))),
        width,
        height,
      );

    for (let i = 0; i < 100; i++) simulate();

    let hoveredId: string | null = null;
    let selectedId: string | null = null;
    const showAllLabels = visibleNodes.length <= ALWAYS_LABEL_LIMIT;

    const render = () => {
      const dark = isDark();
      ctx.clearRect(0, 0, width, height);

      visibleLinks.forEach((link) => {
        const p1 = positions.get(link.source);
        const p2 = positions.get(link.target);
        if (!p1 || !p2) return;
        const highlight =
          hoveredId !== null && (link.source === hoveredId || link.target === hoveredId);
        const alpha = highlight ? 0.8 : 0.35;
        ctx.strokeStyle =
          link.type === 'backlink'
            ? `rgba(100, 150, 220, ${alpha})`
            : `rgba(170, 110, 210, ${alpha})`;
        ctx.lineWidth = highlight ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        if (link.type === 'forward') {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const mx = p1.x + dx * 0.7;
          const my = p1.y + dy * 0.7;
          const angle = Math.atan2(dy, dx);
          const arrow = 7;
          ctx.fillStyle = `rgba(170, 110, 210, ${highlight ? 0.9 : 0.55})`;
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
        }
      });

      visibleNodes.forEach((node) => {
        const pos = positions.get(node.id);
        if (!pos) return;
        const active = node.id === hoveredId || node.id === selectedId;
        const r = active ? node.size * 1.3 : node.size;

        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
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

        if (showAllLabels || active) {
          const label = node.label.length > 14 ? `${node.label.slice(0, 14)}…` : node.label;
          ctx.font = `${active ? 'bold ' : ''}12px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          // 文字描边，压在连线上也能看清
          ctx.lineWidth = 3;
          ctx.strokeStyle = dark ? 'rgba(26,26,26,0.9)' : 'rgba(255,255,255,0.9)';
          ctx.strokeText(label, pos.x, pos.y + r + 4);
          ctx.fillStyle = dark ? '#e5e5e5' : '#5f4f62';
          ctx.fillText(label, pos.x, pos.y + r + 4);
        }
      });
    };

    const hitTest = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      // 从上往下找（后画的在上层）；触摸目标至少 16px 半径
      for (let i = visibleNodes.length - 1; i >= 0; i--) {
        const node = visibleNodes[i];
        const pos = positions.get(node.id);
        if (!pos) continue;
        if (Math.hypot(x - pos.x, y - pos.y) < Math.max(16, node.size + 4)) return node;
      }
      return null;
    };

    let frames = 0;
    let animationId = 0;
    const animate = () => {
      simulate();
      render();
      frames++;
      if (frames < SETTLE_FRAMES) animationId = requestAnimationFrame(animate);
    };
    animate();

    const handleMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const node = hitTest(e.clientX, e.clientY);
      const id = node?.id ?? null;
      if (id === hoveredId) return;
      hoveredId = id;
      canvas.style.cursor = id ? 'pointer' : 'default';
      setHoverLabel(node?.label ?? null);
      render();
    };
    const handleLeave = () => {
      if (hoveredId === null) return;
      hoveredId = null;
      setHoverLabel(null);
      render();
    };
    const handleClick = (e: MouseEvent) => {
      const node = hitTest(e.clientX, e.clientY);
      if (!node) return;
      selectedId = node.id;
      render();
      const note = activeNotes.find((n) => n.id === node.id);
      if (note) onSelectRef.current?.(note);
    };

    // 尺寸变化：按比例挪动节点，保持布局，只重绘
    const observer = new ResizeObserver(() => {
      const oldW = width;
      const oldH = height;
      resizeCanvas();
      if (oldW && oldH && (oldW !== width || oldH !== height)) {
        positions.forEach((p) => {
          p.x = (p.x / oldW) * width;
          p.y = (p.y / oldH) * height;
        });
      }
      render();
    });
    observer.observe(canvas);

    // 切换深浅色时重绘
    const themeObserver = new MutationObserver(render);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerleave', handleLeave);
    canvas.addEventListener('click', handleClick);

    return () => {
      cancelAnimationFrame(animationId);
      observer.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerleave', handleLeave);
      canvas.removeEventListener('click', handleClick);
    };
  }, [activeNotes]);

  return (
    <section className="rounded-2xl border border-primary-light/40 bg-white/95 p-4 sm:p-6 dark:border-dark-border dark:bg-dark-surface">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-ink sm:text-xl dark:text-dark-text">知识图谱</h2>
        <p className="text-xs text-text-light">
          {activeNotes.length} 篇笔记 · {linkCount} 条链接
        </p>
      </div>

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
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-4 bg-[rgb(170,110,210)]" />
              引用（带箭头）
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-4 bg-[rgb(100,150,220)]" />
              被引用
            </span>
            <span className="sm:ml-auto">点击圆点打开笔记</span>
          </div>
        </>
      )}
    </section>
  );
};

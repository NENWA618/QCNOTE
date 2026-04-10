import React, { useEffect, useState, useRef } from 'react';
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

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  notes,
  onSelectNote,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const activeNotes = notes.filter((n) => !n.isDeleted);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const nodes: Map<string, GraphNode> = new Map();
    const links: GraphLink[] = [];
    const titleToId = new Map(activeNotes.map((note) => [note.title, note.id]));

    activeNotes.forEach((note) => {
      const linkCount = (note.links?.length || 0) + (note.backlinks?.length || 0);
      const size = Math.max(15, Math.min(40, 15 + linkCount * 3));
      const importance = linkCount + 1;

      nodes.set(note.id, {
        id: note.id,
        label: note.title || '无标题',
        size,
        color: note.color || '#4ecdc4',
        importance,
      });

      (note.backlinks || []).forEach((backlink) => {
        links.push({
          source: backlink,
          target: note.id,
          type: 'backlink',
        });
      });

      (note.links || []).forEach((title) => {
        const targetId = titleToId.get(title);
        if (targetId) {
          links.push({
            source: note.id,
            target: targetId,
            type: 'forward',
          });
        }
      });
    });

    const nodeArray = Array.from(nodes.values());
    const lod = new LODManager();
    const autoZoom = Math.max(0.2, Math.min(1, 1 - Math.max(0, nodeArray.length - 200) / 1200));
    lod.setZoom(autoZoom);

    const filteredNodeArray = lod.filterNodesByDetailLevel(nodeArray);
    const visibleNodeIds = new Set(filteredNodeArray.map((node) => node.id));
    const filteredLinks = links.filter((link) => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target));
    const optimizedLinks: OptimizedGraphLink[] = filteredLinks.map(link => ({
      ...link,
      weight: 1,
    }));

    const nodePositions: Map<string, { x: number; y: number }> = new Map();
    const nodeVelocities: Map<string, { vx: number; vy: number }> = new Map();

    filteredNodeArray.forEach((node) => {
      nodePositions.set(node.id, {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
      });
      nodeVelocities.set(node.id, { vx: 0, vy: 0 });
    });

    const simulate = () => {
      SimplifiedSimulation.simulate(
        filteredNodeArray,
        optimizedLinks,
        nodePositions,
        nodeVelocities,
        Math.min(20, Math.max(6, Math.floor(filteredNodeArray.length / 50))),
        canvas.width,
        canvas.height,
      );
    };

    // Simulation loop
    for (let i = 0; i < 100; i++) {
      simulate();
    }

    // Render loop
    const render = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw links
      filteredLinks.forEach((link) => {
        const p1 = nodePositions.get(link.source)!;
        const p2 = nodePositions.get(link.target)!;

        ctx.strokeStyle =
          link.type === 'backlink' ? 'rgba(100, 150, 200, 0.3)' : 'rgba(150, 100, 200, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Draw arrow for forward links
        if (link.type === 'forward') {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const mx = p1.x + (dx * 0.7) / dist * dist;
          const my = p1.y + (dy * 0.7) / dist * dist;

          const arrowSize = 8;
          const angle = Math.atan2(dy, dx);

          ctx.fillStyle = 'rgba(150, 100, 200, 0.5)';
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(
            mx - arrowSize * Math.cos(angle - Math.PI / 6),
            my - arrowSize * Math.sin(angle - Math.PI / 6),
          );
          ctx.lineTo(
            mx - arrowSize * Math.cos(angle + Math.PI / 6),
            my - arrowSize * Math.sin(angle + Math.PI / 6),
          );
          ctx.fill();
        }
      });

      // Draw nodes
      filteredNodeArray.forEach((node) => {
        const pos = nodePositions.get(node.id)!;
        const isSelected = selectedNodeId === node.id;
        const isHovered = hoveredNodeId === node.id;
        const size = isSelected || isHovered ? node.size * 1.5 : node.size;

        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected || isHovered) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, size + 3, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw labels for selected or hovered nodes
        if (isSelected || isHovered) {
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(node.label, pos.x, pos.y + size + 20);
        }
      });
    };

    render();

    // Mouse event handlers
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      let found = false;
      for (const node of filteredNodeArray) {
        const pos = nodePositions.get(node.id)!;
        const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (dist < node.size * 2) {
          setHoveredNodeId(node.id);
          found = true;
          break;
        }
      }
      if (!found) setHoveredNodeId(null);
    };

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      for (const node of filteredNodeArray) {
        const pos = nodePositions.get(node.id)!;
        const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
        if (dist < node.size * 2) {
          setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
          const clickedNote = activeNotes.find((n) => n.id === node.id);
          if (clickedNote) {
            onSelectNote?.(clickedNote);
          }
          break;
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    // Continuous animation
    let animationId: number;
    const animate = () => {
      simulate();
      render();
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationId);
    };
  }, [notes, selectedNodeId, hoveredNodeId, onSelectNote]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800">🧠 知识图谱</h2>
        <p className="text-sm text-gray-600 mt-2">
          📌 圆圈大小表示引用数量 | 🔵 蓝线=被引用 | 🟣 紫线=引用他人
        </p>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full rounded border border-gray-300 bg-gray-50 cursor-pointer"
        style={{ height: '500px' }}
      />
      <p className="text-xs text-gray-500 mt-2">💡 提示：点击节点编辑笔记，悬停查看标题</p>
    </div>
  );
};

import { describe, it, expect } from 'vitest';
import { GraphLayout, ALPHA_MIN, COOLING_ITERATIONS, REHEAT_ALPHA } from '../lib/graphLayout';
import type { OptimizedGraphLink, OptimizedGraphNode } from '../lib/graphOptimization';

const W = 900;
const H = 600;

const node = (id: string): OptimizedGraphNode => ({
  id,
  label: id,
  size: 10,
  color: '#000',
  importance: 1,
});
const link = (source: string, target: string): OptimizedGraphLink => ({
  source,
  target,
  type: 'forward',
  weight: 1,
});
const ids = (n: number, prefix = 'n') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** 一个环形的小图：每个节点链接下一个 */
function ring(n: number) {
  const names = ids(n);
  return {
    nodes: names.map(node),
    links: names.map((id, i) => link(id, names[(i + 1) % n])),
  };
}

function settle(layout: GraphLayout) {
  let guard = 0;
  while (!layout.settled && guard++ < 1000) layout.step(10);
}

const snapshot = (layout: GraphLayout) =>
  new Map([...layout.positions].map(([id, p]) => [id, { x: p.x, y: p.y }]));

describe('GraphLayout', () => {
  it('places every node of a fresh graph and starts at full temperature', () => {
    const layout = new GraphLayout(W, H);
    const { nodes, links } = ring(12);
    const { reused } = layout.setGraph(nodes, links);
    expect(reused).toBe(0);
    expect(layout.alpha).toBe(1);
    expect(layout.positions.size).toBe(12);
    expect(layout.velocities.size).toBe(12);
  });

  it('seeds a fresh graph deterministically', () => {
    const a = new GraphLayout(W, H);
    const b = new GraphLayout(W, H);
    const { nodes, links } = ring(20);
    a.setGraph(nodes, links);
    b.setGraph(nodes, links);
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it('cools down by iteration count and then stops doing any work', () => {
    const layout = new GraphLayout(W, H);
    const { nodes, links } = ring(10);
    layout.setGraph(nodes, links);

    let prev = layout.alpha;
    for (let i = 0; i < 10; i++) {
      layout.step(10);
      expect(layout.alpha).toBeLessThan(prev);
      prev = layout.alpha;
    }
    // 总共约 COOLING_ITERATIONS 次迭代后冷却完
    let iterations = 100;
    while (!layout.settled && iterations < COOLING_ITERATIONS * 2) {
      layout.step(10);
      iterations += 10;
    }
    expect(layout.settled).toBe(true);
    expect(iterations).toBeGreaterThan(COOLING_ITERATIONS * 0.9);
    expect(iterations).toBeLessThan(COOLING_ITERATIONS * 1.1);

    const frozen = snapshot(layout);
    layout.step(50);
    expect(snapshot(layout)).toEqual(frozen);
  });

  it('keeps existing nodes in place and puts a new linked node next to its neighbour', () => {
    const layout = new GraphLayout(W, H);
    const { nodes, links } = ring(10);
    layout.setGraph(nodes, links);
    settle(layout);
    const before = snapshot(layout);

    const { reused } = layout.setGraph([...nodes, node('new')], [...links, link('new', 'n3')]);
    expect(reused).toBe(10);
    // 已有节点原地不动
    for (const [id, p] of before) expect(layout.positions.get(id)).toEqual(p);
    // 新节点就在邻居旁边（偏移 40px，远小于画布）
    const anchor = before.get('n3')!;
    const added = layout.positions.get('new')!;
    expect(Math.hypot(added.x - anchor.x, added.y - anchor.y)).toBeLessThan(60);
    // 有增删才回温，且只回到 REHEAT_ALPHA，而不是 1
    expect(layout.alpha).toBe(REHEAT_ALPHA);
    expect(layout.settled).toBe(false);
  });

  it('does not reshuffle the old nodes when one note is added', () => {
    const layout = new GraphLayout(W, H);
    const { nodes, links } = ring(30);
    layout.setGraph(nodes, links);
    settle(layout);
    const before = snapshot(layout);

    layout.setGraph([...nodes, node('new')], [...links, link('new', 'n7')]);
    settle(layout);

    const shifts = [...before].map(([id, p]) => {
      const q = layout.positions.get(id)!;
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    shifts.sort((a, b) => a - b);
    const median = shifts[Math.floor(shifts.length / 2)];
    // 对照：从头重新布局时，节点基本都会跑到别处
    expect(median).toBeLessThan(40);
  });

  it('drops removed nodes, keeps the rest, and reheats', () => {
    const layout = new GraphLayout(W, H);
    const { nodes, links } = ring(8);
    layout.setGraph(nodes, links);
    settle(layout);
    const before = snapshot(layout);

    const kept = nodes.filter((n) => n.id !== 'n0');
    const keptLinks = links.filter((l) => l.source !== 'n0' && l.target !== 'n0');
    const { reused } = layout.setGraph(kept, keptLinks);
    expect(reused).toBe(7);
    expect(layout.positions.has('n0')).toBe(false);
    expect(layout.velocities.has('n0')).toBe(false);
    expect(layout.positions.get('n4')).toEqual(before.get('n4'));
    expect(layout.alpha).toBe(REHEAT_ALPHA);
  });

  it('does not restart the layout when nothing structural changed', () => {
    const layout = new GraphLayout(W, H);
    const { nodes, links } = ring(8);
    layout.setGraph(nodes, links);
    settle(layout);
    const before = snapshot(layout);

    // 只换了节点对象（比如颜色、标题变了），节点集合和连线都没变
    const recoloured = nodes.map((n) => ({ ...n, color: '#fff', label: `${n.label}!` }));
    layout.setGraph(
      recoloured,
      links.map((l) => ({ ...l })),
    );
    expect(layout.settled).toBe(true);
    expect(snapshot(layout)).toEqual(before);
  });

  it('starts from scratch when no node is reused', () => {
    const layout = new GraphLayout(W, H);
    const a = ring(5);
    layout.setGraph(a.nodes, a.links);
    settle(layout);
    expect(layout.settled).toBe(true);

    const b = { nodes: ids(5, 'x').map(node), links: [] as OptimizedGraphLink[] };
    const { reused } = layout.setGraph(b.nodes, b.links);
    expect(reused).toBe(0);
    expect(layout.alpha).toBe(1);
  });

  it('rescales positions proportionally when the canvas is resized', () => {
    const layout = new GraphLayout(W, H);
    const { nodes, links } = ring(6);
    layout.setGraph(nodes, links);
    const before = snapshot(layout);

    layout.setSize(W * 2, H / 2);
    for (const [id, p] of before) {
      const q = layout.positions.get(id)!;
      expect(q.x).toBeCloseTo(p.x * 2, 8);
      expect(q.y).toBeCloseTo(p.y / 2, 8);
    }
  });

  it('keeps new nodes inside the canvas even next to an edge node', () => {
    const layout = new GraphLayout(W, H);
    layout.setGraph([node('a')], []);
    layout.positions.get('a')!.x = 31; // 贴着左边界
    layout.setGraph([node('a'), node('b')], [link('a', 'b')]);
    const b = layout.positions.get('b')!;
    expect(b.x).toBeGreaterThanOrEqual(30);
    expect(b.x).toBeLessThanOrEqual(W - 30);
  });

  it('reaches ALPHA_MIN as documented', () => {
    expect(ALPHA_MIN).toBeLessThan(REHEAT_ALPHA);
  });

  describe('拖拽：pin / unpin / reheat', () => {
    it('keeps a pinned node exactly where it was put while the rest keeps moving', () => {
      const layout = new GraphLayout(W, H);
      const { nodes, links } = ring(6);
      layout.setGraph(nodes, links);
      layout.pin('n0', 123, 234);
      const others = snapshot(layout);
      layout.step(20);
      expect(layout.positions.get('n0')).toEqual({ x: 123, y: 234 });
      const moved = [...others].filter(([id, p]) => {
        const q = layout.positions.get(id)!;
        return id !== 'n0' && Math.hypot(q.x - p.x, q.y - p.y) > 0.01;
      });
      expect(moved.length).toBeGreaterThan(0);
    });

    it('lets go of the node on unpin', () => {
      const layout = new GraphLayout(W, H);
      const { nodes, links } = ring(6);
      layout.setGraph(nodes, links);
      layout.pin('n0', 123, 234);
      layout.step(10);
      layout.unpin('n0');
      layout.step(30);
      const p = layout.positions.get('n0')!;
      expect(Math.hypot(p.x - 123, p.y - 234)).toBeGreaterThan(1);
    });

    it('keeps a pinned node inside the canvas and ignores unknown ids', () => {
      const layout = new GraphLayout(W, H);
      layout.setGraph([node('a')], []);
      layout.pin('a', -500, 99999);
      expect(layout.positions.get('a')).toEqual({ x: 30, y: H - 30 });
      expect(() => layout.pin('nope', 1, 1)).not.toThrow();
      expect(layout.positions.has('nope')).toBe(false);
    });

    it('reheat only ever raises the temperature, and restarts a settled layout', () => {
      const layout = new GraphLayout(W, H);
      const { nodes, links } = ring(5);
      layout.setGraph(nodes, links);
      settle(layout);
      expect(layout.settled).toBe(true);
      layout.reheat(REHEAT_ALPHA);
      expect(layout.alpha).toBe(REHEAT_ALPHA);
      expect(layout.settled).toBe(false);
      layout.reheat(0.01);
      expect(layout.alpha).toBe(REHEAT_ALPHA);
    });

    it('forgets pins when the graph changes', () => {
      const layout = new GraphLayout(W, H);
      const { nodes, links } = ring(4);
      layout.setGraph(nodes, links);
      layout.pin('n0', 100, 100);
      layout.setGraph(nodes, links);
      layout.reheat(1);
      layout.step(30);
      const p = layout.positions.get('n0')!;
      expect(Math.hypot(p.x - 100, p.y - 100)).toBeGreaterThan(0.01);
    });
  });

  describe('回中', () => {
    const centroid = (layout: GraphLayout) => {
      const ps = [...layout.positions.values()];
      return {
        x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
        y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
      };
    };

    it('冷却完之后图的质心仍在画布中心：孤立节点不会因为引力衰减而偏心', () => {
      const layout = new GraphLayout(W, H);
      layout.setGraph(ids(5, 'iso').map(node), []);
      settle(layout);
      const c = centroid(layout);
      expect(c.x).toBeCloseTo(W / 2, 6);
      expect(c.y).toBeCloseTo(H / 2, 6);
    });

    it('单个节点正好停在画布中心', () => {
      const layout = new GraphLayout(W, H);
      layout.setGraph([node('only')], []);
      layout.step(6);
      expect(layout.positions.get('only')).toEqual({ x: W / 2, y: H / 2 });
    });

    it('拖拽期间不回中，别的节点不会被反方向带跑', () => {
      const layout = new GraphLayout(W, H);
      const { nodes, links } = ring(6);
      layout.setGraph(nodes, links);
      settle(layout);
      layout.pin('n0', 60, 60);
      layout.reheat(REHEAT_ALPHA);
      const c0 = centroid(layout);
      layout.step(1);
      const c1 = centroid(layout);
      // 质心只会因为 n0 被拽过去而小幅移动，而不是被强行拉回中心
      expect(Math.hypot(c1.x - c0.x, c1.y - c0.y)).toBeLessThan(20);
      expect(layout.positions.get('n0')).toEqual({ x: 60, y: 60 });
    });
  });
});

import { describe, it, expect } from 'vitest';
import { SimplifiedSimulation, type OptimizedGraphNode } from '../lib/graphOptimization';

const W = 900;
const H = 600;

function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function setup(n: number, place: (i: number, rnd: () => number) => { x: number; y: number }) {
  const rnd = seeded(42);
  const nodes: OptimizedGraphNode[] = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    label: '',
    size: 10,
    color: '#000',
    importance: 1,
  }));
  const positions = new Map<string, { x: number; y: number }>();
  const velocities = new Map<string, { vx: number; vy: number }>();
  nodes.forEach((node, i) => {
    positions.set(node.id, place(i, rnd));
    velocities.set(node.id, { vx: 0, vy: 0 });
  });
  return { nodes, positions, velocities };
}

const spread = (positions: Map<string, { x: number; y: number }>) => {
  const xs = [...positions.values()].map((p) => p.x);
  const ys = [...positions.values()].map((p) => p.y);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

describe('SimplifiedSimulation', () => {
  it('keeps pushing unlinked nodes apart beyond 400 nodes instead of collapsing them', () => {
    // 回归：以前超过 400 个节点就没有斥力，所有节点只剩向中心的引力，缩成一小团
    const { nodes, positions, velocities } = setup(600, (_, rnd) => ({
      x: W / 2 + (rnd() - 0.5) * 100,
      y: H / 2 + (rnd() - 0.5) * 100,
    }));
    for (let i = 0; i < 60; i++)
      SimplifiedSimulation.simulate(nodes, [], positions, velocities, 10, W, H);
    const [sx, sy] = spread(positions);
    expect(sx).toBeGreaterThan(500);
    expect(sy).toBeGreaterThan(300);
  });

  it('separates exactly overlapping nodes', () => {
    const { nodes, positions, velocities } = setup(2, () => ({ x: 300, y: 300 }));
    SimplifiedSimulation.simulate(nodes, [], positions, velocities, 20, W, H);
    const [a, b] = [...positions.values()];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
  });

  it('pulls linked nodes towards the rest length', () => {
    const { nodes, positions, velocities } = setup(2, (i) => ({ x: 100 + i * 600, y: 300 }));
    const links = [{ source: 'n0', target: 'n1', type: 'forward' as const, weight: 1 }];
    for (let i = 0; i < 200; i++)
      SimplifiedSimulation.simulate(nodes, links, positions, velocities, 5, W, H);
    const [a, b] = [...positions.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist).toBeGreaterThan(40);
    expect(dist).toBeLessThan(200);
  });

  it('stays finite and inside the canvas padding', () => {
    const { nodes, positions, velocities } = setup(500, (_, rnd) => ({
      x: rnd() * W,
      y: rnd() * H,
    }));
    for (let i = 0; i < 20; i++)
      SimplifiedSimulation.simulate(nodes, [], positions, velocities, 10, W, H);
    positions.forEach((p) => {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(W - 40);
      expect(p.y).toBeGreaterThanOrEqual(40);
      expect(p.y).toBeLessThanOrEqual(H - 40);
    });
  });

  it('skips nodes that have no position or velocity and ignores links to unknown nodes', () => {
    const { nodes, positions, velocities } = setup(3, (i) => ({ x: 200 + i * 10, y: 300 }));
    positions.delete('n1');
    const links = [
      { source: 'n0', target: 'n1', type: 'forward' as const, weight: 1 },
      { source: 'n0', target: 'nope', type: 'forward' as const, weight: 1 },
    ];
    expect(() =>
      SimplifiedSimulation.simulate(nodes, links, positions, velocities, 5, W, H),
    ).not.toThrow();
    expect(positions.has('n1')).toBe(false);
  });

  it('matches a brute-force reference of the same forces (grid lookup is exact)', () => {
    const n = 300;
    const { nodes, positions, velocities } = setup(n, (_, rnd) => ({
      x: 60 + rnd() * (W - 120),
      y: 60 + rnd() * (H - 120),
    }));
    const ref = nodes.map((node) => ({ ...positions.get(node.id)!, vx: 0, vy: 0 }));
    const spacing = Math.min(140, Math.max(36, Math.sqrt((W * H) / n) * 0.9));

    // 逐对暴力计算一步：与 SimplifiedSimulation 的物理定义保持一致
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = ref[j].x - ref[i].x;
        let dy = ref[j].y - ref[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.01) {
          dx = Math.cos(i + j);
          dy = Math.sin(i + j);
          dist = 1;
        }
        if (dist >= spacing * 2.5) continue;
        const push =
          dist < spacing ? (spacing - dist) * 0.5 + 2 : ((spacing * spacing) / (dist * dist)) * 2;
        const fx = (push * dx) / dist;
        const fy = (push * dy) / dist;
        ref[i].vx -= fx;
        ref[i].vy -= fy;
        ref[j].vx += fx;
        ref[j].vy += fy;
      }
    }
    ref.forEach((r) => {
      r.vx += (W / 2 - r.x) * 0.002;
      r.vy += (H / 2 - r.y) * 0.002;
      r.vx *= 0.8;
      r.vy *= 0.8;
      r.x = Math.min(W - 40, Math.max(40, r.x + r.vx));
      r.y = Math.min(H - 40, Math.max(40, r.y + r.vy));
    });

    SimplifiedSimulation.simulate(nodes, [], positions, velocities, 1, W, H);
    nodes.forEach((node, i) => {
      const p = positions.get(node.id)!;
      expect(p.x).toBeCloseTo(ref[i].x, 8);
      expect(p.y).toBeCloseTo(ref[i].y, 8);
    });
  });

  it('does not move pinned nodes, but they still push and pull their neighbours', () => {
    const { nodes, positions, velocities } = setup(3, (i) => ({ x: 300 + i * 20, y: 300 }));
    const links = [{ source: 'n0', target: 'n1', type: 'forward' as const, weight: 1 }];
    const pinned = new Set(['n0']);
    const before = { ...positions.get('n0')! };
    const neighbourBefore = { ...positions.get('n1')! };
    for (let i = 0; i < 30; i++) {
      SimplifiedSimulation.simulate(nodes, links, positions, velocities, 5, W, H, 1, pinned);
    }
    expect(positions.get('n0')).toEqual(before);
    expect(velocities.get('n0')).toEqual({ vx: 0, vy: 0 });
    // 邻居被钉住的节点牵动、推开，位置发生了变化
    const n1 = positions.get('n1')!;
    expect(Math.hypot(n1.x - neighbourBefore.x, n1.y - neighbourBefore.y)).toBeGreaterThan(10);
  });

  describe('弹簧力按度数归一化：枢纽和稠密图不会失稳', () => {
    const links = (edges: [number, number][]) =>
      edges.map(([a, b]) => ({
        source: `n${a}`,
        target: `n${b}`,
        type: 'forward' as const,
        weight: 1,
      }));

    /** 先以全温度（alpha = 1）跑 1000 步，再观察 200 步：所有节点平均每步位移的均方根 */
    function jitter(n: number, edges: [number, number][]) {
      const { nodes, positions, velocities } = setup(n, (_, rnd) => ({
        x: 200 + rnd() * 500,
        y: 150 + rnd() * 300,
      }));
      const ls = links(edges);
      const step = () =>
        SimplifiedSimulation.simulate(nodes, ls, positions, velocities, 1, W, H, 1);
      for (let i = 0; i < 1000; i++) step();
      const prev = new Map([...positions].map(([id, p]) => [id, { ...p }]));
      let sum = 0;
      for (let i = 0; i < 200; i++) {
        step();
        positions.forEach((p, id) => {
          const q = prev.get(id)!;
          sum += (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
          q.x = p.x;
          q.y = p.y;
        });
      }
      return Math.sqrt(sum / 200 / n);
    }

    it('一个连着 60 个叶子的枢纽稳定下来，而不是来回乱甩', () => {
      // 回归：以前枢纽同时受到 60 份拉力，每步位移是几十到几百像素
      const star: [number, number][] = Array.from({ length: 60 }, (_, i) => [0, i + 1]);
      expect(jitter(61, star)).toBeLessThan(1);
    });

    it('稠密图（30×30 二分团、50 个节点的完全图）也稳定', () => {
      const biclique: [number, number][] = [];
      for (let i = 0; i < 30; i++) for (let j = 30; j < 60; j++) biclique.push([i, j]);
      expect(jitter(60, biclique)).toBeLessThan(1);

      const complete: [number, number][] = [];
      for (let i = 0; i < 50; i++) for (let j = i + 1; j < 50; j++) complete.push([i, j]);
      expect(jitter(50, complete)).toBeLessThan(1);
    });

    it('度数高的一端少动、度数低的一端多动', () => {
      // 枢纽 n0 连着 n1..n10：同样被拉伸 100px，叶子的位移应明显大于枢纽
      const { nodes, positions, velocities } = setup(11, (i) => ({
        x: i === 0 ? 450 : 450 + 200 * Math.cos(i),
        y: i === 0 ? 300 : 300 + 200 * Math.sin(i),
      }));
      const star = links(Array.from({ length: 10 }, (_, i) => [0, i + 1] as [number, number]));
      SimplifiedSimulation.simulate(nodes, star, positions, velocities, 1, W, H, 1);
      const speed = (id: string) => {
        const v = velocities.get(id)!;
        return Math.hypot(v.vx, v.vy);
      };
      // 看对称的节点对：n0 的速度来自 10 份拉力的合力（方向大致相消），叶子则全额受力
      expect(speed('n1')).toBeGreaterThan(speed('n0') * 3);
    });

    it('两端度数都是 1 的边保持原来的劲度（拉伸 100px 时每端得到 0.1 × 100）', () => {
      const { nodes, positions, velocities } = setup(2, (i) => ({ x: 100 + i * 300, y: 300 }));
      SimplifiedSimulation.simulate(nodes, links([[0, 1]]), positions, velocities, 1, W, H, 1);
      // 两点相距 300、理想 100：拉伸 200，每端被拉 0.1 × 200 = 20，
      // 再经向中心的引力和 0.8 的阻尼：只检查朝向和量级
      expect(velocities.get('n0')!.vx).toBeGreaterThan(10);
      expect(velocities.get('n1')!.vx).toBeLessThan(-10);
    });
  });
});

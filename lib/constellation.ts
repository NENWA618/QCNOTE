/**
 * 节点网络生成器：README 横幅里“笔记节点 + 双向链接”的背景图案。
 * 用固定种子的伪随机数，保证服务端渲染与客户端水合结果一致（不能用 Math.random）。
 */

export interface ConstellationNode {
  x: number;
  y: number;
  /** 圆点半径 */
  r: number;
  /** 闪烁动画的延迟与周期（秒） */
  delay: number;
  dur: number;
}

export interface Constellation {
  nodes: ConstellationNode[];
  /** 节点下标对 */
  links: [number, number][];
  /** 会被“墨水”点亮的链路（节点下标序列） */
  chains: number[][];
}

export interface ConstellationOptions {
  seed: number;
  width: number;
  height: number;
  count: number;
  /** 节点之间的最小间距 */
  minDist: number;
  /** 小于该距离的节点才会连线 */
  linkDist: number;
  /** 每个节点最多连几条线 */
  maxLinks?: number;
  /** 被点亮的链路数量与单条长度 */
  chains?: number;
  chainLen?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

export function buildConstellation(opts: ConstellationOptions): Constellation {
  const { seed, width, height, count, minDist, linkDist, maxLinks = 3 } = opts;
  const rnd = mulberry32(seed);

  // 拒绝采样：保证节点之间不会挤成一团
  const nodes: ConstellationNode[] = [];
  let guard = 0;
  while (nodes.length < count && guard++ < count * 60) {
    const x = rnd() * width;
    const y = rnd() * height;
    if (nodes.some((n) => (n.x - x) ** 2 + (n.y - y) ** 2 < minDist ** 2)) continue;
    nodes.push({
      x: round(x),
      y: round(y),
      r: round(1.4 + rnd() * 1.6),
      delay: round(-rnd() * 10),
      dur: round(6 + rnd() * 4),
    });
  }

  // 只连近邻，且限制度数，避免出现一团乱麻
  const degree = new Array<number>(nodes.length).fill(0);
  const adj: number[][] = nodes.map(() => []);
  const links: [number, number][] = [];
  const candidates: [number, number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d <= linkDist) candidates.push([i, j, d]);
    }
  }
  candidates.sort((a, b) => a[2] - b[2]);
  for (const [i, j] of candidates) {
    if (degree[i] >= maxLinks || degree[j] >= maxLinks) continue;
    degree[i]++;
    degree[j]++;
    adj[i].push(j);
    adj[j].push(i);
    links.push([i, j]);
  }

  // 在连通的链路上随机游走，得到会被点亮的“墨水”路径
  const chains: number[][] = [];
  const used = new Set<number>();
  const wanted = opts.chains ?? 0;
  const len = opts.chainLen ?? 5;
  let tries = 0;
  while (chains.length < wanted && tries++ < wanted * 40) {
    const start = Math.floor(rnd() * nodes.length);
    if (used.has(start) || adj[start].length === 0) continue;
    const path = [start];
    const seen = new Set(path);
    while (path.length < len) {
      const next = adj[path[path.length - 1]].filter((n) => !seen.has(n) && !used.has(n));
      if (next.length === 0) break;
      const pick = next[Math.floor(rnd() * next.length)];
      path.push(pick);
      seen.add(pick);
    }
    if (path.length < 3) continue;
    path.forEach((n) => used.add(n));
    chains.push(path);
  }

  return { nodes, links, chains };
}

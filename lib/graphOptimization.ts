/**
 * KnowledgeGraph 的力导向布局核心（纯计算，不依赖 DOM / React）。
 * 斥力用均匀网格做邻域查询，弹簧力按度数归一化；状态管理见 graphLayout.ts。
 */

export interface OptimizedGraphNode {
  id: string;
  label: string;
  size: number;
  color: string;
  clusterId?: string;
  importance: number;
}

export interface OptimizedGraphLink {
  source: string;
  target: string;
  type: 'forward' | 'backlink';
  weight: number;
}

/**
 * 弹簧的基础劲度。两端度数都是 1 的边（最常见的叶子连叶子）两端各得到这么多；
 * 以前每条引用会生成正向 + 反向两条重叠的边，等效劲度是 0.05 × 2，现在边已去重，直接取 0.1。
 * 度数高的节点按下面的方式分摊，见 simulate 里的注释。
 */
const LINK_STIFFNESS = 0.1;
/** 单个节点所有弹簧的劲度之和上限。0.3 在稠密图里仍会失稳，0.2 在所有现实规模下稳定 */
const MAX_NODE_STIFFNESS = 0.2;
const LINK_REST_LENGTH = 100;
/** 斥力作用半径 = spacing × REPEL_RANGE，超出后不再互相推开 */
const REPEL_RANGE = 2.5;
/** 网格每边最多这么多格，避免节点飞得很散时网格爆炸 */
const MAX_GRID_CELLS_PER_SIDE = 256;

/**
 * Force simulation for large graphs.
 *
 * 斥力用均匀网格做邻域查询：作用半径有限，所以每个节点只需检查相邻 3×3 个格子，
 * 复杂度近似 O(n)，不再有节点数上限（以前超过 400 个节点就完全没有斥力，会塌成一团）。
 * 内部用 Float64Array 代替逐对的 Map 查询，数据在调用前后仍存放在传入的 Map 里。
 */
export class SimplifiedSimulation {
  /**
   * Run a force simulation for the given number of iterations.
   * Positions / velocities are updated in place.
   *
   * `alpha`（0~1）是"温度"：三种力都乘以它。各力之间的比例不变，所以平衡位置不变，
   * 只是 alpha 越小节点动得越慢；由调用方逐步调低来让布局平稳地冷却下来。默认 1 即全力。
   *
   * `pinned` 里的节点被钉住（比如正被用户拖着）：它照常把力施加给邻居，但自己不动。
   */
  static simulate(
    nodes: OptimizedGraphNode[],
    links: OptimizedGraphLink[],
    positions: Map<string, { x: number; y: number }>,
    velocities: Map<string, { vx: number; vy: number }>,
    iterations: number = 10,
    canvasWidth: number = 800,
    canvasHeight: number = 600,
    alpha: number = 1,
    pinned?: ReadonlySet<string>,
  ): void {
    const n = nodes.length;
    if (n === 0) return;

    // --- 装载到定长数组 ---
    const index = new Map<string, number>();
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    const vx = new Float64Array(n);
    const vy = new Float64Array(n);
    const alive = new Uint8Array(n); // 位置和速度都存在的节点才参与计算
    const fixed = new Uint8Array(n); // 被钉住的节点
    for (let i = 0; i < n; i++) {
      index.set(nodes[i].id, i);
      const p = positions.get(nodes[i].id);
      const v = velocities.get(nodes[i].id);
      if (!p || !v) continue;
      alive[i] = 1;
      if (pinned?.has(nodes[i].id)) fixed[i] = 1;
      px[i] = p.x;
      py[i] = p.y;
      vx[i] = v.vx;
      vy[i] = v.vy;
    }

    const linkA: number[] = [];
    const linkB: number[] = [];
    for (const link of links) {
      const a = index.get(link.source);
      const b = index.get(link.target);
      if (a === undefined || b === undefined || !alive[a] || !alive[b]) continue;
      linkA.push(a);
      linkB.push(b);
    }
    const linkTotal = linkA.length;

    // 弹簧力按度数归一化。
    // 以前每条边对两端用同样的力，一个连着 50 个叶子的枢纽会同时受到 50 份拉力，
    // 积分步长一大就数值失稳：枢纽在画布上来回乱甩（实测单步位移可达几百像素）。
    // 稳定性取决于「单个节点所有弹簧的劲度之和」，所以这里：
    //   1. 整条边的劲度除以较小一端度数的平方根（d3-force 除以度数本身，实测会让连线明显偏松）；
    //   2. 位移按对端度数的比例分配：度数高的一端少动、度数低的一端多动（质量越大越难推动）；
    //   3. 每个节点的劲度总和不超过 MAX_NODE_STIFFNESS，超出就等比缩小。
    //      稠密图里整个邻域会一起振荡，只靠 1、2 不够（实测二分团 30×30 仍会失稳）。
    // 两端度数都是 1 的边与原来完全一样：两端各得 LINK_STIFFNESS。
    const degree = new Int32Array(n);
    for (let k = 0; k < linkTotal; k++) {
      degree[linkA[k]]++;
      degree[linkB[k]]++;
    }
    const kA = new Float64Array(linkTotal);
    const kB = new Float64Array(linkTotal);
    const stiffness = new Float64Array(n);
    for (let k = 0; k < linkTotal; k++) {
      const da = degree[linkA[k]];
      const db = degree[linkB[k]];
      const strength = LINK_STIFFNESS / Math.sqrt(Math.min(da, db));
      kA[k] = (strength * 2 * db) / (da + db);
      kB[k] = (strength * 2 * da) / (da + db);
      stiffness[linkA[k]] += kA[k];
      stiffness[linkB[k]] += kB[k];
    }
    for (let k = 0; k < linkTotal; k++) {
      kA[k] *= Math.min(1, MAX_NODE_STIFFNESS / stiffness[linkA[k]]);
      kB[k] *= Math.min(1, MAX_NODE_STIFFNESS / stiffness[linkB[k]]);
    }

    // 理想间距：每个节点平均能分到的空间（只取决于画布和节点数，循环外算一次）
    const area = canvasWidth * canvasHeight;
    const spacing = Math.min(140, Math.max(36, Math.sqrt(area / Math.max(1, n)) * 0.9));
    const cutoff = spacing * REPEL_RANGE;
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const padding = 40;

    const next = new Int32Array(n);

    for (let iter = 0; iter < iterations; iter++) {
      // 弹簧力（吸引）
      for (let k = 0; k < linkTotal; k++) {
        const a = linkA[k];
        const b = linkB[k];
        const dx = px[b] - px[a];
        const dy = py[b] - py[a];
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = ((dist - LINK_REST_LENGTH) * alpha) / dist;
        const fx = force * dx;
        const fy = force * dy;
        vx[a] += fx * kA[k];
        vy[a] += fy * kA[k];
        vx[b] -= fx * kB[k];
        vy[b] -= fy * kB[k];
      }

      // 斥力：建网格
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        if (!alive[i]) continue;
        if (px[i] < minX) minX = px[i];
        if (px[i] > maxX) maxX = px[i];
        if (py[i] < minY) minY = py[i];
        if (py[i] > maxY) maxY = py[i];
      }
      if (minX <= maxX) {
        // 格子不小于作用半径即可保证 3×3 邻格覆盖所有会互相作用的节点对
        const cell = Math.max(cutoff, Math.max(maxX - minX, maxY - minY) / MAX_GRID_CELLS_PER_SIDE);
        const gw = Math.floor((maxX - minX) / cell) + 1;
        const gh = Math.floor((maxY - minY) / cell) + 1;
        const head = new Int32Array(gw * gh).fill(-1);
        const cellX = new Int32Array(n);
        const cellY = new Int32Array(n);
        for (let i = 0; i < n; i++) {
          if (!alive[i]) continue;
          const gx = Math.floor((px[i] - minX) / cell);
          const gy = Math.floor((py[i] - minY) / cell);
          cellX[i] = gx;
          cellY[i] = gy;
          const c = gy * gw + gx;
          next[i] = head[c];
          head[c] = i;
        }

        for (let i = 0; i < n; i++) {
          if (!alive[i]) continue;
          const x0 = Math.max(0, cellX[i] - 1);
          const x1 = Math.min(gw - 1, cellX[i] + 1);
          const y0 = Math.max(0, cellY[i] - 1);
          const y1 = Math.min(gh - 1, cellY[i] + 1);
          for (let gy = y0; gy <= y1; gy++) {
            for (let gx = x0; gx <= x1; gx++) {
              for (let j = head[gy * gw + gx]; j !== -1; j = next[j]) {
                if (j <= i) continue; // 每一对只算一次
                let dx = px[j] - px[i];
                let dy = py[j] - py[i];
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 0.01) {
                  // 完全重合：朝确定的方向推开一点
                  dx = Math.cos(i + j);
                  dy = Math.sin(i + j);
                  dist = 1;
                }
                if (dist >= cutoff) continue;
                // 比理想间距还近时推得更用力（防重叠），否则按平方反比衰减
                const push =
                  dist < spacing
                    ? (spacing - dist) * 0.5 + 2
                    : ((spacing * spacing) / (dist * dist)) * 2;
                const fx = (push * alpha * dx) / dist;
                const fy = (push * alpha * dy) / dist;
                vx[i] -= fx;
                vy[i] -= fy;
                vx[j] += fx;
                vy[j] += fy;
              }
            }
          }
        }
      }

      // 向中心的轻微引力 + 阻尼 + 位移 + 边界
      for (let i = 0; i < n; i++) {
        if (!alive[i]) continue;
        if (fixed[i]) {
          vx[i] = 0;
          vy[i] = 0;
          continue;
        }
        vx[i] += (cx - px[i]) * 0.002 * alpha;
        vy[i] += (cy - py[i]) * 0.002 * alpha;
        vx[i] *= 0.8;
        vy[i] *= 0.8;
        px[i] += vx[i];
        py[i] += vy[i];
        if (px[i] < padding) px[i] = padding;
        if (px[i] > canvasWidth - padding) px[i] = canvasWidth - padding;
        if (py[i] < padding) py[i] = padding;
        if (py[i] > canvasHeight - padding) py[i] = canvasHeight - padding;
      }
    }

    // --- 写回 ---
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const p = positions.get(nodes[i].id)!;
      const v = velocities.get(nodes[i].id)!;
      p.x = px[i];
      p.y = py[i];
      v.vx = vx[i];
      v.vy = vy[i];
    }
  }
}

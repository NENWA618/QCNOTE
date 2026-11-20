import {
  SimplifiedSimulation,
  type OptimizedGraphLink,
  type OptimizedGraphNode,
} from './graphOptimization';

/** 温度低于它就认为布局已稳定，不再计算 */
export const ALPHA_MIN = 0.001;
/** 从 alpha = 1 冷却到 ALPHA_MIN 一共需要的迭代次数 */
export const COOLING_ITERATIONS = 1500;
const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / COOLING_ITERATIONS);
/** 图有增删时的"回温"温度：足够让新节点融入，又不会把整张图重新洗牌 */
export const REHEAT_ALPHA = 0.3;
/** 新节点放在已有邻居旁边多远（px） */
const NEIGHBOR_OFFSET = 40;
const PADDING = 30;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * 力导向布局的持久状态：位置、速度和温度。
 *
 * - 图变化时按节点 id 复用旧位置，只给新节点安排初始位置，所以后台同步、新增一篇笔记
 *   都不会让整张图重新洗牌。
 * - 温度（alpha）按迭代次数逐步冷却，冷却到头自动停止；不再靠"固定 N 帧"拍脑袋。
 */
export class GraphLayout {
  /** 引用在整个生命周期内保持不变，渲染循环可以一直持有它 */
  readonly positions = new Map<string, { x: number; y: number }>();
  readonly velocities = new Map<string, { vx: number; vy: number }>();
  alpha = 1;

  private pinned = new Set<string>();
  private nodes: OptimizedGraphNode[] = [];
  private links: OptimizedGraphLink[] = [];
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  get settled(): boolean {
    return this.alpha < ALPHA_MIN;
  }

  /** 画布尺寸变了：按比例挪动节点，保持布局形状 */
  setSize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    if (this.width > 0 && this.height > 0) {
      const sx = width / this.width;
      const sy = height / this.height;
      this.positions.forEach((p) => {
        p.x *= sx;
        p.y *= sy;
      });
    }
    this.width = width;
    this.height = height;
  }

  /**
   * 换一张图。已有节点保留位置（速度清零），新节点优先放在已有邻居旁边，
   * 没有邻居的按黄金角螺旋铺开。返回复用了多少节点。
   * 只有节点或连线真的增删了才回温，仅改颜色、标题之类不会让图重新动起来。
   */
  setGraph(nodes: OptimizedGraphNode[], links: OptimizedGraphLink[]): { reused: number } {
    const prevPositions = new Map(this.positions);
    const prevLinkKeys = new Set(this.links.map((l) => `${l.source}\u0001${l.target}`));
    const hadNodes = this.nodes.length > 0;

    this.positions.clear();
    this.velocities.clear();
    this.pinned.clear();
    this.nodes = nodes;
    this.links = links;

    let reused = 0;
    const fresh: OptimizedGraphNode[] = [];
    for (const node of nodes) {
      const p = prevPositions.get(node.id);
      if (p) {
        this.positions.set(node.id, { x: p.x, y: p.y });
        this.velocities.set(node.id, { vx: 0, vy: 0 });
        reused++;
      } else {
        fresh.push(node);
      }
    }

    // 只认"之前就有位置"的邻居作锚点：全新的图保持原来的螺旋铺开
    const neighbors = new Map<string, string[]>();
    const addNeighbor = (a: string, b: string) => {
      const list = neighbors.get(a);
      if (list) list.push(b);
      else neighbors.set(a, [b]);
    };
    for (const l of links) {
      addNeighbor(l.source, l.target);
      addNeighbor(l.target, l.source);
    }

    const maxR = Math.max(1, Math.min(this.width, this.height) / 2 - PADDING);
    const short = Math.max(1, Math.min(this.width, this.height));
    fresh.forEach((node, k) => {
      const anchorId = neighbors.get(node.id)?.find((id) => prevPositions.has(id));
      let x: number;
      let y: number;
      if (anchorId) {
        const a = this.positions.get(anchorId)!;
        x = a.x + NEIGHBOR_OFFSET * Math.cos(k * GOLDEN_ANGLE);
        y = a.y + NEIGHBOR_OFFSET * Math.sin(k * GOLDEN_ANGLE);
      } else {
        const r = maxR * Math.sqrt((k + 0.5) / fresh.length);
        x = this.width / 2 + r * Math.cos(k * GOLDEN_ANGLE) * (this.width / short);
        y = this.height / 2 + r * Math.sin(k * GOLDEN_ANGLE) * (this.height / short);
      }
      this.positions.set(node.id, {
        x: Math.min(this.width - PADDING, Math.max(PADDING, x)),
        y: Math.min(this.height - PADDING, Math.max(PADDING, y)),
      });
      this.velocities.set(node.id, { vx: 0, vy: 0 });
    });

    const removed = hadNodes ? prevPositions.size - reused : 0;
    const linksChanged =
      prevLinkKeys.size !== links.length ||
      links.some((l) => !prevLinkKeys.has(`${l.source}\u0001${l.target}`));

    if (!hadNodes || reused === 0) {
      this.alpha = 1; // 全新的图：从头冷却
    } else if (fresh.length > 0 || removed > 0 || linksChanged) {
      this.alpha = Math.max(this.alpha, REHEAT_ALPHA);
    }
    return { reused };
  }

  /** 把节点钉在 (x, y)（限制在画布内），它不再受力，但会拉着邻居动。用于拖拽。 */
  pin(id: string, x: number, y: number): void {
    const p = this.positions.get(id);
    if (!p) return;
    p.x = Math.min(this.width - PADDING, Math.max(PADDING, x));
    p.y = Math.min(this.height - PADDING, Math.max(PADDING, y));
    const v = this.velocities.get(id);
    if (v) {
      v.vx = 0;
      v.vy = 0;
    }
    this.pinned.add(id);
  }

  unpin(id: string): void {
    this.pinned.delete(id);
  }

  /** 把温度抬到至少 alpha（不会降温），让布局重新动起来 */
  reheat(alpha: number): void {
    this.alpha = Math.max(this.alpha, alpha);
  }

  /** 以当前温度推进若干次迭代，然后按迭代次数降温。已稳定则什么也不做。 */
  step(iterations: number): void {
    if (this.settled || iterations <= 0) return;
    SimplifiedSimulation.simulate(
      this.nodes,
      this.links,
      this.positions,
      this.velocities,
      iterations,
      this.width,
      this.height,
      this.alpha,
      this.pinned,
    );
    // 拖拽时不回中：否则拖一个节点会让其余所有节点朝反方向漂
    if (this.pinned.size === 0) this.recenter();
    this.alpha *= Math.pow(1 - ALPHA_DECAY, iterations);
    if (this.alpha < ALPHA_MIN) this.alpha = 0;
  }

  /**
   * 把整个图的质心平移回画布中心（d3 的 forceCenter）。
   * 向中心的引力会随温度一起衰减，冷却得快时弱约束的节点（孤立笔记、小连通块）
   * 来不及被拉回来，整张图会偏心；这里直接平移，与温度无关。
   */
  private recenter(): void {
    const count = this.positions.size;
    if (count === 0) return;
    let sx = 0;
    let sy = 0;
    this.positions.forEach((p) => {
      sx += p.x;
      sy += p.y;
    });
    const dx = this.width / 2 - sx / count;
    const dy = this.height / 2 - sy / count;
    this.positions.forEach((p) => {
      p.x = Math.min(this.width - PADDING, Math.max(PADDING, p.x + dx));
      p.y = Math.min(this.height - PADDING, Math.max(PADDING, p.y + dy));
    });
  }
}

import type { NoteItem } from './storage/types';

export interface GraphNodeData {
  id: string;
  label: string;
  size: number;
  color: string;
  /** 已解析的引用数（出 + 入），决定圆的大小和 LOD 的取舍 */
  importance: number;
}

export interface GraphEdgeData {
  /** 单向边：source 引用 target；双向引用（互相链接）只保留一条，mutual 为 true */
  source: string;
  target: string;
  mutual: boolean;
}

export interface GraphData {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  /** 去重后的有向引用数（A→B 与 B→A 算两条），悬空链接、自引用不计 */
  linkCount: number;
}

/**
 * 由笔记构建图数据。
 *
 * `links`（正向）和 `backlinks`（反向）描述的是同一批引用，所以先合并成一个
 * 有向引用集合再画：A 链接 B 只产生一条边，而不是正向 + 反向两条重叠的线。
 * `links` 里指向不存在笔记的标题（悬空链接）和自引用都不会生成边。
 */
export function buildGraphData(notes: NoteItem[]): GraphData {
  const active = notes.filter((n) => !n.isDeleted);
  const titleToId = new Map(active.map((note) => [note.title, note.id]));
  const ids = new Set(active.map((note) => note.id));

  const outgoing = new Map<string, Set<string>>();
  const addRef = (source: string, target: string) => {
    if (source === target || !ids.has(source) || !ids.has(target)) return;
    let set = outgoing.get(source);
    if (!set) outgoing.set(source, (set = new Set()));
    set.add(target);
  };

  active.forEach((note) => {
    (note.links || []).forEach((title) => {
      const targetId = titleToId.get(title);
      if (targetId) addRef(note.id, targetId);
    });
    (note.backlinks || []).forEach((sourceId) => addRef(sourceId, note.id));
  });

  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) || 0) + 1);
  const edges: GraphEdgeData[] = [];
  let linkCount = 0;

  outgoing.forEach((targets, source) => {
    targets.forEach((target) => {
      linkCount++;
      bump(source);
      bump(target);
      const mutual = outgoing.get(target)?.has(source) === true;
      // 双向引用只在字典序较小的一端生成一次
      if (mutual && source > target) return;
      edges.push({ source, target, mutual });
    });
  });

  const nodes: GraphNodeData[] = active.map((note) => {
    const count = degree.get(note.id) || 0;
    return {
      id: note.id,
      label: note.title || '无标题',
      size: Math.max(8, Math.min(26, 8 + count * 3)),
      color: note.color || '#4ecdc4',
      importance: count + 1,
    };
  });

  return { nodes, edges, linkCount };
}

/**
 * 图的"形状指纹"：节点（id、标题、颜色、大小）和连线都相同，指纹就相同。
 * 笔记正文被编辑、同步刷新了整个数组这类不影响图的变化，指纹不变，布局就不用重来。
 * 与数组顺序无关。
 */
export function graphSignature(graph: GraphData): string {
  const nodes = graph.nodes
    .map((n) => `${n.id}\u0001${n.label}\u0001${n.color}\u0001${n.size}`)
    .sort();
  const edges = graph.edges
    .map((e) => `${e.source}\u0001${e.target}\u0001${e.mutual ? 1 : 0}`)
    .sort();
  return `${nodes.join('\u0002')}\u0003${edges.join('\u0002')}`;
}

/**
 * 图里最多画多少个节点。2000 个节点时布局每次迭代约几毫秒，渲染和命中检测也都够快；
 * 再多就会拖慢首屏和动画，所以超过的部分才被裁掉（以前超过 200 篇就悄悄藏掉 30%，
 * 超过约 1040 篇藏掉 70%）。
 */
export const MAX_RENDERED_NODES = 2000;

/**
 * 节点超过上限时，保留重要度（链接数）最高的 max 个；同分的保留靠前的。
 * 不超过上限时原样返回同一个数组。保留下来的节点维持原来的相对顺序。
 */
export function limitNodes<T extends { importance: number }>(
  nodes: T[],
  max: number = MAX_RENDERED_NODES,
): T[] {
  if (nodes.length <= max) return nodes;
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => b.node.importance - a.node.importance || a.index - b.index)
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map(({ node }) => node);
}

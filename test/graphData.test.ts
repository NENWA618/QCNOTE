import { describe, it, expect } from 'vitest';
import { buildGraphData, graphSignature, limitNodes, MAX_RENDERED_NODES } from '../lib/graphData';
import type { NoteItem } from '../lib/storage';

const note = (over: Partial<NoteItem>): NoteItem => ({
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

describe('buildGraphData', () => {
  it('draws one edge per reference even when both links and backlinks describe it', () => {
    const { edges, linkCount } = buildGraphData([
      note({ id: 'a', title: 'A', links: ['B'] }),
      note({ id: 'b', title: 'B', backlinks: ['a'] }),
    ]);
    expect(edges).toEqual([{ source: 'a', target: 'b', mutual: false }]);
    expect(linkCount).toBe(1);
  });

  it('collapses mutual references into a single mutual edge but counts both', () => {
    const { edges, linkCount } = buildGraphData([
      note({ id: 'a', title: 'A', links: ['B'], backlinks: ['b'] }),
      note({ id: 'b', title: 'B', links: ['A'], backlinks: ['a'] }),
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0].mutual).toBe(true);
    expect(linkCount).toBe(2);
  });

  it('still finds an edge when only the backlink side is recorded', () => {
    const { edges } = buildGraphData([
      note({ id: 'a', title: 'A' }),
      note({ id: 'b', title: 'B', backlinks: ['a'] }),
    ]);
    expect(edges).toEqual([{ source: 'a', target: 'b', mutual: false }]);
  });

  it('ignores dangling links, self links and unknown backlink ids', () => {
    const { edges, linkCount, nodes } = buildGraphData([
      note({ id: 'a', title: 'A', links: ['Missing', 'A'], backlinks: ['ghost', 'a'] }),
    ]);
    expect(edges).toEqual([]);
    expect(linkCount).toBe(0);
    // 悬空链接不会让节点变大
    expect(nodes[0].size).toBe(8);
    expect(nodes[0].importance).toBe(1);
  });

  it('leaves out deleted notes and references to them', () => {
    const { nodes, edges, linkCount } = buildGraphData([
      note({ id: 'a', title: 'A', links: ['B'] }),
      note({ id: 'b', title: 'B', isDeleted: true }),
    ]);
    expect(nodes.map((n) => n.id)).toEqual(['a']);
    expect(edges).toEqual([]);
    expect(linkCount).toBe(0);
  });

  it('sizes nodes by resolved references in both directions, with a cap', () => {
    const hub = note({
      id: 'hub',
      title: 'Hub',
      links: Array.from({ length: 10 }, (_, i) => `L${i}`),
    });
    const leaves = Array.from({ length: 10 }, (_, i) => note({ id: `l${i}`, title: `L${i}` }));
    const { nodes } = buildGraphData([hub, ...leaves]);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('hub')!.size).toBe(26);
    expect(byId.get('hub')!.importance).toBe(11);
    expect(byId.get('l0')!.size).toBe(11);
  });

  it('falls back to a placeholder label and default colour', () => {
    const { nodes } = buildGraphData([note({ id: 'a', title: '', color: undefined })]);
    expect(nodes[0].label).toBe('无标题');
    expect(nodes[0].color).toBe('#4ecdc4');
  });

  describe('graphSignature', () => {
    const base = () => [
      note({ id: 'a', title: 'A', content: 'one', links: ['B'] }),
      note({ id: 'b', title: 'B', backlinks: ['a'] }),
    ];
    const sig = (notes: NoteItem[]) => graphSignature(buildGraphData(notes));

    it('ignores changes that do not affect the graph, and array order', () => {
      const original = sig(base());
      const edited = base();
      edited[0] = { ...edited[0], content: 'completely different text', updatedAt: 99 };
      expect(sig(edited)).toBe(original);
      expect(sig([...base()].reverse())).toBe(original);
    });

    it('changes when a node, a link, a title or a colour changes', () => {
      const original = sig(base());
      expect(sig([...base(), note({ id: 'c', title: 'C' })])).not.toBe(original);
      expect(sig([note({ id: 'a', title: 'A' }), note({ id: 'b', title: 'B' })])).not.toBe(
        original,
      );
      const renamed = base();
      renamed[1] = { ...renamed[1], title: 'B2' };
      expect(sig(renamed)).not.toBe(original);
      const recoloured = base();
      recoloured[1] = { ...recoloured[1], color: '#00ff00' };
      expect(sig(recoloured)).not.toBe(original);
    });
  });
});

describe('limitNodes', () => {
  const nodes = (importances: number[]) =>
    importances.map((importance, i) => ({ id: `n${i}`, importance }));

  it('does nothing up to the limit: same array back, nothing hidden', () => {
    const list = nodes([1, 5, 2]);
    expect(limitNodes(list, 3)).toBe(list);
    expect(limitNodes(list)).toBe(list);
  });

  it('keeps the most-linked nodes in their original order, ties go to the earlier one', () => {
    const list = nodes([1, 5, 2, 5, 1, 3]);
    // 取前 3：重要度 5、5、3 → n1、n3、n5，保持原顺序
    expect(limitNodes(list, 3).map((n) => n.id)).toEqual(['n1', 'n3', 'n5']);
    // 取前 2：两个 5
    expect(limitNodes(list, 2).map((n) => n.id)).toEqual(['n1', 'n3']);
    // 同分时靠前的优先：1、1 之间选 n0
    expect(limitNodes(nodes([1, 1, 1]), 1).map((n) => n.id)).toEqual(['n0']);
  });

  it('does not mutate its input', () => {
    const list = nodes([1, 5, 2]);
    limitNodes(list, 1);
    expect(list.map((n) => n.id)).toEqual(['n0', 'n1', 'n2']);
  });

  it('defaults to a limit well above what the old LOD (200) allowed', () => {
    expect(MAX_RENDERED_NODES).toBeGreaterThanOrEqual(1000);
  });
});

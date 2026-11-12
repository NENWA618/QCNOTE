import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Utils from '../lib/utils';

const mk = (i: number, extra = '') => ({
  id: `note-${i}`,
  title: `note ${i}`,
  content: `filler text number ${i} ${extra}`,
  category: i % 2 ? 'a' : 'b',
  tags: [`t${i % 7}`],
  color: '#fff',
  createdAt: 1700000000000 + i * 86400000,
  updatedAt: 1,
});

// 450 篇 → 4 个分片（每片目标约 200 篇，向上取 2 的幂）
const makeNotes = () => Array.from({ length: 450 }, (_, i) => mk(i, i === 123 ? 'zebra' : ''));
const ids = (list: Array<{ id: string }>) => list.map((n) => n.id).sort();

describe('sharded search index', () => {
  beforeEach(() => Utils.clearSearchCaches());
  afterEach(() => {
    vi.useRealTimers();
    Utils.clearSearchCaches();
  });

  it('多个分片下命中集合正确', () => {
    const notes = makeNotes();
    expect(ids(Utils.searchNotes(notes as any, 'zebra'))).toEqual(['note-123']);
    expect(Utils.searchCacheStats().shards).toBe(4);
  });

  it('改一篇笔记后，搜索结果更新，且只重建它所在的分片', () => {
    const notes = makeNotes();
    Utils.searchNotes(notes as any, 'zebra');

    const edited = notes.map((n, i) => (i === 300 ? { ...n, content: `${n.content} giraffe` } : n));
    expect(ids(Utils.searchNotes(edited as any, 'giraffe'))).toEqual(['note-300']);
    expect(ids(Utils.searchNotes(edited as any, 'zebra'))).toEqual(['note-123']);
    expect(Utils.searchCacheStats().shards).toBe(4);
  });

  it('删除一篇笔记后，它不再出现在结果里', () => {
    const notes = makeNotes();
    expect(ids(Utils.searchNotes(notes as any, 'zebra'))).toEqual(['note-123']);
    const without = notes.filter((n) => n.id !== 'note-123');
    expect(ids(Utils.searchNotes(without as any, 'zebra'))).toEqual([]);
  });

  it('日期过滤在多个分片下仍然生效', () => {
    const notes = makeNotes();
    // note-123 创建于 2023-11-14 + 123 天
    const hit = Utils.searchNotes(notes as any, 'zebra AND date:2024-03-01..2024-03-31');
    expect(ids(hit)).toEqual(['note-123']);
    const miss = Utils.searchNotes(notes as any, 'zebra AND date:2023-11-14..2023-11-30');
    expect(ids(miss)).toEqual([]);
  });

  it('候选池大小不同（如回收站）不会互相顶掉缓存', () => {
    const notes = makeNotes();
    Utils.searchNotes(notes as any, 'zebra');
    const before = Utils.searchCacheStats().shards;
    Utils.searchNotes(notes.slice(0, 5) as any, 'filler'); // 小池子，另一组缓存键
    expect(Utils.searchCacheStats().shards).toBe(before + 1);
    // 回到大池子：分片还在，不需要新建
    Utils.searchNotes(notes as any, 'zebra');
    expect(Utils.searchCacheStats().shards).toBe(before + 1);
  });
});

describe('warmSearchIndex', () => {
  beforeEach(() => {
    Utils.clearSearchCaches();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    Utils.clearSearchCaches();
  });

  it('等一小会儿后才开始，并在后台一片一片把索引建好', () => {
    const notes = makeNotes();
    Utils.warmSearchIndex(notes as any);
    expect(Utils.searchCacheStats().shards).toBe(0);

    vi.advanceTimersByTime(299);
    expect(Utils.searchCacheStats().shards).toBe(0);

    vi.advanceTimersByTime(1); // 到点：先建第一片
    expect(Utils.searchCacheStats().shards).toBe(1);

    vi.runAllTimers();
    expect(Utils.searchCacheStats().shards).toBe(4);
  });

  it('取消后不再继续建', () => {
    const notes = makeNotes();
    const cancel = Utils.warmSearchIndex(notes as any);
    vi.advanceTimersByTime(300);
    expect(Utils.searchCacheStats().shards).toBe(1);
    cancel();
    vi.runAllTimers();
    expect(Utils.searchCacheStats().shards).toBe(1);
  });

  it('只补失效的分片：笔记改了一篇，预热只重建一片', () => {
    const notes = makeNotes();
    Utils.warmSearchIndex(notes as any);
    vi.runAllTimers();
    expect(Utils.searchCacheStats().shards).toBe(4);

    const edited = notes.map((n, i) => (i === 10 ? { ...n, content: `${n.content} okapi` } : n));
    Utils.warmSearchIndex(edited as any);
    vi.runAllTimers();
    expect(Utils.searchCacheStats().shards).toBe(4);
    // 预热过的索引直接可用，结果正确
    expect(ids(Utils.searchNotes(edited as any, 'okapi'))).toEqual(['note-10']);
  });
});

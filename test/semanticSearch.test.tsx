import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const embeddings = vi.hoisted(() => ({
  embedTexts: vi.fn(),
  isSemanticSearchAvailable: vi.fn(() => true),
  onEmbeddingProgress: vi.fn((_cb: (progress: number) => void) => () => {}),
  cosineSimilarity: (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0),
}));

vi.mock('../lib/embeddings', () => embeddings);

import { SEMANTIC_SEARCH_DEBOUNCE_MS, useSemanticSearch } from '../lib/hooks/useSemanticSearch';
import type { NoteItem } from '../lib/storage';
import type { RagCache, RagCacheStore } from '../lib/rag';

const VOCAB = ['苹果', '香蕉'];
function fakeVector(text: string): number[] {
  const v: number[] = VOCAB.map((w) => (text.includes(w) ? 1 : 0));
  v.push(0.05);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

function note(id: string, title: string, content: string, extra: Partial<NoteItem> = {}): NoteItem {
  return {
    id,
    title,
    content,
    category: '',
    tags: [],
    color: '#fff',
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function makeStore() {
  let cache: RagCache | null = null;
  return {
    loadRagCache: vi.fn(async () => cache),
    saveRagCache: vi.fn(async (c: RagCache) => {
      cache = c;
    }),
  } satisfies RagCacheStore;
}

const WAIT = { timeout: SEMANTIC_SEARCH_DEBOUNCE_MS + 2500 };

type Opts = Parameters<typeof useSemanticSearch>[0];

describe('useSemanticSearch', () => {
  // renderHook 的 props 必须引用稳定（notes 在依赖里），所以笔记数组放在外面
  const notes = [
    note('both', '水果杂谈', '苹果和香蕉都很好吃。'),
    note('apple', '苹果', '只讲苹果。'),
    note('code', '编程', '学习 Python。'),
  ];
  const single = [notes[1]];
  let store: ReturnType<typeof makeStore>;
  const opts = (extra: Partial<Opts> = {}): Opts => ({
    enabled: true,
    query: '苹果',
    notes,
    cacheStore: store,
    ...extra,
  });

  beforeEach(() => {
    store = makeStore();
    embeddings.embedTexts.mockReset();
    embeddings.embedTexts.mockImplementation(async (texts: string[]) => texts.map(fakeVector));
    embeddings.isSemanticSearchAvailable.mockReturnValue(true);
    embeddings.onEmbeddingProgress.mockReset();
    embeddings.onEmbeddingProgress.mockImplementation(() => () => {});
  });
  afterEach(() => cleanup());

  it('一次查询同时给出相关笔记 id 和相关段落', async () => {
    const { result } = renderHook(() => useSemanticSearch(opts()));

    await waitFor(() => expect(result.current.status).toBe('ready'), WAIT);
    expect(result.current.ids).toEqual(['apple', 'both']);
    expect(result.current.hits.map((h) => h.noteId).sort()).toEqual(['apple', 'both']);
    expect(result.current.hitsQuery).toBe('苹果');
    expect(result.current.error).toBeNull();
  });

  it('同一个搜索词只做一次 query embedding、只读一次缓存（不会跑两遍检索）', async () => {
    const { result } = renderHook(() => useSemanticSearch(opts()));
    await waitFor(() => expect(result.current.status).toBe('ready'), WAIT);

    const queryEmbeds = embeddings.embedTexts.mock.calls.filter(
      ([texts]) => texts.length === 1 && texts[0] === '苹果',
    );
    expect(queryEmbeds).toHaveLength(1);
    expect(store.loadRagCache).toHaveBeenCalledTimes(1);
  });

  it('停止输入前不检索，不会在打字时偷偷跑模型', async () => {
    const { result } = renderHook(() => useSemanticSearch(opts()));

    expect(embeddings.embedTexts).not.toHaveBeenCalled();
    expect(store.loadRagCache).not.toHaveBeenCalled();
    expect(result.current.status).toBe('searching');
    await waitFor(() => expect(result.current.status).toBe('ready'), WAIT);
  });

  it('连续改动搜索词只检索最后一次', async () => {
    const { result, rerender } = renderHook((p: Opts) => useSemanticSearch(p), {
      initialProps: opts({ query: '苹' }),
    });
    rerender(opts({ query: '苹果' }));

    await waitFor(() => expect(result.current.status).toBe('ready'), WAIT);
    expect(result.current.hitsQuery).toBe('苹果');
    expect(store.loadRagCache).toHaveBeenCalledTimes(1);
  });

  it('未开启或搜索词为空时保持空闲，不触发 embedding', async () => {
    const off = renderHook(() => useSemanticSearch(opts({ enabled: false })));
    const empty = renderHook(() => useSemanticSearch(opts({ query: '  ' })));
    await new Promise((r) => setTimeout(r, SEMANTIC_SEARCH_DEBOUNCE_MS + 100));

    for (const { result } of [off, empty]) {
      expect(result.current.status).toBe('idle');
      expect(result.current.ids).toEqual([]);
      expect(result.current.hits).toEqual([]);
    }
    expect(embeddings.embedTexts).not.toHaveBeenCalled();
  });

  it('新一轮检索进行中，继续展示上一轮的结果，hitsQuery 仍是上一轮的词', async () => {
    const { result, rerender } = renderHook((p: Opts) => useSemanticSearch(p), {
      initialProps: opts(),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'), WAIT);
    const before = result.current.hits;

    rerender(opts({ query: '香蕉' }));
    expect(result.current.status).toBe('searching');
    expect(result.current.hits).toBe(before);
    expect(result.current.hitsQuery).toBe('苹果');

    await waitFor(() => expect(result.current.hitsQuery).toBe('香蕉'), WAIT);
    expect(result.current.status).toBe('ready');
  });

  it('候选池永远只含未删除的笔记：回收站里的不会被索引，也不会出现在结果里', async () => {
    const withTrash = [
      note('gone', '已删除', '苹果苹果', { isDeleted: true }),
      note('live', '正常', '苹果在这里'),
    ];
    const { result } = renderHook(() => useSemanticSearch(opts({ notes: withTrash })));
    await waitFor(() => expect(result.current.status).toBe('ready'), WAIT);

    expect(result.current.ids).toEqual(['live']);
    expect(result.current.hits.map((h) => h.noteId)).toEqual(['live']);
    // 缓存里只有未删除的笔记，所以进出回收站视图不会让缓存清掉再重建
    const cached = await store.loadRagCache();
    expect(Object.keys(cached ?? {})).toEqual(['live']);
  });

  it('建立索引时报告进度', async () => {
    let release!: () => void;
    embeddings.embedTexts.mockImplementation(
      (texts: string[]) =>
        new Promise((resolve) => {
          release = () => resolve(texts.map(fakeVector));
        }),
    );
    const { result } = renderHook(() => useSemanticSearch(opts({ notes: single })));

    await waitFor(() => expect(result.current.status).toBe('indexing'), WAIT);
    expect(result.current.indexProgress).toEqual({ done: 0, total: 1 });

    release();
    await waitFor(() => expect(embeddings.embedTexts).toHaveBeenCalledTimes(1));
    release(); // 问题本身的 embedding
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.indexProgress).toBeNull();
  });

  it('下载模型时报告进度', async () => {
    let emit!: (p: number) => void;
    embeddings.onEmbeddingProgress.mockImplementation((cb) => {
      emit = cb;
      return () => {};
    });
    let release!: () => void;
    embeddings.embedTexts.mockImplementation(
      (texts: string[]) =>
        new Promise((resolve) => {
          release = () => resolve(texts.map(fakeVector));
        }),
    );
    const { result } = renderHook(() => useSemanticSearch(opts({ notes: single })));

    act(() => emit(37));
    expect(result.current.status).toBe('loading-model');
    expect(result.current.progress).toBe(37);

    await waitFor(() => expect(embeddings.embedTexts).toHaveBeenCalled(), WAIT);
    release();
    await waitFor(() => expect(embeddings.embedTexts).toHaveBeenCalledTimes(1));
    release();
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('检索失败时给出错误信息，并保留上一轮的结果', async () => {
    const { result, rerender } = renderHook((p: Opts) => useSemanticSearch(p), {
      initialProps: opts(),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'), WAIT);
    const before = result.current.hits;

    embeddings.embedTexts.mockRejectedValue(new Error('模型下载失败'));
    rerender(opts({ query: '香蕉' }));

    await waitFor(() => expect(result.current.status).toBe('error'), WAIT);
    expect(result.current.error).toBe('模型下载失败');
    expect(result.current.hits).toBe(before);
  });

  it('浏览器不支持 Worker，或存储没就绪：回退到普通搜索，不触发 embedding', async () => {
    embeddings.isSemanticSearchAvailable.mockReturnValue(false);
    const unsupported = renderHook(() => useSemanticSearch(opts()));
    const noStore = renderHook(() => useSemanticSearch(opts({ cacheStore: null })));
    await new Promise((r) => setTimeout(r, SEMANTIC_SEARCH_DEBOUNCE_MS + 100));

    for (const { result } of [unsupported, noStore]) {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toBeNull();
      expect(result.current.ids).toEqual([]);
      expect(result.current.hits).toEqual([]);
    }
    expect(embeddings.embedTexts).not.toHaveBeenCalled();
  });
});

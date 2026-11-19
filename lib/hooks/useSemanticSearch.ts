import { useEffect, useState } from 'react';
import { searchByMeaning, type RagCacheStore, type RagHit, type RagIndexProgress } from '../rag';
import { isSemanticSearchAvailable, onEmbeddingProgress } from '../embeddings';
import type { NoteItem } from '../storage';

export type SemanticStatus =
  'idle' | 'loading-model' | 'indexing' | 'searching' | 'ready' | 'error';

/** 停止输入多久后才开始检索：别在每次按键时都跑一遍模型推理 */
export const SEMANTIC_SEARCH_DEBOUNCE_MS = 400;

interface SemanticResult {
  // The inputs this result was computed for; a mismatch means a newer search is pending.
  query: string;
  notes: NoteItem[];
  ids: string[];
  hits: RagHit[];
  /** `hits` 是针对哪个搜索词算出来的（新一轮检索进行中时，它仍是上一轮的词） */
  hitsQuery: string;
  status: 'loading-model' | 'indexing' | 'ready' | 'error';
  progress: number;
  indexProgress: RagIndexProgress | null;
  error: string | null;
}

interface UseSemanticSearchOptions {
  /** 调用方负责在结果用不上的视图（如回收站）里传 false，避免白跑模型 */
  enabled: boolean;
  query: string;
  notes: NoteItem[];
  /** Where embeddings are cached (the current user's NoteStorage); null disables search. */
  cacheStore: RagCacheStore | null;
}

const EMPTY = {
  ids: [] as string[],
  hits: [] as RagHit[],
  hitsQuery: '',
  progress: 0,
  indexProgress: null as RagIndexProgress | null,
  error: null as string | null,
};

/**
 * Semantic search as an additive layer on top of keyword search: one debounced
 * query yields both the matching notes (`ids`, appended to the list) and the
 * most relevant passages (`hits`, shown in a panel). One call to
 * `searchByMeaning` builds the index and embeds the query once for both.
 *
 * `status`, `progress` and the results are derived from the latest result, so
 * state is only ever set from async callbacks (never synchronously inside the effect).
 */
export function useSemanticSearch({ enabled, query, notes, cacheStore }: UseSemanticSearchOptions) {
  const [result, setResult] = useState<SemanticResult | null>(null);

  const active = enabled && query.trim() !== '';
  const available = active && cacheStore !== null && isSemanticSearchAvailable();

  useEffect(() => {
    if (!active || !available || !cacheStore) return;

    let cancelled = false;
    const base = { query, notes };
    // 进度回调只改状态，保留上一轮的结果继续展示
    const keepPrev = (prev: SemanticResult | null) => ({
      ids: prev?.ids ?? EMPTY.ids,
      hits: prev?.hits ?? EMPTY.hits,
      hitsQuery: prev?.hitsQuery ?? EMPTY.hitsQuery,
      progress: prev?.progress ?? 0,
    });

    const unsubscribe = onEmbeddingProgress((progress) => {
      if (cancelled) return;
      setResult((prev) => ({
        ...base,
        ...keepPrev(prev),
        status: 'loading-model',
        progress,
        indexProgress: null,
        error: null,
      }));
    });

    const timer = window.setTimeout(async () => {
      try {
        // 候选池永远只含未删除的笔记：向量缓存按候选池清理，池子一变就会清掉再重建
        const pool = notes.filter((n) => !n.isDeleted);
        const { noteIds, hits } = await searchByMeaning(query, pool, cacheStore, {
          onProgress: (indexProgress) => {
            if (cancelled) return;
            setResult((prev) => ({
              ...base,
              ...keepPrev(prev),
              status: 'indexing',
              indexProgress,
              error: null,
            }));
          },
        });
        if (!cancelled) {
          setResult((prev) => ({
            ...base,
            ids: noteIds,
            hits,
            hitsQuery: query,
            status: 'ready',
            progress: prev?.progress ?? 0,
            indexProgress: null,
            error: null,
          }));
        }
      } catch (e) {
        console.warn('[Dashboard] semantic search failed', e);
        if (!cancelled) {
          setResult((prev) => ({
            ...base,
            ...keepPrev(prev),
            status: 'error',
            indexProgress: null,
            error: e instanceof Error ? e.message : String(e),
          }));
        }
      }
    }, SEMANTIC_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [active, available, query, notes, cacheStore]);

  if (!active) return { ...EMPTY, status: 'idle' as SemanticStatus };
  // 环境不支持（没有 Worker）或存储还没就绪：没有结果可展示，状态行会提示已回退到普通搜索
  if (!available) return { ...EMPTY, status: 'error' as SemanticStatus };

  const isCurrent = result !== null && result.query === query && result.notes === notes;

  return {
    // Keep showing the previous matches while a newer search is in flight.
    ids: result?.ids ?? EMPTY.ids,
    hits: result?.hits ?? EMPTY.hits,
    hitsQuery: result?.hitsQuery ?? EMPTY.hitsQuery,
    status: (isCurrent ? result.status : 'searching') as SemanticStatus,
    progress: isCurrent ? result.progress : 0,
    indexProgress: isCurrent ? result.indexProgress : null,
    error: isCurrent ? result.error : null,
  };
}

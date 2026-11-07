import { useCallback, useEffect, useRef, useState } from 'react';
import { retrieveChunks, type RagCacheStore, type RagHit, type RetrieveOptions } from '../rag';
import { isSemanticSearchAvailable, onEmbeddingProgress } from '../embeddings';
import type { NoteItem } from '../storage';

export type RagStatus = 'idle' | 'loading-model' | 'indexing' | 'searching' | 'ready' | 'error';

interface RagState {
  status: RagStatus;
  hits: RagHit[];
  /** 模型下载进度 0-100（只在首次使用时有意义） */
  modelProgress: number;
  /** 建立块索引的进度；没有需要新建的索引时为 null */
  indexProgress: { done: number; total: number } | null;
  error: string | null;
  /** 最近一次完成检索时使用的问题 */
  query: string;
}

const INITIAL: RagState = {
  status: 'idle',
  hits: [],
  modelProgress: 0,
  indexProgress: null,
  error: null,
  query: '',
};

export interface RagSource {
  /** 完整的候选笔记池（见 retrieveChunks 的说明：不要传筛选后的子集） */
  notes: NoteItem[];
  /** 块向量缓存位置（当前用户的 NoteStorage） */
  cacheStore: RagCacheStore;
}

interface UseRagSearchOptions {
  /**
   * 每次检索时调用，取回最新的笔记和缓存存储。
   * 用函数而不是直接传笔记数组：提问发生在用户点击之后，此时读取到的才是最新数据
   * （笔记可能刚在别的标签页里改过），而且调用方不必为了检索把全部笔记常驻在 state 里。
   */
  loadSource: () => Promise<RagSource>;
  options?: Omit<RetrieveOptions, 'onProgress' | 'embed'>;
}

/**
 * 纯前端 RAG 检索。和 useSemanticSearch 不同，这里不随输入防抖自动触发，
 * 而是由调用方在用户提交问题时手动调用 search(query)：
 * 提问是一次明确的动作，且首次会触发模型下载和全量建索引，不应在打字时偷偷发生。
 */
export function useRagSearch({ loadSource, options }: UseRagSearchOptions) {
  const [state, setState] = useState<RagState>(INITIAL);

  // 始终指向最新一次渲染的入参，search 回调就不必因为入参变化而改变引用
  const latest = useRef({ loadSource, options });
  useEffect(() => {
    latest.current = { loadSource, options };
  });

  // 只有最新一次 search 的结果才允许写入状态
  const requestId = useRef(0);
  const unsubscribeProgress = useRef<(() => void) | null>(null);

  const available = isSemanticSearchAvailable();

  const search = useCallback(async (query: string): Promise<RagHit[]> => {
    const { loadSource: load, options: opts } = latest.current;
    const trimmed = query.trim();
    const id = ++requestId.current;
    const isCurrent = () => id === requestId.current;

    unsubscribeProgress.current?.();
    unsubscribeProgress.current = null;

    if (!trimmed) {
      setState(INITIAL);
      return [];
    }
    if (!isSemanticSearchAvailable()) {
      setState({ ...INITIAL, status: 'error', error: '当前环境不支持本地检索', query: trimmed });
      return [];
    }

    setState((prev) => ({ ...prev, status: 'searching', error: null, indexProgress: null }));

    const unsubscribe = onEmbeddingProgress((progress) => {
      if (!isCurrent()) return;
      setState((prev) => ({ ...prev, status: 'loading-model', modelProgress: progress }));
    });
    unsubscribeProgress.current = unsubscribe;

    try {
      const { notes: pool, cacheStore: store } = await load();
      const hits = await retrieveChunks(trimmed, pool, store, {
        ...opts,
        onProgress: (indexProgress) => {
          if (!isCurrent()) return;
          setState((prev) => ({ ...prev, status: 'indexing', indexProgress }));
        },
      });
      if (isCurrent()) {
        setState((prev) => ({
          ...prev,
          status: 'ready',
          hits,
          indexProgress: null,
          error: null,
          query: trimmed,
        }));
      }
      return hits;
    } catch (e) {
      console.warn('[RAG] retrieval failed', e);
      if (isCurrent()) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          indexProgress: null,
          error: e instanceof Error ? e.message : String(e),
          query: trimmed,
        }));
      }
      return [];
    } finally {
      unsubscribe();
      if (unsubscribeProgress.current === unsubscribe) unsubscribeProgress.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    requestId.current++;
    unsubscribeProgress.current?.();
    unsubscribeProgress.current = null;
    setState(INITIAL);
  }, []);

  // 组件卸载时作废进行中的请求并取消进度订阅
  useEffect(
    () => () => {
      requestId.current++;
      unsubscribeProgress.current?.();
    },
    [],
  );

  return { ...state, available, search, reset };
}

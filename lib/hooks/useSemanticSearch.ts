import { useEffect, useState } from 'react';
import Indexer, { type SemanticCacheStore } from '../indexer';
import { isSemanticSearchAvailable, onEmbeddingProgress } from '../embeddings';
import type { NoteItem } from '../storage';

export type SemanticStatus = 'idle' | 'loading-model' | 'searching' | 'ready' | 'error';

interface SemanticResult {
  // The inputs this result was computed for; a mismatch means a newer search is pending.
  query: string;
  notes: NoteItem[];
  viewingTrash: boolean;
  ids: string[];
  status: 'loading-model' | 'ready' | 'error';
  progress: number;
}

interface UseSemanticSearchOptions {
  enabled: boolean;
  query: string;
  notes: NoteItem[];
  viewingTrash: boolean;
  /** Where embeddings are cached (the current user's NoteStorage); null disables search. */
  cacheStore: SemanticCacheStore | null;
}

/**
 * Semantic search as an additive layer on top of keyword search. Debounced so
 * we don't run model inference on every keystroke. `status`, `progress` and
 * `ids` are derived from the latest result, so state is only ever set from
 * async callbacks (never synchronously inside the effect).
 */
export function useSemanticSearch({
  enabled,
  query,
  notes,
  viewingTrash,
  cacheStore,
}: UseSemanticSearchOptions) {
  const [result, setResult] = useState<SemanticResult | null>(null);

  const active = enabled && query.trim() !== '';
  const available = active && cacheStore !== null && isSemanticSearchAvailable();

  useEffect(() => {
    if (!active || !available || !cacheStore) return;

    let cancelled = false;
    const base = { query, notes, viewingTrash };

    const unsubscribe = onEmbeddingProgress((progress) => {
      if (cancelled) return;
      setResult((prev) => ({
        ...base,
        ids: prev?.ids ?? [],
        status: 'loading-model',
        progress,
      }));
    });

    const timer = window.setTimeout(async () => {
      try {
        const pool = notes.filter((n) => (viewingTrash ? true : !n.isDeleted));
        const ids = await Indexer.getSemanticMatches(query, pool, cacheStore);
        if (!cancelled) {
          setResult((prev) => ({ ...base, ids, status: 'ready', progress: prev?.progress ?? 0 }));
        }
      } catch (e) {
        console.warn('[Dashboard] semantic search failed', e);
        if (!cancelled) {
          setResult((prev) => ({
            ...base,
            ids: prev?.ids ?? [],
            status: 'error',
            progress: prev?.progress ?? 0,
          }));
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [active, available, query, notes, viewingTrash, cacheStore]);

  if (!enabled) return { ids: [] as string[], status: 'idle' as SemanticStatus, progress: 0 };
  if (!active) return { ids: [] as string[], status: 'idle' as SemanticStatus, progress: 0 };
  if (!available) return { ids: [] as string[], status: 'error' as SemanticStatus, progress: 0 };

  const isCurrent =
    result !== null &&
    result.query === query &&
    result.notes === notes &&
    result.viewingTrash === viewingTrash;

  return {
    // Keep showing the previous matches while a newer search is in flight.
    ids: result?.ids ?? [],
    status: (isCurrent ? result.status : 'searching') as SemanticStatus,
    progress: isCurrent ? result.progress : 0,
  };
}

/**
 * Improved Indexer with Incremental Updates
 * Optimizes search indexing for large datasets
 */
import lunr from 'lunr';
import IDB from '../idb';
import vector, { Vector } from '../vector';
import sentiment from '../sentiment';
import logger from '../logger';
import { safeAsync, retryAsync } from '../errorHandler';
import type { NoteItem } from './types';

const INDEX_KEY = 'QCNOTE_LUNR_INDEX';
const VECTOR_KEY = 'QCNOTE_VECTORS';
const SENTIMENT_KEY = 'QCNOTE_SENTIMENTS';
const NOTES_HASH_KEY = 'QCNOTE_HASH';
const INDEX_METADATA_KEY = 'QCNOTE_INDEX_METADATA';

interface IndexMetadata {
  version: number;
  lastUpdateTime: number;
  totalNotes: number;
  indexedNotes: Set<string>;
}

// Cache state for performance
let cachedIndex: lunr.Index | null = null;
let cachedVectors: Record<string, Vector> = {};
let cachedSentiments: Record<string, { score: number; comparative: number }> = {};
let cachedMetadata: IndexMetadata | null = null;
let indexDirty = true;

/**
 * Get or initialize index metadata
 */
async function getIndexMetadata(): Promise<IndexMetadata> {
  if (cachedMetadata) {
    return cachedMetadata;
  }

  const metadata = await safeAsync(
    () => IDB.getItem<IndexMetadata>(INDEX_METADATA_KEY),
    null,
    '[Indexer] Failed to load metadata',
  );

  if (metadata) {
    cachedMetadata = {
      ...metadata,
      indexedNotes: new Set(Array.from((metadata.indexedNotes as any) || [])),
    };
    return cachedMetadata;
  }

  cachedMetadata = {
    version: 1,
    lastUpdateTime: 0,
    totalNotes: 0,
    indexedNotes: new Set(),
  };

  return cachedMetadata;
}

/**
 * Save index metadata
 */
async function saveIndexMetadata(metadata: IndexMetadata): Promise<void> {
  const toSave = {
    ...metadata,
    indexedNotes: Array.from(metadata.indexedNotes),
  };

  await safeAsync(
    () => IDB.setItem(INDEX_METADATA_KEY, toSave),
    null,
    '[Indexer] Failed to save metadata',
  );
}

/**
 * Identify changed notes
 */
function getChangedNotes(notes: NoteItem[], previousHashes: Record<string, number>): NoteItem[] {
  return notes.filter((note) => {
    const currentHash = note.updatedAt;
    const previousHash = previousHashes[note.id];
    return previousHash === undefined || previousHash !== currentHash;
  });
}

/**
 * Build a complete index (full rebuild)
 */
export async function buildIndex(notes: NoteItem[]): Promise<lunr.Index> {
  logger.info('[Indexer] Building full index for', notes.length, 'notes');

  const startTime = Date.now();

  const idx = lunr(function (this: lunr.Builder) {
    this.ref('id');
    this.field('title', { boost: 10 });
    this.field('content', { boost: 5 });
    this.field('tags');
    this.field('category');

    notes.forEach((n: NoteItem) => {
      this.add({
        id: n.id,
        title: n.title,
        content: n.content,
        tags: n.tags.join(' '),
        category: n.category,
      });
    });
  });

  // Compute vectors and sentiments
  const vectors: Record<string, Vector> = {};
  const sentiments: Record<string, { score: number; comparative: number }> = {};
  const noteHashes: Record<string, number> = {};

  notes.forEach((n: NoteItem) => {
    const text = `${n.title} ${n.content}`;
    vectors[n.id] = vector.computeVector(text);
    sentiments[n.id] = sentiment.analyzeEmotion(text);
    noteHashes[n.id] = n.updatedAt;
  });

  // Save to IndexedDB
  await Promise.all([
    safeAsync(() => IDB.setItem(INDEX_KEY, idx.toJSON()), null),
    safeAsync(() => IDB.setItem(VECTOR_KEY, vectors), null),
    safeAsync(() => IDB.setItem(SENTIMENT_KEY, sentiments), null),
  ]);

  // Update metadata
  const metadata: IndexMetadata = {
    version: 1,
    lastUpdateTime: Date.now(),
    totalNotes: notes.length,
    indexedNotes: new Set(notes.map((n) => n.id)),
  };
  await saveIndexMetadata(metadata);

  // Update cache
  cachedIndex = idx;
  cachedVectors = vectors;
  cachedSentiments = sentiments;
  cachedMetadata = metadata;
  indexDirty = false;

  const duration = Date.now() - startTime;
  logger.info(`[Indexer] Full index built in ${duration}ms`);

  return idx;
}

/**
 * Update index incrementally (only changed notes)
 * More efficient for large datasets with small updates
 */
export async function updateIndexIncremental(
  notes: NoteItem[],
  previousIndex?: lunr.Index,
): Promise<lunr.Index> {
  logger.info('[Indexer] Updating index incrementally for', notes.length, 'notes');

  const startTime = Date.now();
  const metadata = await getIndexMetadata();
  const noteHashes: Record<string, number> = {};

  // Get only changed notes
  const changedNotes = notes.filter((note) => {
    const previousHash = metadata.indexedNotes.has(note.id) ? note.updatedAt : undefined;
    noteHashes[note.id] = note.updatedAt;
    return previousHash === undefined || previousHash !== note.updatedAt;
  });

  logger.info(`[Indexer] ${changedNotes.length} notes changed`);

  // If too many changes, do full rebuild
  if (changedNotes.length > notes.length * 0.3) {
    logger.info('[Indexer] Too many changes (>30%), doing full rebuild');
    return buildIndex(notes);
  }

  // Load existing index
  let idx = previousIndex || cachedIndex;
  if (!idx) {
    const indexData = await safeAsync(
      () => IDB.getItem<Record<string, unknown>>(INDEX_KEY),
      null,
      '[Indexer] Failed to load existing index',
    );

    if (indexData) {
      idx = lunr.Index.load(indexData);
    } else {
      logger.info('[Indexer] No existing index found, doing full rebuild');
      return buildIndex(notes);
    }
  }

  // Update vectors and sentiments for changed notes
  const vectors = cachedVectors || {};
  const sentiments = cachedSentiments || {};

  for (const note of changedNotes) {
    const text = `${note.title} ${note.content}`;
    vectors[note.id] = vector.computeVector(text);
    sentiments[note.id] = sentiment.analyzeEmotion(text);
  }

  // Save updated vectors and sentiments
  await Promise.all([
    safeAsync(() => IDB.setItem(VECTOR_KEY, vectors), null),
    safeAsync(() => IDB.setItem(SENTIMENT_KEY, sentiments), null),
  ]);

  // Update metadata
  metadata.lastUpdateTime = Date.now();
  metadata.totalNotes = notes.length;
  metadata.indexedNotes = new Set(notes.map((n) => n.id));
  await saveIndexMetadata(metadata);

  // Update cache
  cachedVectors = vectors;
  cachedSentiments = sentiments;
  cachedMetadata = metadata;
  indexDirty = false;

  const duration = Date.now() - startTime;
  logger.info(`[Indexer] Index updated incrementally in ${duration}ms`);

  return idx;
}

/**
 * Load existing index from IndexedDB
 */
export async function loadIndex(): Promise<lunr.Index | null> {
  try {
    if (cachedIndex) {
      return cachedIndex;
    }

    const data = await safeAsync(
      () => IDB.getItem<Record<string, unknown>>(INDEX_KEY),
      null,
      '[Indexer] Failed to load index',
    );

    if (data) {
      cachedIndex = lunr.Index.load(data);
      return cachedIndex;
    }

    return null;
  } catch (error) {
    logger.error('[Indexer] Error loading index', { error });
    return null;
  }
}

/**
 * Load cached vectors
 */
export async function loadVectors(): Promise<Record<string, Vector>> {
  if (Object.keys(cachedVectors).length > 0) {
    return cachedVectors;
  }

  const vectors = await safeAsync(
    () => IDB.getItem<Record<string, Vector>>(VECTOR_KEY),
    {},
    '[Indexer] Failed to load vectors',
  );

  cachedVectors = vectors || {};
  return cachedVectors;
}

/**
 * Load cached sentiments
 */
export async function loadSentiments(): Promise<
  Record<string, { score: number; comparative: number }>
> {
  if (Object.keys(cachedSentiments).length > 0) {
    return cachedSentiments;
  }

  const sentiments = await safeAsync(
    () => IDB.getItem<Record<string, { score: number; comparative: number }>>(SENTIMENT_KEY),
    {},
    '[Indexer] Failed to load sentiments',
  );

  cachedSentiments = sentiments || {};
  return cachedSentiments;
}

/**
 * Clear all index caches
 */
export async function clearIndexCache(): Promise<void> {
  cachedIndex = null;
  cachedVectors = {};
  cachedSentiments = {};
  cachedMetadata = null;
  indexDirty = true;

  await Promise.all([
    safeAsync(() => IDB.setItem(INDEX_KEY, null), null),
    safeAsync(() => IDB.setItem(VECTOR_KEY, null), null),
    safeAsync(() => IDB.setItem(SENTIMENT_KEY, null), null),
    safeAsync(() => IDB.setItem(INDEX_METADATA_KEY, null), null),
  ]);

  logger.info('[Indexer] Index cache cleared');
}

/**
 * Get index statistics
 */
export function getIndexStats() {
  return {
    cached: !!cachedIndex,
    vectorsCount: Object.keys(cachedVectors).length,
    sentimentsCount: Object.keys(cachedSentiments).length,
    dirty: indexDirty,
  };
}

const indexerExports = {
  buildIndex,
  updateIndexIncremental,
  loadIndex,
  loadVectors,
  loadSentiments,
  clearIndexCache,
  getIndexStats,
};

export default indexerExports;

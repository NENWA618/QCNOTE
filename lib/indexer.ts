import lunr from 'lunr';
import IDB from './idb';
import { NoteItem } from './storage';
import vector, { Vector } from './vector';
import sentiment from './sentiment';
import { embedTexts, cosineSimilarity } from './embeddings';

const INDEX_KEY = 'QCNOTE_LUNR_INDEX';
const VECTOR_KEY = 'QCNOTE_VECTORS';
const SENTIMENT_KEY = 'QCNOTE_SENTIMENTS';
const NOTES_HASH_KEY = 'QCNOTE_HASH'; // Track notes hash to detect changes
const SEMANTIC_EMBEDDING_KEY = 'QCNOTE_SEMANTIC_EMBEDDINGS';
const SEMANTIC_MATCH_THRESHOLD = 0.5;

interface SemanticEmbeddingCacheEntry {
  updatedAt: number;
  vector: number[];
}

type SemanticEmbeddingCache = Record<string, SemanticEmbeddingCacheEntry>;

// Cache state for performance
let cachedIndex: lunr.Index | null = null;
let cachedVectors: Record<string, Vector> | null = null;
let cachedSentiments: Record<string, { score: number; comparative: number }> | null = null;
let cachedNotesHash: string | null = null;
let indexDirty = true; // Flag to track if index needs rebuild

/**
 * Compute a simple hash of notes to detect changes
 * @param notes Array of notes to hash
 */
function computeNotesHash(notes: NoteItem[]): string {
  const notesStr = notes.map((n) => `${n.id}:${n.updatedAt}`).join('|');
  return notesStr; // Simple hash - could use crypto for production
}

/**
 * Check if notes have changed since last index build
 */
function isIndexDirty(notes: NoteItem[], currentHash: string): boolean {
  return currentHash !== cachedNotesHash;
}

// build index from a list of notes
export async function buildIndex(notes: NoteItem[]): Promise<lunr.Index> {
  const notesHash = computeNotesHash(notes);

  // Check if index is already cached and valid
  if (
    !indexDirty &&
    cachedIndex &&
    cachedVectors &&
    cachedSentiments &&
    cachedNotesHash === notesHash
  ) {
    return cachedIndex;
  }

  const idx = lunr(function (this: lunr.Builder) {
    this.ref('id');
    this.field('title');
    this.field('content');

    notes.forEach((n: NoteItem) => {
      this.add({ id: n.id, title: n.title, content: n.content });
    });
  });

  try {
    await IDB.setItem(INDEX_KEY, idx.toJSON());
  } catch (e) {
    console.warn('unable to save search index', e);
  }

  // compute vectors and sentiment for each note
  const vectors: Record<string, Vector> = {};
  const sentiments: Record<string, { score: number; comparative: number }> = {};
  notes.forEach((n: NoteItem) => {
    const text = `${n.title} ${n.content}`;
    vectors[n.id] = vector.computeVector(text);
    sentiments[n.id] = sentiment.analyzeEmotion(text);
  });
  try {
    await IDB.setItem(VECTOR_KEY, vectors);
    await IDB.setItem(SENTIMENT_KEY, sentiments);
    await IDB.setItem(NOTES_HASH_KEY, notesHash);
  } catch (e) {
    console.warn('unable to save vector/sentiment data', e);
  }

  // Update cache
  cachedIndex = idx;
  cachedVectors = vectors;
  cachedSentiments = sentiments;
  cachedNotesHash = notesHash;
  indexDirty = false;

  return idx;
}

// load existing index from IndexedDB, or null if not found
export async function loadIndex(): Promise<lunr.Index | null> {
  try {
    const data = await IDB.getItem<Record<string, unknown>>(INDEX_KEY);
    if (data) {
      return lunr.Index.load(data);
    }
  } catch (e) {
    console.warn('error loading search index', e);
  }
  return null;
}

/**
 * Mark index as dirty - call this when notes are modified
 */
export function invalidateIndex(): void {
  indexDirty = true;
  cachedIndex = null;
  cachedVectors = null;
  cachedSentiments = null;
  cachedNotesHash = null;
}

/**
 * Preload cache from IndexedDB
 */
export async function preloadCache(): Promise<void> {
  try {
    const idx = await loadIndex();
    const vectors = await IDB.getItem<Record<string, Vector>>(VECTOR_KEY);
    const sentiments =
      await IDB.getItem<Record<string, { score: number; comparative: number }>>(SENTIMENT_KEY);
    const hash = await IDB.getItem<string>(NOTES_HASH_KEY);

    if (idx) cachedIndex = idx;
    if (vectors) cachedVectors = vectors;
    if (sentiments) cachedSentiments = sentiments;
    if (hash) cachedNotesHash = hash;
    indexDirty = !idx; // If we loaded an index, it's not dirty
  } catch (e) {
    console.warn('error preloading cache', e);
  }
}

// ensure index exists; if not, build from notes
async function ensureIndex(notes: NoteItem[]) {
  let idx = await loadIndex();
  if (!idx) {
    idx = await buildIndex(notes);
  }
  return idx;
}

// search notes by query string; returns matching note ids in order
export async function searchNotes(query: string, notes: NoteItem[]): Promise<string[]> {
  // Only rebuild index if it's dirty (notes changed)
  const notesHash = computeNotesHash(notes);
  if (isIndexDirty(notes, notesHash)) {
    await buildIndex(notes);
  }

  const idx = cachedIndex || (await buildIndex(notes));
  if (!idx) return [];

  try {
    const results: Array<{ ref: string }> = idx.search(query);
    // perform vector search as well
    const hits = results.map((r) => r.ref as string);
    const vectors = cachedVectors || (await IDB.getItem(VECTOR_KEY)) || {};
    const qvec = vector.computeVector(query);
    const sims: Array<{ id: string; score: number }> = [];
    for (const id in vectors) {
      sims.push({ id, score: vector.cosine(qvec, vectors[id]) });
    }
    sims.sort((a, b) => b.score - a.score);
    for (const s of sims) {
      if (!hits.includes(s.id) && s.score > 0.3) {
        // Increased threshold from 0.1 to 0.3
        hits.push(s.id);
      }
    }
    return hits;
  } catch (e) {
    console.warn('search error', e);
    return [];
  }
}

/**
 * 语义搜索：按笔记缓存 embedding，只对新增/改动过的笔记重新计算。
 * 与旧的 vector.computeVector（词频向量）无关——这里调用的是本地神经网络模型（见 embeddings.ts），
 * 每次推理有实打实的开销，所以缓存是必须的，不是优化项。
 */
export async function getSemanticMatches(query: string, notes: NoteItem[]): Promise<string[]> {
  if (!query.trim() || notes.length === 0) return [];

  const cache = (await IDB.getItem<SemanticEmbeddingCache>(SEMANTIC_EMBEDDING_KEY)) || {};

  const notesNeedingEmbedding = notes.filter((n) => cache[n.id]?.updatedAt !== n.updatedAt);

  if (notesNeedingEmbedding.length > 0) {
    const texts = notesNeedingEmbedding.map((n) => `${n.title} ${n.content}`);
    const vectors = await embedTexts(texts);
    notesNeedingEmbedding.forEach((n, i) => {
      cache[n.id] = { updatedAt: n.updatedAt, vector: vectors[i] };
    });

    // Drop entries for notes that no longer exist to keep the cache from growing unbounded
    const currentIds = new Set(notes.map((n) => n.id));
    for (const id of Object.keys(cache)) {
      if (!currentIds.has(id)) delete cache[id];
    }

    try {
      await IDB.setItem(SEMANTIC_EMBEDDING_KEY, cache);
    } catch (e) {
      console.warn('unable to save semantic embedding cache', e);
    }
  }

  const [queryVector] = await embedTexts([query]);

  const scores = notes
    .map((n) => ({
      id: n.id,
      score: cache[n.id] ? cosineSimilarity(queryVector, cache[n.id].vector) : 0,
    }))
    .filter((s) => s.score > SEMANTIC_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  return scores.map((s) => s.id);
}

const Indexer = {
  buildIndex,
  loadIndex,
  searchNotes,
  invalidateIndex,
  preloadCache,
  getSemanticMatches,
};

export default Indexer;

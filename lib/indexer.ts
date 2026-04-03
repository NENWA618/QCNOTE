import lunr from 'lunr';
import IDB from './idb';
import { NoteItem } from './storage';
import vector, { Vector } from './vector';
import sentiment from './sentiment';

const INDEX_KEY = 'NOTE_LUNR_INDEX';
const VECTOR_KEY = 'NOTE_VECTORS';
const SENTIMENT_KEY = 'NOTE_SENTIMENTS';
const NOTES_HASH_KEY = 'NOTE_HASH'; // Track notes hash to detect changes

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
    const data = await IDB.getItem<any>(INDEX_KEY);
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
    const sentiments = await IDB.getItem<Record<string, { score: number; comparative: number }>>(SENTIMENT_KEY);
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
      if (!hits.includes(s.id) && s.score > 0.1) {
        hits.push(s.id);
      }
    }
    return hits;
  } catch (e) {
    console.warn('search error', e);
    return [];
  }
}

const Indexer = {
  buildIndex,
  loadIndex,
  searchNotes,
  invalidateIndex,
  preloadCache,
};

export default Indexer;
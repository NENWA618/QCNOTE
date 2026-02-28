import lunr from 'lunr';
import IDB from './idb';
import { NoteItem } from './storage';
import vector, { Vector } from './vector';
import sentiment from './sentiment';

const INDEX_KEY = 'NOTE_LUNR_INDEX';
const VECTOR_KEY = 'NOTE_VECTORS';
const SENTIMENT_KEY = 'NOTE_SENTIMENTS';

// build index from a list of notes
export async function buildIndex(notes: NoteItem[]): Promise<lunr.Index> {
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
  } catch (e) {
    console.warn('unable to save vector/sentiment data', e);
  }

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
  // rebuild index each time to keep it in sync with notes
  const idx: lunr.Index = await buildIndex(notes);
  if (!idx) return [];
  try {
    const results: Array<{ ref: string }> = idx.search(query);
    // perform vector search as well
    const hits = results.map((r) => r.ref as string);
    const vectors: Record<string, Vector> = (await IDB.getItem(VECTOR_KEY)) || {};
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
};

export default Indexer;
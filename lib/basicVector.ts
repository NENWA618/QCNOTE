import { NoteItem } from './storage';

// simple bag-of-words vectorizer (term frequency) for semantic search
export function buildVocab(notes: NoteItem[]): string[] {
  const vocabSet = new Set<string>();
  notes.forEach((n) => {
    const txt = `${n.title} ${n.content}`.toLowerCase();
    txt.split(/\W+/).forEach((w) => {
      if (w) vocabSet.add(w);
    });
  });
  return Array.from(vocabSet);
}

export function vectorize(text: string, vocab: string[]): number[] {
  // build a map for quick lookup to avoid O(n) indexOf per token
  const idxMap = new Map<string, number>();
  vocab.forEach((w, i) => idxMap.set(w, i));

  const vec = new Array(vocab.length).fill(0);
  const words = text.toLowerCase().split(/\W+/);
  words.forEach((w) => {
    const idx = idxMap.get(w);
    if (idx !== undefined) vec[idx] += 1;
  });
  return vec;
}

function cosine(v1: number[], v2: number[]): number {
  let dot = 0;
  let n1 = 0;
  let n2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    n1 += v1[i] * v1[i];
    n2 += v2[i] * v2[i];
  }
  if (n1 === 0 || n2 === 0) return 0;
  return dot / (Math.sqrt(n1) * Math.sqrt(n2));
}

export function vectorSearch(query: string, notes: NoteItem[]): string[] {
  if (notes.length === 0) return [];
  const vocab = buildVocab(notes);
  const qv = vectorize(query, vocab);
  const scores: Array<{ id: string; score: number }> = [];
  notes.forEach((n) => {
    const nv = vectorize(`${n.title} ${n.content}`, vocab);
    const sc = cosine(qv, nv);
    scores.push({ id: n.id, score: sc });
  });
  scores.sort((a, b) => b.score - a.score);
  return scores.filter((x) => x.score > 0).map((x) => x.id);
}

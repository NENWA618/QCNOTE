import SentimentUtil from '../sentiment';
import { normalizeNote } from './linkGraph';
import type { NoteItem, NoteVersion, Stats } from './types';

/** How many earlier versions a note keeps. */
const MAX_VERSIONS = 20;

function analyzeSentiment(
  title: string,
  content: string,
): Pick<NoteItem, 'sentimentScore' | 'sentimentComparative' | 'sentimentCategory'> {
  const sentimentData = SentimentUtil.analyzeEmotion(`${title} ${content}`);
  return {
    sentimentScore: sentimentData.score,
    sentimentComparative: sentimentData.comparative,
    sentimentCategory: SentimentUtil.getSentimentCategory(
      sentimentData.score,
      sentimentData.comparative,
    ),
  };
}

function newNoteId(): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `note_${suffix}`;
}

/** A new note from the fields the user filled in, with defaults for the rest. */
export function createNote(note: Partial<NoteItem>): NoteItem {
  const title = note.title || '无标题';
  const content = note.content || '';
  const now = Date.now();
  return {
    id: newNoteId(),
    title,
    content,
    category: note.category || '生活',
    tags: note.tags || [],
    color: note.color || '#dc96b4',
    createdAt: now,
    updatedAt: now,
    links: [],
    backlinks: [],
    versions: [],
    ...analyzeSentiment(title, content),
  };
}

/** `existing` with `updates` applied, its previous state filed under its versions. */
export function applyNoteUpdate(existing: NoteItem, updates: Partial<NoteItem>): NoteItem {
  const version: NoteVersion = {
    versionId: `ver_${Date.now()}`,
    title: existing.title,
    content: existing.content,
    category: existing.category,
    tags: [...existing.tags],
    color: existing.color,
    updatedAt: existing.updatedAt,
  };
  const versions = [...(existing.versions || []), version].slice(-MAX_VERSIONS);

  return {
    ...existing,
    ...updates,
    ...analyzeSentiment(updates.title ?? existing.title, updates.content ?? existing.content),
    updatedAt: Math.max(Date.now(), existing.updatedAt + 1),
    versions,
  };
}

/** `imported` appended to `existing`; an imported note whose id is taken gets a new one. */
export function mergeImportedNotes(existing: NoteItem[], imported: unknown[]): NoteItem[] {
  const existingIds = new Set(existing.map((note) => note.id));
  const normalized = imported.map((note) => {
    const n = normalizeNote(note as NoteItem);
    if (existingIds.has(n.id)) {
      n.id = `${n.id}_imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return n;
  });
  return [...existing, ...normalized];
}

/** Every category in use, including by deleted notes, sorted. */
export function listCategories(notes: NoteItem[]): string[] {
  return Array.from(new Set(notes.map((n) => n.category))).sort();
}

/** Every tag in use, including by deleted notes, sorted. */
export function listTags(notes: NoteItem[]): string[] {
  const tags = new Set<string>();
  notes.forEach((note) => note.tags.forEach((tag) => tags.add(tag)));
  return Array.from(tags).sort();
}

export function computeStats(notes: NoteItem[]): Stats {
  const aliveNotes = notes.filter((n) => !n.isDeleted);
  const categoryStats: Record<string, number> = {};
  listCategories(notes).forEach((cat) => {
    categoryStats[cat] = aliveNotes.filter((n) => n.category === cat).length;
  });
  const today = new Date().toDateString();

  return {
    totalNotes: aliveNotes.length,
    categories: categoryStats,
    totalTags: listTags(notes).length,
    createdToday: aliveNotes.filter((n) => new Date(n.createdAt).toDateString() === today).length,
  };
}

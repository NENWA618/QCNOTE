import type { NoteItem } from './types';

export function parseWikiLinks(text: string): string[] {
  const re = /\[\[([^\]]+)\]\]/g;
  const links = new Set<string>();
  let match;
  while ((match = re.exec(text)) !== null) {
    const label = match[1].trim();
    if (label) links.add(label);
  }
  return Array.from(links);
}

export function normalizeNote(note: NoteItem): NoteItem {
  // Drop the removed favourite / archived flags still present in older data.
  const {
    isFavorite: _isFavorite,
    isArchived: _isArchived,
    ...rest
  } = note as NoteItem & { isFavorite?: unknown; isArchived?: unknown };
  return {
    ...rest,
    links: note.links || [],
    backlinks: note.backlinks || [],
    versions: note.versions || [],
  };
}

/** Recomputes every note's `links` and `backlinks` from `[[title]]` references. */
export function syncLinkGraph(notes: NoteItem[]): NoteItem[] {
  const titleToId = new Map<string, string>();
  notes.forEach((note) => {
    titleToId.set(note.title, note.id);
  });

  const backlinksMap = new Map<string, Set<string>>();

  const enriched = notes.map((note) => {
    const normalizedNote = normalizeNote(note);
    const links = parseWikiLinks(normalizedNote.content);
    links.forEach((linkTitle) => {
      const targetId = titleToId.get(linkTitle);
      if (!targetId) return;
      if (!backlinksMap.has(targetId)) backlinksMap.set(targetId, new Set());
      backlinksMap.get(targetId)?.add(normalizedNote.id);
    });
    return {
      ...normalizedNote,
      links,
    };
  });

  return enriched.map((note) => ({
    ...note,
    backlinks: Array.from(backlinksMap.get(note.id) || []),
  }));
}

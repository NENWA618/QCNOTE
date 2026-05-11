import { describe, it, expect } from 'vitest';
import { buildVocab, vectorize, vectorSearch } from '../lib/basicVector';
import { NoteItem } from '../lib/storage';

describe('basicVector', () => {
  const notes: NoteItem[] = [
    { id: '1', title: 'Hello world', content: 'This is a test note', category: '', tags: [], color: '', isFavorite: false, createdAt: 0, updatedAt: 0, isArchived: false },
    { id: '2', title: 'Another note', content: 'Testing semantic search', category: '', tags: [], color: '', isFavorite: false, createdAt: 0, updatedAt: 0, isArchived: false },
  ];

  it('buildVocab returns a nonempty vocabulary', () => {
    const vocab = buildVocab(notes);
    expect(vocab.length).toBeGreaterThan(0);
    expect(vocab).toContain('hello');
    expect(vocab).toContain('world');
    expect(vocab).toContain('testing');
  });

  it('vectorize produces correct counts', () => {
    const vocab = ['hello', 'world', 'test'];
    const vec = vectorize('Hello test test', vocab);
    expect(vec).toEqual([1, 0, 2]);
  });

  it('vectorSearch finds the most relevant note', () => {
    const hits = vectorSearch('semantic', notes);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toBe('2');
  });
});

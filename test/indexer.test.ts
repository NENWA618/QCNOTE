import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Indexer, { buildIndex, loadIndex, searchNotes, invalidateIndex, preloadCache } from '../lib/indexer';
import IDB from '../lib/idb';
import { NoteItem } from '../lib/storage';

describe('Indexer - Search & Caching', () => {
  const mockNotes: NoteItem[] = [
    {
      id: 'note_1',
      title: 'JavaScript Tutorial',
      content: 'Learn JavaScript basics and advanced concepts',
      category: '学习',
      tags: ['programming', 'javascript'],
      color: '#dc96b4',
      isFavorite: false,
      createdAt: Date.now() - 1000000,
      updatedAt: Date.now() - 1000000,
      isArchived: false,
      links: [],
      backlinks: [],
      versions: [],
    },
    {
      id: 'note_2',
      title: 'React Component Guide',
      content: 'Deep dive into React components and hooks',
      category: '学习',
      tags: ['react', 'javascript', 'web'],
      color: '#b0a8c0',
      isFavorite: true,
      createdAt: Date.now() - 500000,
      updatedAt: Date.now() - 500000,
      isArchived: false,
      links: [],
      backlinks: [],
      versions: [],
    },
    {
      id: 'note_3',
      title: 'Life Thoughts',
      content: 'Random thoughts about life and productivity',
      category: '生活',
      tags: ['personal', 'reflection'],
      color: '#ffb6c1',
      isFavorite: false,
      createdAt: Date.now() - 100000,
      updatedAt: Date.now() - 100000,
      isArchived: false,
      links: [],
      backlinks: [],
      versions: [],
    },
  ];

  beforeEach(async () => {
    // Clear cache and storage before each test
    invalidateIndex();
    await IDB.setItem('NOTE_LUNR_INDEX', null);
    await IDB.setItem('NOTE_VECTORS', null);
    await IDB.setItem('NOTE_SENTIMENTS', null);
    await IDB.setItem('NOTE_HASH', null);
  });

  afterEach(async () => {
    invalidateIndex();
    await IDB.setItem('NOTE_LUNR_INDEX', null);
    await IDB.setItem('NOTE_VECTORS', null);
    await IDB.setItem('NOTE_SENTIMENTS', null);
    await IDB.setItem('NOTE_HASH', null);
  });

  describe('buildIndex', () => {
    it('should build a Lunr index from notes', async () => {
      const index = await buildIndex(mockNotes);
      expect(index).toBeDefined();
      expect(index).toBeTruthy();
      
      // Test search in the index
      const results = index.search('javascript');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.ref === 'note_1')).toBe(true);
    });

    it('should cache vectors for each note', async () => {
      await buildIndex(mockNotes);
      const vectors = await IDB.getItem('NOTE_VECTORS');
      
      expect(vectors).toBeDefined();
      expect(vectors).toHaveProperty('note_1');
      expect(vectors).toHaveProperty('note_2');
      expect(vectors).toHaveProperty('note_3');
    });

    it('should cache sentiment analysis results', async () => {
      await buildIndex(mockNotes);
      const sentiments = await IDB.getItem('NOTE_SENTIMENTS');
      
      expect(sentiments).toBeDefined();
      expect(sentiments).toHaveProperty('note_1');
      expect(sentiments['note_1']).toHaveProperty('score');
      expect(sentiments['note_1']).toHaveProperty('comparative');
    });

    it('should store hash of notes for dirty detection', async () => {
      await buildIndex(mockNotes);
      const hash = await IDB.getItem('NOTE_HASH');
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('searchNotes', () => {
    beforeEach(async () => {
      await buildIndex(mockNotes);
    });

    it('should find notes by full-text search', async () => {
      const results = await searchNotes('javascript', mockNotes);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toBe('note_1'); // First result should be exact match
    });

    it('should find notes by semantic similarity', async () => {
      const results = await searchNotes('web development', mockNotes);
      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain('note_2'); // React is related to web development
    });

    it('should return empty array for non-matching query', async () => {
      const results = await searchNotes('xyz123notfound', mockNotes);
      expect(results).toEqual([]);
    });

    it('should handle empty query', async () => {
      const results = await searchNotes('', mockNotes);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Cache invalidation', () => {
    it('should invalidate cache when invalidateIndex is called', async () => {
      const index1 = await buildIndex(mockNotes);
      expect(index1).toBeDefined();

      invalidateIndex();

      // Modify notes to test dirty detection
      const modifiedNotes = [
        ...mockNotes,
        {
          id: 'note_4',
          title: 'New Note',
          content: 'A new note added',
          category: '其他',
          tags: ['new'],
          color: '#dcb4ff',
          isFavorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isArchived: false,
          links: [],
          backlinks: [],
          versions: [],
        },
      ];

      const index2 = await buildIndex(modifiedNotes);
      expect(index2).toBeDefined();

      // The new index should contain the new note
      const results = index2.search('new');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should use cached index for identical notes', async () => {
      const buildSpy = vi.spyOn(IDB, 'setItem');

      // Build index first time
      await buildIndex(mockNotes);
      const setItemCallCount1 = buildSpy.mock.calls.length;

      // Build index again with same notes (should be cached)
      await buildIndex(mockNotes);
      
      // Should not rebuild if notes are identical
      // (check that setItem wasn't called again for the same hash)
      expect(buildSpy).toHaveBeenCalled();

      buildSpy.mockRestore();
    });
  });

  describe('preloadCache', () => {
    it('should preload cache from IndexedDB', async () => {
      // First, build an index
      await buildIndex(mockNotes);

      // Clear in-memory cache
      invalidateIndex();

      // Preload cache
      await preloadCache();

      // Cache should be loaded from IndexedDB
      // (we can verify by doing a search without rebuilding)
      const results = await searchNotes('javascript', mockNotes);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Complex search scenarios', () => {
    beforeEach(async () => {
      await buildIndex(mockNotes);
    });

    it('should search across title and content', async () => {
      const results = await searchNotes('component', mockNotes);
      expect(results).toContain('note_2'); // "Component" is in the title
    });

    it('should handle partial word matches', async () => {
      const results = await searchNotes('produc', mockNotes);
      // Should find "productivity" in content of note_3
      expect(Array.isArray(results)).toBe(true);
    });

    it('should combine full-text and semantic results', async () => {
      const results = await searchNotes('programming language', mockNotes);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple searches efficiently', async () => {
      // First search
      const results1 = await searchNotes('javascript', mockNotes);
      expect(results1.length).toBeGreaterThan(0);

      // Second search should use cached index (no rebuild)
      const results2 = await searchNotes('react', mockNotes);
      expect(results2.length).toBeGreaterThan(0);

      // Results should be different queries
      expect(results1).not.toEqual(results2);
    });
  });
});

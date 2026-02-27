import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoteStorage, type NoteItem } from '../lib/storage';

describe('NoteStorage', () => {
  let storage: NoteStorage;

  beforeEach(async () => {
    // Clear localStorage before each test
    localStorage.clear();
    storage = new NoteStorage();
    // ensure storage init completed
    await storage.getDataAsync();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('addNote', () => {
    it('should create a new note with default values', async () => {
      const note = await storage.addNoteAsync({ title: 'Test Note', content: 'Test content' });
      expect(note.title).toBe('Test Note');
      expect(note.content).toBe('Test content');
      expect(note.category).toBe('生活');
      expect(note.isFavorite).toBe(false);
      expect(note.tags).toEqual([]);
    });

    it('should include createdAt and updatedAt timestamps', async () => {
      const note = await storage.addNoteAsync({ title: 'Test' });
      expect(note.createdAt).toBeGreaterThan(0);
      expect(note.updatedAt).toEqual(note.createdAt);
    });

    it('should persist note to localStorage', async () => {
      await storage.addNoteAsync({ title: 'Test' });
      const data = await storage.getDataAsync();
      expect(data).toHaveLength(1);
      expect(data?.[0].title).toBe('Test');
    });
  });

  describe('updateNote', () => {
    it('should update note properties', async () => {
      const note = await storage.addNoteAsync({ title: 'Original' });
      const updated = await storage.updateNoteAsync(note.id, { title: 'Updated' });
      expect(updated?.title).toBe('Updated');
      expect(updated?.updatedAt).toBeGreaterThan(note.updatedAt);
    });

    it('should return null for non-existent note', async () => {
      const result = await storage.updateNoteAsync('non-existent-id', { title: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('deleteNote', () => {
    it('should remove note from storage', async () => {
      const note = await storage.addNoteAsync({ title: 'To Delete' });
      await storage.deleteNoteAsync(note.id);
      const data = await storage.getDataAsync();
      expect(data).toHaveLength(0);
    });
  });

  describe('getNote', () => {
    it('should retrieve note by ID', async () => {
      const created = await storage.addNoteAsync({ title: 'Test' });
      const retrieved = await storage.getNoteAsync(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent ID', async () => {
      const result = await storage.getNoteAsync('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('searchNotes', () => {
    beforeEach(async () => {
      await storage.addNoteAsync({ title: 'JavaScript Basics', content: 'Learn JS' });
      await storage.addNoteAsync({ title: 'Python Guide', content: 'Learn Python basics' });
      await storage.addNoteAsync({ title: 'Web Development', content: 'HTML, CSS, JavaScript' });
    });

    it('should find notes by title', async () => {
      const results = await storage.searchNotesAsync('JavaScript');
      expect(results).toHaveLength(2);
      expect(results.some(n => n.title.includes('JavaScript'))).toBe(true);
    });

    it('should find notes by content', async () => {
      const results = await storage.searchNotesAsync('basics');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return all notes if keyword is empty', async () => {
      const results = await storage.searchNotesAsync('');
      expect(results).toHaveLength(3);
    });

    it('should be case-insensitive', async () => {
      const results = await storage.searchNotesAsync('JAVASCRIPT');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getNotesByCategory', () => {
    beforeEach(async () => {
      await storage.addNoteAsync({ title: 'Work Task', category: '工作' });
      await storage.addNoteAsync({ title: 'Study Material', category: '学习' });
      await storage.addNoteAsync({ title: 'Life Event', category: '生活' });
    });

    it('should filter notes by category', async () => {
      const results = await storage.getNotesByCategoryAsync('工作');
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe('工作');
    });

    it('should return all notes for "all" category', async () => {
      const results = await storage.getNotesByCategoryAsync('all');
      expect(results).toHaveLength(3);
    });
  });

  describe('toggleFavorite', () => {
    it('should toggle favorite status', () => {
      const note = await storage.addNoteAsync({ title: 'Test' });
      expect(note.isFavorite).toBe(false);

      const toggled1 = await storage.toggleFavoriteAsync(note.id);
      expect(toggled1).toBe(true);

      const toggled2 = await storage.toggleFavoriteAsync(note.id);
      expect(toggled2).toBe(false);
    });

    it('should persist toggle to storage', () => {
      const note = await storage.addNoteAsync({ title: 'Test' });
      await storage.toggleFavoriteAsync(note.id);
      const retrieved = await storage.getNoteAsync(note.id);
      expect(retrieved?.isFavorite).toBe(true);
    });
  });

  describe('getCategories', () => {
    beforeEach(async () => {
      await storage.addNoteAsync({ title: 'Work', category: '工作' });
      await storage.addNoteAsync({ title: 'Study', category: '学习' });
      await storage.addNoteAsync({ title: 'Work 2', category: '工作' });
    });

    it('should return unique categories sorted', async () => {
      const categories = await storage.getCategoriesAsync();
      expect(categories).toContain('工作');
      expect(categories).toContain('学习');
      expect(categories.length).toBe(2);
    });
  });

  describe('getAllTags', () => {
    beforeEach(async () => {
      await storage.addNoteAsync({ title: 'Note1', tags: ['js', 'web'] });
      await storage.addNoteAsync({ title: 'Note2', tags: ['python', 'web'] });
    });

    it('should return all unique tags sorted', async () => {
      const tags = await storage.getAllTagsAsync();
      expect(tags).toContain('js');
      expect(tags).toContain('web');
      expect(tags).toContain('python');
      expect(tags.length).toBe(3);
    });
  });

  describe('getFavoriteNotes', () => {
    beforeEach(async () => {
      const note1 = await storage.addNoteAsync({ title: 'Fav1' });
      const note2 = await storage.addNoteAsync({ title: 'Normal' });
      await storage.toggleFavoriteAsync(note1.id);
    });

    it('should return only favorite notes', async () => {
      const favorites = await storage.getFavoriteNotesAsync();
      expect(favorites).toHaveLength(1);
      expect(favorites[0].isFavorite).toBe(true);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await storage.addNoteAsync({ title: 'Work1', category: '工作' });
      await storage.addNoteAsync({ title: 'Study1', category: '学习' });
      const fav = await storage.addNoteAsync({ title: 'Fav', category: '生活' });
      await storage.toggleFavoriteAsync(fav.id);
    });

    it('should calculate correct statistics', async () => {
      const stats = await storage.getStatsAsync();
      expect(stats.totalNotes).toBe(3);
      expect(stats.favoriteNotes).toBe(1);
      expect(stats.categories['工作']).toBe(1);
      expect(stats.categories['学习']).toBe(1);
      expect(stats.categories['生活']).toBe(1);
    });

    it('should count created today correctly', async () => {
      const stats = await storage.getStatsAsync();
      // All notes created today
      expect(stats.createdToday).toEqual(stats.totalNotes);
    });
  });

  describe('Settings', () => {
    it('should initialize default settings', () => {
      const settings = await storage.getSettingsAsync();
      expect(settings?.theme).toBe('light');
      expect(settings?.sortBy).toBe('date');
      expect(settings?.itemsPerPage).toBe(12);
      expect(settings?.defaultCategory).toBe('生活');
    });

    it('should update settings', () => {
      await storage.setSettingsAsync({
        theme: 'dark',
        sortBy: 'title',
        itemsPerPage: 20,
        defaultCategory: '工作',
      });
      const updated = await storage.getSettingsAsync();
      expect(updated?.theme).toBe('dark');
      expect(updated?.itemsPerPage).toBe(20);
    });
  });

  describe('Data persistence', () => {
    it('should persist and restore notes', () => {
      await storage.addNoteAsync({ title: 'Persist Test' });
      const storage2 = new NoteStorage();
      const data = await storage2.getDataAsync();
      expect(data).toHaveLength(1);
      expect(data?.[0].title).toBe('Persist Test');
    });

    it('should initialize empty storage if none exists', () => {
      localStorage.clear();
      const newStorage = new NoteStorage();
      const data = await newStorage.getDataAsync();
      expect(data).toEqual([]);
    });
  });
});

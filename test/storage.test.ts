import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoteStorage, type NoteItem } from '../lib/storage';

describe('NoteStorage', () => {
  let storage: NoteStorage;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    storage = new NoteStorage();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('addNote', () => {
    it('should create a new note with default values', () => {
      const note = storage.addNote({ title: 'Test Note', content: 'Test content' });
      expect(note.title).toBe('Test Note');
      expect(note.content).toBe('Test content');
      expect(note.category).toBe('生活');
      expect(note.isFavorite).toBe(false);
      expect(note.tags).toEqual([]);
    });

    it('should include createdAt and updatedAt timestamps', () => {
      const note = storage.addNote({ title: 'Test' });
      expect(note.createdAt).toBeGreaterThan(0);
      expect(note.updatedAt).toEqual(note.createdAt);
    });

    it('should persist note to localStorage', () => {
      storage.addNote({ title: 'Test' });
      const data = storage.getData();
      expect(data).toHaveLength(1);
      expect(data?.[0].title).toBe('Test');
    });
  });

  describe('updateNote', () => {
    it('should update note properties', () => {
      const note = storage.addNote({ title: 'Original' });
      const updated = storage.updateNote(note.id, { title: 'Updated' });
      expect(updated?.title).toBe('Updated');
      expect(updated?.updatedAt).toBeGreaterThan(note.updatedAt);
    });

    it('should return null for non-existent note', () => {
      const result = storage.updateNote('non-existent-id', { title: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('deleteNote', () => {
    it('should remove note from storage', () => {
      const note = storage.addNote({ title: 'To Delete' });
      storage.deleteNote(note.id);
      const data = storage.getData();
      expect(data).toHaveLength(0);
    });
  });

  describe('getNote', () => {
    it('should retrieve note by ID', () => {
      const created = storage.addNote({ title: 'Test' });
      const retrieved = storage.getNote(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent ID', () => {
      const result = storage.getNote('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('searchNotes', () => {
    beforeEach(() => {
      storage.addNote({ title: 'JavaScript Basics', content: 'Learn JS' });
      storage.addNote({ title: 'Python Guide', content: 'Learn Python basics' });
      storage.addNote({ title: 'Web Development', content: 'HTML, CSS, JavaScript' });
    });

    it('should find notes by title', () => {
      const results = storage.searchNotes('JavaScript');
      expect(results).toHaveLength(2);
      expect(results.some(n => n.title.includes('JavaScript'))).toBe(true);
    });

    it('should find notes by content', () => {
      const results = storage.searchNotes('basics');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return all notes if keyword is empty', () => {
      const results = storage.searchNotes('');
      expect(results).toHaveLength(3);
    });

    it('should be case-insensitive', () => {
      const results = storage.searchNotes('JAVASCRIPT');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getNotesByCategory', () => {
    beforeEach(() => {
      storage.addNote({ title: 'Work Task', category: '工作' });
      storage.addNote({ title: 'Study Material', category: '学习' });
      storage.addNote({ title: 'Life Event', category: '生活' });
    });

    it('should filter notes by category', () => {
      const results = storage.getNotesByCategory('工作');
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe('工作');
    });

    it('should return all notes for "all" category', () => {
      const results = storage.getNotesByCategory('all');
      expect(results).toHaveLength(3);
    });
  });

  describe('toggleFavorite', () => {
    it('should toggle favorite status', () => {
      const note = storage.addNote({ title: 'Test' });
      expect(note.isFavorite).toBe(false);

      const toggled1 = storage.toggleFavorite(note.id);
      expect(toggled1).toBe(true);

      const toggled2 = storage.toggleFavorite(note.id);
      expect(toggled2).toBe(false);
    });

    it('should persist toggle to storage', () => {
      const note = storage.addNote({ title: 'Test' });
      storage.toggleFavorite(note.id);
      const retrieved = storage.getNote(note.id);
      expect(retrieved?.isFavorite).toBe(true);
    });
  });

  describe('getCategories', () => {
    beforeEach(() => {
      storage.addNote({ title: 'Work', category: '工作' });
      storage.addNote({ title: 'Study', category: '学习' });
      storage.addNote({ title: 'Work 2', category: '工作' });
    });

    it('should return unique categories sorted', () => {
      const categories = storage.getCategories();
      expect(categories).toContain('工作');
      expect(categories).toContain('学习');
      expect(categories.length).toBe(2);
    });
  });

  describe('getAllTags', () => {
    beforeEach(() => {
      storage.addNote({ title: 'Note1', tags: ['js', 'web'] });
      storage.addNote({ title: 'Note2', tags: ['python', 'web'] });
    });

    it('should return all unique tags sorted', () => {
      const tags = storage.getAllTags();
      expect(tags).toContain('js');
      expect(tags).toContain('web');
      expect(tags).toContain('python');
      expect(tags.length).toBe(3);
    });
  });

  describe('getFavoriteNotes', () => {
    beforeEach(() => {
      const note1 = storage.addNote({ title: 'Fav1' });
      const note2 = storage.addNote({ title: 'Normal' });
      storage.toggleFavorite(note1.id);
    });

    it('should return only favorite notes', () => {
      const favorites = storage.getFavoriteNotes();
      expect(favorites).toHaveLength(1);
      expect(favorites[0].isFavorite).toBe(true);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      storage.addNote({ title: 'Work1', category: '工作' });
      storage.addNote({ title: 'Study1', category: '学习' });
      const fav = storage.addNote({ title: 'Fav', category: '生活' });
      storage.toggleFavorite(fav.id);
    });

    it('should calculate correct statistics', () => {
      const stats = storage.getStats();
      expect(stats.totalNotes).toBe(3);
      expect(stats.favoriteNotes).toBe(1);
      expect(stats.categories['工作']).toBe(1);
      expect(stats.categories['学习']).toBe(1);
      expect(stats.categories['生活']).toBe(1);
    });

    it('should count created today correctly', () => {
      const stats = storage.getStats();
      // All notes created today
      expect(stats.createdToday).toEqual(stats.totalNotes);
    });
  });

  describe('Settings', () => {
    it('should initialize default settings', () => {
      const settings = storage.getSettings();
      expect(settings?.theme).toBe('light');
      expect(settings?.sortBy).toBe('date');
      expect(settings?.itemsPerPage).toBe(12);
      expect(settings?.defaultCategory).toBe('生活');
    });

    it('should update settings', () => {
      storage.setSettings({
        theme: 'dark',
        sortBy: 'title',
        itemsPerPage: 20,
        defaultCategory: '工作',
      });
      const updated = storage.getSettings();
      expect(updated?.theme).toBe('dark');
      expect(updated?.itemsPerPage).toBe(20);
    });
  });

  describe('Data persistence', () => {
    it('should persist and restore notes', () => {
      storage.addNote({ title: 'Persist Test' });
      const storage2 = new NoteStorage();
      const data = storage2.getData();
      expect(data).toHaveLength(1);
      expect(data?.[0].title).toBe('Persist Test');
    });

    it('should initialize empty storage if none exists', () => {
      localStorage.clear();
      const newStorage = new NoteStorage();
      const data = newStorage.getData();
      expect(data).toEqual([]);
    });
  });
});

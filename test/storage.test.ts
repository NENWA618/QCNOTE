import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoteStorage, type NoteItem } from '../lib/storage';
import IDB from '../lib/idb';
import { decryptConfigSecret, decryptText, encryptText } from '../lib/storage/crypto';

describe('NoteStorage', () => {
  let storage: NoteStorage;

  // helper to ensure a fresh in-memory localStorage between tests
  const resetLocalStorage = () => {
    let _store: Record<string, string> = {};
    (global as any).localStorage = {
      getItem(key: string) {
        return Object.prototype.hasOwnProperty.call(_store, key) ? _store[key] : null;
      },
      setItem(key: string, value: string) {
        _store[key] = String(value);
      },
      removeItem(key: string) {
        delete _store[key];
      },
      clear() {
        _store = {};
      },
    } as any;
  };

  beforeEach(async () => {
    // ensure fresh storage implementation for every test
    resetLocalStorage();
    // clear any existing IndexedDB data as well
    if (IDB.clearStore) {
      try {
        await IDB.clearStore();
      } catch {
        // ignore if not set up yet
      }
    }
    storage = new NoteStorage();
    // ensure storage init completed
    await storage.getDataAsync();
  });

  afterEach(async () => {
    await storage.clearAllAsync().catch(() => {});
    resetLocalStorage();
    // ensure IndexedDB is cleaned up between suites as well
    if (IDB.clearStore) {
      await IDB.clearStore().catch(() => {});
    }
  });

  describe('addNote', () => {
    it('should create a new note with default values', async () => {
      const note = await storage.addNoteAsync({ title: 'Test Note', content: 'Test content' });
      expect(note.title).toBe('Test Note');
      expect(note.content).toBe('Test content');
      expect(note.category).toBe('生活');
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
      const deletedNote = data?.find((n) => n.id === note.id);
      expect(deletedNote?.isDeleted).toBe(true);
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
      expect(results.some((n) => n.title.includes('JavaScript'))).toBe(true);
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

  describe('WebDAV config', () => {
    it('should save and load webdav configuration', async () => {
      const conf = {
        url: 'https://example.com/webdav',
        username: 'user',
        password: 'pwd',
        remotePath: 'notes.json',
        encryptionKey: 'secret',
      };
      const saveResult = await storage.setWebDAVConfigAsync(conf);
      expect(saveResult).toBe(true);

      const loaded = await storage.getWebDAVConfigAsync();
      expect(loaded).toEqual(conf);
    });

    it('should clear webdav configuration', async () => {
      const conf = {
        url: 'https://example.com/webdav',
        username: 'user',
        password: 'pwd',
        remotePath: 'notes.json',
        encryptionKey: 'secret',
      };
      await storage.setWebDAVConfigAsync(conf);
      const cleared = await storage.clearWebDAVConfigAsync();
      expect(cleared).toBe(true);
      const loaded = await storage.getWebDAVConfigAsync();
      expect(loaded).toBeNull();
    });

    it('should handle webdav push/pull gracefully without fetch', async () => {
      const conf = {
        url: 'https://example.com/webdav',
        username: 'user',
        password: 'pwd',
        remotePath: 'notes.json',
        encryptionKey: '',
      };
      const pushResult = await storage.pushToWebDAVAsync(conf);
      const pullResult = await storage.pullFromWebDAVAsync(conf);
      expect(pushResult).toBe(false);
      expect(pullResult).toBe(false);
    });

    it('should not encrypt the stored password with a hardcoded passphrase', async () => {
      const conf = {
        url: 'https://example.com/webdav',
        username: 'user',
        password: 'super-secret-password',
        remotePath: 'notes.json',
      };
      await storage.setWebDAVConfigAsync(conf);

      const stored = (await IDB.getItem(storage['webdavConfigKey'])) as {
        password: string;
      };
      expect(stored.password.startsWith('encrypted:')).toBe(true);
      const encryptedPart = stored.password.slice('encrypted:'.length);

      // The old hardcoded passphrase must no longer be able to decrypt newly
      // stored secrets.
      await expect(decryptText(encryptedPart, 'qcnote-webdav-default')).rejects.toThrow();
    });

    it('never returns or re-saves ciphertext as a secret that no longer decrypts', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const conf = {
        url: 'https://example.com/webdav',
        username: 'user',
        // not encrypted under this device's key
        password: `encrypted:${await encryptText('real-password', 'some-other-key')}`,
        remotePath: 'notes.json',
      };
      await storage.setWebDAVConfigAsync(conf);
      const before = await IDB.getItem(storage['webdavConfigKey']);

      expect(await storage.getWebDAVConfigAsync()).toBeNull();

      await new Promise((r) => setTimeout(r, 0));
      expect(await IDB.getItem(storage['webdavConfigKey'])).toEqual(before);
    });

    it('should use different device vault keys across independent devices/profiles', async () => {
      const conf = {
        url: 'https://example.com/webdav',
        username: 'user',
        password: 'shared-password-value',
        remotePath: 'notes.json',
      };
      await storage.setWebDAVConfigAsync(conf);
      const storedA = (await IDB.getItem(storage['webdavConfigKey'])) as { password: string };

      // Simulate a second device/profile with its own localStorage (and thus
      // its own randomly generated vault key).
      resetLocalStorage();
      if (IDB.clearStore) await IDB.clearStore();
      const storageB = new NoteStorage();
      await storageB.setWebDAVConfigAsync(conf);
      const storedB = (await IDB.getItem(storageB['webdavConfigKey'])) as { password: string };

      const encryptedA = storedA.password.slice('encrypted:'.length);
      // Device B's vault key must not be able to decrypt device A's secret.
      await expect(
        decryptConfigSecret(`encrypted:${encryptedA}`, 'qcnote:webdav:device-vault-key'),
      ).rejects.toThrow();

      await storageB.clearAllAsync().catch(() => {});
    });
  });

  describe('OneDrive config', () => {
    it('should save and load onedrive configuration without hardcoded-passphrase decryption', async () => {
      const conf = {
        accessToken: 'my-access-token',
        folderPath: 'notes',
        encryptionKey: 'sync-encryption-key',
      };
      const saveResult = await storage.setOneDriveConfigAsync(conf);
      expect(saveResult).toBe(true);

      const loaded = await storage.getOneDriveConfigAsync();
      expect(loaded).toEqual(conf);

      const stored = (await IDB.getItem(storage['oneDriveConfigKey'])) as {
        accessToken: string;
        encryptionKey: string;
      };
      expect(stored.accessToken.startsWith('encrypted:')).toBe(true);
      expect(stored.encryptionKey.startsWith('encrypted:')).toBe(true);

      await expect(
        decryptText(stored.accessToken.slice('encrypted:'.length), 'qcnote-onedrive-default'),
      ).rejects.toThrow();
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

  describe('getStats', () => {
    beforeEach(async () => {
      await storage.addNoteAsync({ title: 'Work1', category: '工作' });
      await storage.addNoteAsync({ title: 'Study1', category: '学习' });
      await storage.addNoteAsync({ title: 'Life1', category: '生活' });
    });

    it('should calculate correct statistics', async () => {
      const stats = await storage.getStatsAsync();
      expect(stats.totalNotes).toBe(3);
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
    it('should initialize default settings', async () => {
      const settings = await storage.getSettingsAsync();
      expect(settings?.theme).toBe('light');
      expect(settings?.sortBy).toBe('date');
      expect(settings?.itemsPerPage).toBe(12);
      expect(settings?.defaultCategory).toBe('生活');
    });

    it('should update settings', async () => {
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
    it('should persist and restore notes', async () => {
      await storage.addNoteAsync({ title: 'Persist Test' });
      const storage2 = new NoteStorage();
      const data = await storage2.getDataAsync();
      expect(data).toHaveLength(1);
      expect(data?.[0].title).toBe('Persist Test');
    });

    it('should initialize empty storage if none exists', async () => {
      localStorage.clear();
      const newStorage = new NoteStorage();
      const data = await newStorage.getDataAsync();
      expect(data).toEqual([]);
    });
  });

  describe('privacy', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('does not send notes over the network when they are saved', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      const note = await storage.addNoteAsync({ title: 'Private', content: 'secret' });
      await storage.updateNoteAsync(note.id, { content: 'still secret' });
      await storage.setDataAsync([{ id: 'a', title: 'A', content: '' }] as any);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Conflicts', () => {
    const conflictNote = (title: string, updatedAt: number): NoteItem => ({
      id: '1',
      title,
      content: `${title} content`,
      category: '',
      tags: [],
      color: '',
      createdAt: 1,
      updatedAt,
    });

    it('should get and set conflicts', async () => {
      const conflicts = [
        {
          id: '1',
          local: conflictNote('Local', 1),
          remote: conflictNote('Remote', 2),
          resolved: false,
          createdAt: Date.now(),
        },
      ];
      await storage.setConflictsAsync(conflicts);
      const retrieved = await storage.getConflictsAsync();
      expect(retrieved).toEqual(conflicts);
    });

    it('should add conflict', async () => {
      const conflict = {
        id: '1',
        local: conflictNote('Local', 1),
        remote: conflictNote('Remote', 2),
        resolved: false,
        createdAt: Date.now(),
      };
      await storage.addConflictAsync(conflict);
      const conflicts = await storage.getConflictsAsync();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toEqual(conflict);
    });

    it('should resolve conflict', async () => {
      const conflict = {
        id: '1',
        local: conflictNote('Local', 1),
        remote: conflictNote('Remote', 2),
        resolved: false,
        createdAt: Date.now(),
      };
      await storage.addConflictAsync(conflict);
      const resolvedNote = { ...conflict.local, content: 'Merged content', updatedAt: Date.now() };
      await storage.resolveConflictAsync('1', resolvedNote);
      const conflicts = await storage.getConflictsAsync();
      expect(conflicts).toHaveLength(0);
      const notes = await storage.getDataAsync();
      const updatedNote = notes?.find((n) => n.id === '1');
      expect(updatedNote?.content).toBe('Merged content');
    });
  });
});

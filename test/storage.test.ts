import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoteStorage, type NoteItem } from '../lib/storage';
import IDB from '../lib/idb';

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
    try {
      await QCRuntime.drop('QCNOTE_NOTES_DB_GUEST');
    } catch {
      // ignore if the guest DB does not exist or drop fails
    }
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

  describe('toggleFavorite', () => {
    it('should toggle favorite status', async () => {
      const note = await storage.addNoteAsync({ title: 'Test' });
      expect(note.isFavorite).toBe(false);

      const toggled1 = await storage.toggleFavoriteAsync(note.id);
      expect(toggled1).toBe(true);

      const toggled2 = await storage.toggleFavoriteAsync(note.id);
      expect(toggled2).toBe(false);
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
      await expect(
        (storage as any).decryptText(encryptedPart, 'qcnote-webdav-default'),
      ).rejects.toThrow();
    });

    it('should decrypt and migrate a config encrypted with the legacy hardcoded passphrase', async () => {
      const legacyEncrypted = await (storage as any).encryptText(
        'legacy-plaintext-password',
        'qcnote-webdav-default',
      );
      const legacyConf = {
        url: 'https://example.com/webdav',
        username: 'user',
        password: `encrypted:${legacyEncrypted}`,
        remotePath: 'notes.json',
      };
      // setWebDAVConfigAsync leaves an already-`encrypted:`-prefixed value
      // untouched, so this simulates a config saved before the migration.
      await storage.setWebDAVConfigAsync(legacyConf);

      const loaded = await storage.getWebDAVConfigAsync();
      expect(loaded?.password).toBe('legacy-plaintext-password');

      // allow the fire-and-forget migration re-save to complete
      await new Promise((r) => setTimeout(r, 0));

      const migrated = (await IDB.getItem(storage['webdavConfigKey'])) as {
        password: string;
      };
      const migratedEncryptedPart = migrated.password.slice('encrypted:'.length);
      // No longer decryptable with the legacy passphrase after migration.
      await expect(
        (storage as any).decryptText(migratedEncryptedPart, 'qcnote-webdav-default'),
      ).rejects.toThrow();

      // A subsequent read still returns the correct plaintext, now using the
      // per-device vault key.
      const reloaded = await storage.getWebDAVConfigAsync();
      expect(reloaded?.password).toBe('legacy-plaintext-password');
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
        (storageB as any).decryptConfigSecret(
          `encrypted:${encryptedA}`,
          'qcnote:webdav:device-vault-key',
          'qcnote-webdav-default',
        ),
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
        (storage as any).decryptText(
          stored.accessToken.slice('encrypted:'.length),
          'qcnote-onedrive-default',
        ),
      ).rejects.toThrow();
    });

    it('should decrypt and migrate a config encrypted with the legacy hardcoded passphrase', async () => {
      const legacyToken = await (storage as any).encryptText(
        'legacy-access-token',
        'qcnote-onedrive-default',
      );
      const legacyConf = {
        accessToken: `encrypted:${legacyToken}`,
        folderPath: 'notes',
      };
      // setOneDriveConfigAsync leaves an already-`encrypted:`-prefixed value
      // untouched, so this simulates a config saved before the migration.
      await storage.setOneDriveConfigAsync(legacyConf);

      const loaded = await storage.getOneDriveConfigAsync();
      expect(loaded?.accessToken).toBe('legacy-access-token');

      await new Promise((r) => setTimeout(r, 0));

      const migrated = (await IDB.getItem(storage['oneDriveConfigKey'])) as {
        accessToken: string;
      };
      await expect(
        (storage as any).decryptText(
          migrated.accessToken.slice('encrypted:'.length),
          'qcnote-onedrive-default',
        ),
      ).rejects.toThrow();
    });
  });

  describe('toggleFavorite', () => {
    it('should persist toggle to storage', async () => {
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

  describe('server sync', () => {
    beforeEach(() => {
      vi.spyOn(global, 'fetch');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should POST to /syncNote when notes are saved', async () => {
      const note = await storage.addNoteAsync({ title: 'SyncTest' });
      // the syncWithServer call is fire-and-forget, so wait a tick
      await new Promise((r) => setTimeout(r, 0));
      expect(global.fetch).toHaveBeenCalled();
      const calledWith = (global.fetch as unknown as vi.Mock).mock.calls[0][0];
      expect(calledWith).toBe('/syncNote');
      const options = (global.fetch as unknown as vi.Mock).mock.calls[0][1];
      expect(options.method).toBe('POST');
      const sent = JSON.parse(options.body);
      expect(sent.title).toBe('SyncTest');
    });

    it('should batch-sync when setDataAsync called with multiple notes', async () => {
      const notes = [
        { id: 'a', title: 'A', content: '' },
        { id: 'b', title: 'B', content: '' },
      ] as any;
      await storage.setDataAsync(notes);
      // give background sync a moment to execute
      await new Promise((r) => setTimeout(r, 0));
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Conflicts', () => {
    it('should get and set conflicts', async () => {
      const conflicts = [
        {
          id: '1',
          local: { id: '1', title: 'Local', content: 'Local content', createdAt: 1, updatedAt: 1 },
          remote: {
            id: '1',
            title: 'Remote',
            content: 'Remote content',
            createdAt: 1,
            updatedAt: 2,
          },
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
        local: { id: '1', title: 'Local', content: 'Local content', createdAt: 1, updatedAt: 1 },
        remote: { id: '1', title: 'Remote', content: 'Remote content', createdAt: 1, updatedAt: 2 },
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
        local: { id: '1', title: 'Local', content: 'Local content', createdAt: 1, updatedAt: 1 },
        remote: { id: '1', title: 'Remote', content: 'Remote content', createdAt: 1, updatedAt: 2 },
        resolved: false,
        createdAt: Date.now(),
      };
      await storage.addConflictAsync(conflict);
      const resolvedNote = { ...conflict.local, content: 'Merged content', updatedAt: Date.now() };
      await storage.resolveConflictAsync('1', resolvedNote);
      const conflicts = await storage.getConflictsAsync();
      expect(conflicts).toHaveLength(0);
      const notes = await storage.getDataAsync();
      const updatedNote = notes.find((n) => n.id === '1');
      expect(updatedNote?.content).toBe('Merged content');
    });
  });
});

// Regression tests for note data integrity: a failed read must never be
// mistaken for "no notes" and written back, a failed write must leave the
// store untouched and be reported, and concurrent saves must not overwrite
// each other.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoteStorage, NoteStorageError, NOTES_DB_RETRY_MS, type NoteItem } from '../lib/storage';
import { QCDb, QCRuntime } from '../qcruntime/qcnote-runtime';
import IDB from '../lib/idb';

const resetLocalStorage = () => {
  let _store: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null),
    setItem: (k: string, v: string) => {
      _store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete _store[k];
    },
    clear: () => {
      _store = {};
    },
  } as any;
};

// base64 of a fixed 32-byte vault key (KEK) returned by the mocked /api/vault/key
const TEST_KEK = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));

const titles = async (s: NoteStorage) => (await s.loadNotesAsync()).map((n) => n.title).sort();

describe('NoteStorage data integrity', () => {
  let storage: NoteStorage;

  beforeEach(async () => {
    resetLocalStorage();
    if (IDB.clearStore) await IDB.clearStore().catch(() => {});
    storage = new NoteStorage();
    await storage.getDataAsync();
    // device-session checks call the backend: report every token as valid
    // and hand out a fixed vault key (KEK), like /api/vault/key would
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, kek: TEST_KEK }),
    } as Response);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await storage.clearAllAsync().catch(() => {});
    resetLocalStorage();
    if (IDB.clearStore) await IDB.clearStore().catch(() => {});
  });

  it('does not wipe notes when a read fails before a save', async () => {
    await storage.addNoteAsync({ title: 'A' });
    await storage.addNoteAsync({ title: 'B' });

    vi.spyOn(QCDb.prototype, 'find').mockRejectedValueOnce(new Error('transient IDB error'));

    await expect(storage.addNoteAsync({ title: 'C' })).rejects.toBeInstanceOf(NoteStorageError);
    expect(await titles(storage)).toEqual(['A', 'B']);
  });

  it('setDataAsync refuses to write when the current notes cannot be read', async () => {
    await storage.addNoteAsync({ title: 'A' });
    vi.spyOn(QCDb.prototype, 'find').mockRejectedValueOnce(new Error('transient IDB error'));

    expect(await storage.setDataAsync([])).toBe(false);
    expect(await titles(storage)).toEqual(['A']);
  });

  it('leaves storage unchanged and reports the error when the write fails', async () => {
    const a = await storage.addNoteAsync({ title: 'A' });
    vi.spyOn(QCDb.prototype, 'bulkWrite').mockRejectedValueOnce(new Error('QuotaExceededError'));

    await expect(storage.updateNoteAsync(a.id, { title: 'A2' })).rejects.toMatchObject({
      kind: 'write',
    });
    expect(await titles(storage)).toEqual(['A']);
  });

  it('only writes the notes that changed', async () => {
    const a = await storage.addNoteAsync({ title: 'A' });
    await storage.addNoteAsync({ title: 'B' });
    const bulkWrite = vi.spyOn(QCDb.prototype, 'bulkWrite');

    await storage.toggleFavoriteAsync(a.id);

    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const [, puts, deletes] = bulkWrite.mock.calls[0];
    expect((puts as { id: string }[]).map((n) => n.id)).toEqual([a.id]);
    expect(deletes).toEqual([]);
  });

  it('serializes concurrent saves in one tab without losing any of them', async () => {
    const a = await storage.addNoteAsync({ title: 'A', content: 'old' });

    await Promise.all([
      storage.updateNoteAsync(a.id, { content: 'new' }),
      storage.toggleFavoriteAsync(a.id),
      storage.addNoteAsync({ title: 'B' }),
      storage.addNoteAsync({ title: 'C' }),
    ]);

    const notes = await storage.loadNotesAsync();
    expect(notes.map((n) => n.title).sort()).toEqual(['A', 'B', 'C']);
    const saved = notes.find((n) => n.id === a.id)!;
    expect(saved.content).toBe('new');
    expect(saved.isFavorite).toBe(true);
  });

  it('does not let a second tab overwrite notes it has not seen', async () => {
    const otherTab = new NoteStorage();
    const a = await storage.addNoteAsync({ title: 'A' });

    await Promise.all([
      storage.addNoteAsync({ title: 'from tab 1' }),
      otherTab.updateNoteAsync(a.id, { content: 'edited in tab 2' }),
    ]);

    const notes = await storage.loadNotesAsync();
    expect(notes.map((n) => n.title).sort()).toEqual(['A', 'from tab 1']);
    expect(notes.find((n) => n.id === a.id)?.content).toBe('edited in tab 2');
  });

  it('updateNotesAsync transforms a fresh read rather than a stale snapshot', async () => {
    const stale = await storage.getDataAsync();
    await storage.addNoteAsync({ title: 'added later', content: '' });

    await storage.updateNotesAsync((notes) => notes.map((n) => ({ ...n, tags: ['t'] })));

    const notes = await storage.loadNotesAsync();
    expect(stale).toHaveLength(0);
    expect(notes.map((n) => [n.title, n.tags])).toEqual([['added later', ['t']]]);
  });

  it('picks up guest notes saved to the fallback store while the notes DB could not open', async () => {
    await storage.addNoteAsync({ title: 'in db' });

    const fallback = new NoteStorage();
    vi.spyOn(QCRuntime, 'open').mockRejectedValueOnce(new Error('IndexedDB blocked'));
    await fallback.addNoteAsync({ title: 'saved to fallback' });
    vi.restoreAllMocks();

    // next page load: the notes DB opens again and must show both
    const reloaded = new NoteStorage();
    expect(await titles(reloaded)).toEqual(['in db', 'saved to fallback']);
    expect(JSON.parse(localStorage.getItem('QCNOTE_STORAGE')!)).toEqual([]);
    // and they are not duplicated by a later load
    expect(await titles(new NoteStorage())).toEqual(['in db', 'saved to fallback']);
  });

  it('does not leave an empty backup behind each time IndexedDB is enabled', async () => {
    localStorage.setItem('QCNOTE_STORAGE', '[]');
    const setItem = vi.spyOn(IDB, 'setItem');
    expect(await new NoteStorage().enableIndexedDB()).toBe(true);
    expect(setItem.mock.calls.map(([key]) => key)).not.toContainEqual(
      expect.stringContaining('_backup_'),
    );
  });

  describe('signed-in user', () => {
    const signIn = async (userId: string) => {
      sessionStorage.setItem(
        'qcnote:deviceSessionToken',
        JSON.stringify({ userId, token: `token-${userId}` }),
      );
      await storage.setCurrentUser(userId);
    };

    afterEach(() => {
      sessionStorage.clear();
    });

    it('keeps guest notes when moving them into the account fails', async () => {
      await storage.addNoteAsync({ title: 'guest note' });
      await signIn('dave');

      vi.spyOn(QCDb.prototype, 'bulkWrite').mockRejectedValueOnce(new Error('write failed'));
      expect(await storage.migrateGuestDataToUser()).toBe(false);

      // a retry once storage works again still finds the guest note
      expect(await storage.migrateGuestDataToUser()).toBe(true);
      expect(await titles(storage)).toEqual(['guest note']);
    });

    it('reports a locked device instead of an empty store when the vault key is unavailable', async () => {
      // no device session token and no passphrase: the encrypted DB can't open
      await storage.setCurrentUser('erin');

      expect(storage.notesDbLocked).toBe(true);
      await expect(storage.loadNotesAsync()).rejects.toMatchObject({ kind: 'locked' });
      await expect(storage.addNoteAsync({ title: 'x' })).rejects.toMatchObject({
        kind: 'locked',
      });
      expect(await storage.setDataAsync([])).toBe(false);
    });

    it('treats an unreachable vault key as locked even with a valid device token', async () => {
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        async (input: RequestInfo | URL) =>
          ({
            ok: !String(input).includes('/api/vault/key'),
            json: async () => ({ success: !String(input).includes('/api/vault/key') }),
          }) as Response,
      );
      await signIn('frank');

      expect(storage.notesDbLocked).toBe(true);
      await expect(storage.loadNotesAsync()).rejects.toMatchObject({ kind: 'locked' });
    });

    it('unlocks by itself once the vault key is reachable again', async () => {
      await signIn('gina');
      await storage.addNoteAsync({ title: 'kept' });

      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const working = fetchMock.getMockImplementation();
      fetchMock.mockImplementation(
        async (input: RequestInfo | URL) =>
          ({
            ok: !String(input).includes('/api/vault/key'),
            json: async () => ({ success: !String(input).includes('/api/vault/key') }),
          }) as Response,
      );
      const offline = new NoteStorage();
      await offline.setCurrentUser('gina');
      expect(offline.notesDbLocked).toBe(true);

      // back online: still locked until the retry pause has passed...
      fetchMock.mockImplementation(working!);
      await expect(offline.loadNotesAsync()).rejects.toMatchObject({ kind: 'locked' });

      // ...then the next read unlocks without switching users again
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + NOTES_DB_RETRY_MS + 1);
      expect(await titles(offline)).toEqual(['kept']);
      expect(offline.notesDbLocked).toBe(false);
    });

    it('converges on one notes key when two tabs sign a new user in at once', async () => {
      // Both tabs find no wrapped DEK and create their own; if the second
      // overwrote the first, notes the first tab saved would never decrypt again.
      const other = new NoteStorage();
      await Promise.all([signIn('ivy'), other.setCurrentUser('ivy')]);
      await storage.addNoteAsync({ title: 'from tab 1' });
      await other.addNoteAsync({ title: 'from tab 2' });

      const reloaded = new NoteStorage();
      await reloaded.setCurrentUser('ivy');
      expect(await titles(reloaded)).toEqual(['from tab 1', 'from tab 2']);
      expect(reloaded.undecryptableCount).toBe(0);
    });

    it('shares one open of the notes DB between concurrent reads', async () => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const working = fetchMock.getMockImplementation();
      fetchMock.mockImplementation(
        async (input: RequestInfo | URL) =>
          ({
            ok: !String(input).includes('/api/vault/key'),
            json: async () => ({ success: !String(input).includes('/api/vault/key') }),
          }) as Response,
      );
      await signIn('jack'); // locked: the DB stays closed until the retry pause passes
      fetchMock.mockImplementation(working!);
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + NOTES_DB_RETRY_MS + 1);

      const open = vi.spyOn(QCRuntime, 'open');
      await Promise.all([storage.loadNotesAsync(), storage.loadNotesAsync()]);
      expect(open).toHaveBeenCalledTimes(1);
    });

    it('never overwrites a conflict list it could not read', async () => {
      await signIn('kate');
      const conflict = (id: string) => {
        const note = { id, title: id, content: '', createdAt: 1, updatedAt: 1 } as NoteItem;
        return { id, local: note, remote: note, resolved: false, createdAt: 1 };
      };
      expect(await storage.addConflictAsync(conflict('kept'))).toBe(true);

      vi.spyOn(QCDb.prototype, 'unseal').mockRejectedValueOnce(new Error('unseal failed'));
      expect(await storage.addConflictAsync(conflict('new'))).toBe(false);

      expect((await storage.getConflictsAsync()).map((c) => c.id)).toEqual(['kept']);
    });

    describe('records that cannot be decrypted', () => {
      const iv = btoa('\x00'.repeat(12));
      // well-formed ciphertext that won't authenticate under any real key
      const garbage = `${iv}.${btoa('\x01'.repeat(32))}`;

      /** Writes a record straight into the user's notes DB, bypassing encryption. */
      const putRaw = (userId: string, record: Record<string, unknown>) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open(`QCNOTE_NOTES_DB_${userId}`);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('notes', 'readwrite');
            tx.objectStore('notes').put(record);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });

      const getRaw = (userId: string, id: string) =>
        new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
          const req = indexedDB.open(`QCNOTE_NOTES_DB_${userId}`);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const get = db.transaction('notes', 'readonly').objectStore('notes').get(id);
            get.onsuccess = () => {
              db.close();
              resolve(get.result);
            };
            get.onerror = () => reject(get.error);
          };
        });

      const rawNote = (id: string, title: string, content: string) => ({
        id,
        title,
        content,
        category: '生活',
        tags: [],
        color: '#000',
        isFavorite: false,
        isArchived: false,
        createdAt: 1,
        updatedAt: 1,
      });

      it('hides them, counts them, and never rewrites or deletes them', async () => {
        await signIn('gina');
        await storage.addNoteAsync({ title: 'readable' });
        await putRaw('gina', rawNote('bad', garbage, garbage));
        const before = await getRaw('gina', 'bad');

        expect(await titles(storage)).toEqual(['readable']);
        expect(storage.undecryptableCount).toBe(1);

        // rewrite every visible note, then replace the whole list
        await storage.updateNotesAsync((notes) => notes.map((n) => ({ ...n, tags: ['t'] })));
        expect(await storage.setDataAsync([])).toBe(true);

        expect(await titles(storage)).toEqual([]);
        expect(await getRaw('gina', 'bad')).toEqual(before);
        expect(storage.undecryptableCount).toBe(1);
      });

      it('still reads plaintext values that merely look like base64', async () => {
        await signIn('hank');
        await putRaw('hank', rawNote('plain', 'readme.md', 'v1.2'));

        const notes = await storage.loadNotesAsync();
        expect(notes.map((n) => [n.title, n.content])).toEqual([['readme.md', 'v1.2']]);
        expect(storage.undecryptableCount).toBe(0);
      });
    });
  });
});

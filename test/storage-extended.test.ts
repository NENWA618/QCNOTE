import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoteStorage, type NoteItem, type OneDriveConfig, type WebDAVConfig } from '../lib/storage';
import IDB from '../lib/idb';
import { getOrCreateDeviceVaultKeyMaterial } from '../lib/storage/crypto';

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

const makeNote = (over: Partial<NoteItem> = {}): NoteItem => ({
  id: 'n1',
  title: 'T',
  content: 'C',
  category: '生活',
  tags: [],
  color: '#000',
  isFavorite: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const webdavConf = (over: Partial<WebDAVConfig> = {}): WebDAVConfig => ({
  url: 'https://dav.example.com/root/',
  username: 'u',
  password: 'p',
  remotePath: '/notes.json',
  ...over,
});

describe('NoteStorage (extended)', () => {
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

  describe('trash lifecycle', () => {
    it('soft-deletes, lists in trash, and hides from search by default', async () => {
      const n = await storage.addNoteAsync({ title: 'Gone', content: 'x' });
      expect(await storage.deleteNoteAsync(n.id)).toBe(true);

      const trash = await storage.getTrashNotesAsync();
      expect(trash.map((t) => t.id)).toEqual([n.id]);
      expect(trash[0].deletedAt).toBeGreaterThan(0);

      expect(await storage.searchNotesAsync('Gone')).toHaveLength(0);
      expect(await storage.searchNotesAsync('Gone', true)).toHaveLength(1);
    });

    it('returns false when deleting an unknown id', async () => {
      expect(await storage.deleteNoteAsync('nope')).toBe(false);
    });

    it('restores a deleted note and clears deletedAt', async () => {
      const n = await storage.addNoteAsync({ title: 'Back' });
      await storage.deleteNoteAsync(n.id);
      expect(await storage.restoreNoteAsync(n.id)).toBe(true);

      const restored = await storage.getNoteAsync(n.id);
      expect(restored?.isDeleted).toBe(false);
      expect(restored?.deletedAt).toBeUndefined();
      expect(await storage.getTrashNotesAsync()).toHaveLength(0);
    });

    it('does not restore a note that is not deleted or does not exist', async () => {
      const n = await storage.addNoteAsync({ title: 'Live' });
      expect(await storage.restoreNoteAsync(n.id)).toBe(false);
      expect(await storage.restoreNoteAsync('nope')).toBe(false);
    });

    it('permanently deletes a note', async () => {
      const keep = await storage.addNoteAsync({ title: 'Keep' });
      const drop = await storage.addNoteAsync({ title: 'Drop' });
      await storage.permanentlyDeleteNoteAsync(drop.id);

      const all = (await storage.getDataAsync()) || [];
      expect(all.map((x) => x.id)).toEqual([keep.id]);
    });
  });

  describe('wiki links and backlinks', () => {
    it('resolves [[title]] links into backlinks on the target note', async () => {
      const target = await storage.addNoteAsync({ title: 'Target', content: '' });
      const source = await storage.addNoteAsync({ title: 'Source', content: 'see [[Target]]' });

      const t = await storage.getNoteAsync(target.id);
      const s = await storage.getNoteAsync(source.id);
      expect(s?.links).toEqual(['Target']);
      expect(t?.backlinks).toEqual([source.id]);
    });

    it('deduplicates repeated links and ignores blank/unknown ones', async () => {
      const target = await storage.addNoteAsync({ title: 'A' });
      const source = await storage.addNoteAsync({
        title: 'B',
        content: '[[A]] and [[A]] and [[ ]] and [[Missing]]',
      });

      const s = await storage.getNoteAsync(source.id);
      expect(s?.links).toEqual(['A', 'Missing']);
      const t = await storage.getNoteAsync(target.id);
      expect(t?.backlinks).toEqual([source.id]);
    });

    it('updates backlinks when the link is removed from content', async () => {
      const target = await storage.addNoteAsync({ title: 'Target' });
      const source = await storage.addNoteAsync({ title: 'Source', content: '[[Target]]' });
      await storage.updateNoteAsync(source.id, { content: 'no link' });

      const t = await storage.getNoteAsync(target.id);
      expect(t?.backlinks).toEqual([]);
    });
  });

  describe('version history', () => {
    it('records the previous state on each update', async () => {
      const n = await storage.addNoteAsync({ title: 'v1', content: 'one' });
      const updated = await storage.updateNoteAsync(n.id, { title: 'v2', content: 'two' });

      expect(updated?.versions).toHaveLength(1);
      expect(updated?.versions?.[0]).toMatchObject({ title: 'v1', content: 'one' });
      expect(updated?.title).toBe('v2');
    });

    it('keeps only the 20 most recent versions', async () => {
      const n = await storage.addNoteAsync({ title: 't0' });
      for (let i = 1; i <= 25; i++) {
        await storage.updateNoteAsync(n.id, { title: `t${i}` });
      }
      const final = await storage.getNoteAsync(n.id);
      expect(final?.versions).toHaveLength(20);
      // oldest retained version is the state before update #6 (title t5)
      expect(final?.versions?.[0].title).toBe('t5');
      expect(final?.versions?.[19].title).toBe('t24');
    });

    it('keeps updatedAt strictly increasing for rapid successive updates', async () => {
      const n = await storage.addNoteAsync({ title: 'x' });
      const a = await storage.updateNoteAsync(n.id, { content: '1' });
      const b = await storage.updateNoteAsync(n.id, { content: '2' });
      expect(b!.updatedAt).toBeGreaterThan(a!.updatedAt);
    });
  });

  describe('user namespaces', () => {
    // Logged-in users need a (server-validated) device session token to open
    // their encrypted DB; the fetch mock above validates it and returns a KEK.
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

    it('isolates notes between users and the guest namespace', async () => {
      await storage.addNoteAsync({ title: 'guest note' });

      await signIn('alice');
      expect((await storage.getDataAsync()) || []).toHaveLength(0);
      await storage.addNoteAsync({ title: 'alice note' });

      await signIn('bob');
      expect((await storage.getDataAsync()) || []).toHaveLength(0);

      await signIn('alice');
      const aliceNotes = (await storage.getDataAsync()) || [];
      expect(aliceNotes.map((n) => n.title)).toEqual(['alice note']);

      await storage.setCurrentUser(null);
      const guestNotes = (await storage.getDataAsync()) || [];
      expect(guestNotes.map((n) => n.title)).toEqual(['guest note']);
    });

    it('sanitizes user ids so they cannot escape the key namespace', async () => {
      await signIn('a/b:c d');
      const key = storage['storageKey'] as string;
      expect(key).toContain('_USER_a_b_c_d');
      expect(key).not.toMatch(/[/: ]/);
    });

    it('migrates guest notes to the signed-in user and clears the guest copy', async () => {
      await storage.addNoteAsync({ title: 'from guest' });

      await signIn('carol');
      expect(await storage.migrateGuestDataToUser()).toBe(true);

      const carolNotes = (await storage.getDataAsync()) || [];
      expect(carolNotes).toHaveLength(1);
      expect(carolNotes[0].title).toBe('from guest');
      expect(carolNotes[0].ownerId).toBe('carol');

      // nothing left to migrate, and the guest namespace is empty
      expect(await storage.migrateGuestDataToUser()).toBe(false);
      await storage.setCurrentUser(null);
      expect((await storage.getDataAsync()) || []).toHaveLength(0);
    });

    it('does not migrate when no user is signed in', async () => {
      await storage.addNoteAsync({ title: 'guest' });
      expect(await storage.migrateGuestDataToUser()).toBe(false);
    });
  });

  describe('text encryption', () => {
    it('round-trips with the right passphrase', async () => {
      const enc = await (storage as any).encryptText('你好, world', 'pw');
      expect(enc).not.toContain('world');
      expect(await (storage as any).decryptText(enc, 'pw')).toBe('你好, world');
    });

    it('rejects a wrong passphrase', async () => {
      const enc = await (storage as any).encryptText('secret', 'right');
      await expect((storage as any).decryptText(enc, 'wrong')).rejects.toThrow();
    });

    it('rejects tampered ciphertext (GCM authentication)', async () => {
      const enc: string = await (storage as any).encryptText('secret', 'pw');
      const bytes = Uint8Array.from(atob(enc), (c) => c.charCodeAt(0));
      bytes[bytes.length - 1] ^= 0xff;
      const tampered = btoa(String.fromCharCode(...bytes));
      await expect((storage as any).decryptText(tampered, 'pw')).rejects.toThrow();
    });

    it('uses a fresh salt/iv so identical plaintexts encrypt differently', async () => {
      const a = await (storage as any).encryptText('same', 'pw');
      const b = await (storage as any).encryptText('same', 'pw');
      expect(a).not.toBe(b);
    });

    it('persists a stable device vault key across calls', () => {
      const k1 = getOrCreateDeviceVaultKeyMaterial('test:vault');
      const k2 = getOrCreateDeviceVaultKeyMaterial('test:vault');
      expect(k1).toBe(k2);
      expect(k1.length).toBeGreaterThan(20);
    });
  });

  describe('sync racing a user switch', () => {
    const signIn = async (userId: string) => {
      sessionStorage.setItem(
        'qcnote:deviceSessionToken',
        JSON.stringify({ userId, token: `token-${userId}` }),
      );
      await storage.setCurrentUser(userId);
    };

    // Holds the WebDAV download open until release() is called, so the test
    // can switch users while a sync is between "download" and "merge".
    const holdDownload = (remote: NoteItem[]) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let downloading!: () => void;
      const started = new Promise<void>((resolve) => (downloading = resolve));
      (global.fetch as any).mockImplementation(async (_url: string, init: any) => {
        if (init?.method === 'GET') {
          downloading();
          await gate;
          return { ok: true, status: 200, text: async () => JSON.stringify(remote) };
        }
        return { ok: true, json: async () => ({ success: true, kek: TEST_KEK }) };
      });
      return { started, release };
    };

    const putCount = () =>
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[1]?.method === 'PUT',
      ).length;

    afterEach(() => {
      sessionStorage.clear();
    });

    it('does not merge a signed-in user’s remote notes into the guest store', async () => {
      await signIn('alice');
      const { started, release } = holdDownload([
        makeNote({ id: 'secret', title: 'alice secret' }),
      ]);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sync = storage.syncWithWebDAVAsync(webdavConf());
      await started;
      await storage.setCurrentUser(null);
      release();

      expect(await sync).toBe(false);
      expect(putCount()).toBe(0);
      const guestNotes = (await storage.getDataAsync()) || [];
      expect(guestNotes.map((n) => n.title)).not.toContain('alice secret');
    });

    it('does not merge one user’s remote notes into another user’s store', async () => {
      await signIn('alice');
      const { started, release } = holdDownload([
        makeNote({ id: 'secret', title: 'alice secret' }),
      ]);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sync = storage.syncWithWebDAVAsync(webdavConf());
      await started;
      await signIn('bob');
      release();

      expect(await sync).toBe(false);
      expect(putCount()).toBe(0);
      expect((await storage.getDataAsync()) || []).toHaveLength(0);
    });

    it('aborts even if the same user signs back in before the download finishes', async () => {
      await signIn('alice');
      const { started, release } = holdDownload([makeNote({ id: 'r', title: 'remote' })]);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sync = storage.syncWithWebDAVAsync(webdavConf());
      await started;
      await storage.setCurrentUser(null);
      await signIn('alice');
      release();

      // the sync base read at the start may belong to the other session
      expect(await sync).toBe(false);
      expect(putCount()).toBe(0);
    });
  });

  describe('WebDAV push/pull', () => {
    const putCalls = () =>
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[1]?.method === 'PUT',
      );

    it('PUTs plaintext JSON to the normalized URL with Basic auth', async () => {
      await storage.addNoteAsync({ title: 'Push me' });
      const ok = await storage.pushToWebDAVAsync(webdavConf());
      expect(ok).toBe(true);

      const [url, init] = putCalls().at(-1)!;
      expect(url).toBe('https://dav.example.com/root/notes.json');
      expect(init.headers.Authorization).toBe(`Basic ${btoa('u:p')}`);
      expect(JSON.parse(init.body)[0].title).toBe('Push me');
    });

    it('sends non-Latin-1 credentials as UTF-8 instead of failing', async () => {
      await storage.addNoteAsync({ title: 'n' });
      expect(
        await storage.pushToWebDAVAsync(webdavConf({ username: '张三', password: '密码' })),
      ).toBe(true);

      const [, init] = putCalls().at(-1)!;
      const encoded = init.headers.Authorization.replace('Basic ', '');
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      expect(new TextDecoder().decode(bytes)).toBe('张三:密码');
    });

    it('encrypts the payload when an encryption key is set', async () => {
      await storage.addNoteAsync({ title: 'Top secret title' });
      await storage.pushToWebDAVAsync(webdavConf({ encryptionKey: 'k' }));

      const body: string = putCalls().at(-1)![1].body;
      expect(body).not.toContain('Top secret title');
      expect(() => JSON.parse(body)).toThrow();
      const plain = await (storage as any).decryptText(body, 'k');
      expect(JSON.parse(plain)[0].title).toBe('Top secret title');
    });

    it('returns false when the server rejects the PUT', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false, status: 500 });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(await storage.pushToWebDAVAsync(webdavConf())).toBe(false);
    });

    it('returns false when the network throws', async () => {
      (global.fetch as any).mockRejectedValue(new Error('offline'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(await storage.pushToWebDAVAsync(webdavConf())).toBe(false);
    });

    const mockPull = (notes: NoteItem[], encryptionKey?: string) => {
      (global.fetch as any).mockImplementation(async (_url: string, init: any) => {
        if (init?.method === 'GET') {
          let text = JSON.stringify(notes);
          if (encryptionKey) text = await (storage as any).encryptText(text, encryptionKey);
          return { ok: true, status: 200, text: async () => text };
        }
        return { ok: true, json: async () => ({}) };
      });
    };

    it('adds remote-only notes and keeps local-only notes', async () => {
      const local = await storage.addNoteAsync({ title: 'local only' });
      mockPull([makeNote({ id: 'remote1', title: 'remote only' })]);

      expect(await storage.pullFromWebDAVAsync(webdavConf())).toBe(true);
      const ids = ((await storage.getDataAsync()) || []).map((n) => n.id).sort();
      expect(ids).toEqual([local.id, 'remote1'].sort());
    });

    it('decrypts an encrypted remote file', async () => {
      mockPull([makeNote({ id: 'r', title: 'encrypted remote' })], 'k');
      expect(await storage.pullFromWebDAVAsync(webdavConf({ encryptionKey: 'k' }))).toBe(true);
      expect((await storage.getNoteAsync('r'))?.title).toBe('encrypted remote');
    });

    it('fails (and leaves local data intact) with the wrong decryption key', async () => {
      const local = await storage.addNoteAsync({ title: 'mine' });
      mockPull([makeNote({ id: 'r' })], 'right');
      vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await storage.pullFromWebDAVAsync(webdavConf({ encryptionKey: 'wrong' }))).toBe(false);
      const all = (await storage.getDataAsync()) || [];
      expect(all.map((n) => n.id)).toEqual([local.id]);
    });

    it('returns false on a non-OK response or non-array payload', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      (global.fetch as any).mockResolvedValue({ ok: false, status: 404 });
      expect(await storage.pullFromWebDAVAsync(webdavConf())).toBe(false);

      (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ not: 'an array' }),
      });
      expect(await storage.pullFromWebDAVAsync(webdavConf())).toBe(false);
    });

    describe('conflict handling', () => {
      let local: NoteItem;
      let remote: NoteItem;

      beforeEach(async () => {
        local = await storage.addNoteAsync({ title: 'shared', content: 'local edit' });
        remote = makeNote({
          id: local.id,
          title: 'shared',
          content: 'remote edit',
          updatedAt: local.updatedAt + 1000,
        });
        mockPull([remote]);
      });

      it('manual (default): keeps local and records a conflict', async () => {
        await storage.pullFromWebDAVAsync(webdavConf());

        expect((await storage.getNoteAsync(local.id))?.content).toBe('local edit');
        const conflicts = await storage.getConflictsAsync();
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].id).toBe(local.id);
        expect(conflicts[0].remote.content).toBe('remote edit');
        expect(conflicts[0].resolved).toBe(false);
      });

      it('prefer-remote: takes the remote copy without a conflict', async () => {
        await storage.pullFromWebDAVAsync(webdavConf({ conflictStrategy: 'prefer-remote' }));
        expect((await storage.getNoteAsync(local.id))?.content).toBe('remote edit');
        expect(await storage.getConflictsAsync()).toHaveLength(0);
      });

      it('prefer-local: keeps the local copy without a conflict', async () => {
        await storage.pullFromWebDAVAsync(webdavConf({ conflictStrategy: 'prefer-local' }));
        expect((await storage.getNoteAsync(local.id))?.content).toBe('local edit');
        expect(await storage.getConflictsAsync()).toHaveLength(0);
      });

      it('identical notes are not reported as conflicts', async () => {
        const current = (await storage.getNoteAsync(local.id))!;
        mockPull([{ ...current }]);
        await storage.pullFromWebDAVAsync(webdavConf());
        expect(await storage.getConflictsAsync()).toHaveLength(0);
      });
    });
  });

  describe('conflict resolution', () => {
    it('returns false for an unknown conflict id', async () => {
      expect(await storage.resolveConflictAsync('nope', makeNote())).toBe(false);
    });

    it('re-adds the resolved note if it no longer exists locally', async () => {
      const note = makeNote({ id: 'ghost', title: 'ghost' });
      await storage.addConflictAsync({
        id: 'ghost',
        local: note,
        remote: note,
        resolved: false,
        createdAt: Date.now(),
      });
      expect(await storage.resolveConflictAsync('ghost', note)).toBe(true);
      expect((await storage.getNoteAsync('ghost'))?.title).toBe('ghost');
      expect(await storage.getConflictsAsync()).toHaveLength(0);
    });
  });

  describe('JSON import', () => {
    const fileOf = (data: unknown) =>
      new File([typeof data === 'string' ? data : JSON.stringify(data)], 'backup.json', {
        type: 'application/json',
      });

    it('imports notes and fills in missing links/backlinks/versions', async () => {
      const count = await storage.importFromJSON(
        fileOf([{ ...makeNote({ id: 'imp1', title: 'Imported' }) }]),
      );
      expect(count).toBe(1);
      const n = await storage.getNoteAsync('imp1');
      expect(n).toMatchObject({ title: 'Imported', links: [], backlinks: [], versions: [] });
    });

    it('re-ids imported notes that collide with existing ids', async () => {
      const existing = await storage.addNoteAsync({ title: 'existing' });
      await storage.importFromJSON(fileOf([makeNote({ id: existing.id, title: 'dup' })]));

      const all = (await storage.getDataAsync()) || [];
      expect(all).toHaveLength(2);
      expect(all.find((n) => n.id === existing.id)?.title).toBe('existing');
      const imported = all.find((n) => n.title === 'dup')!;
      expect(imported.id).toContain(`${existing.id}_imported_`);
    });

    it('rejects invalid JSON and non-array JSON', async () => {
      await expect(storage.importFromJSON(fileOf('{not json'))).rejects.toMatch(/导入失败/);
      await expect(storage.importFromJSON(fileOf({ a: 1 }))).rejects.toBe('无效的JSON格式');
    });
  });

  describe('OneDrive sync', () => {
    const odConf = (over: Partial<OneDriveConfig> = {}): OneDriveConfig => ({
      accessToken: 'tok',
      folderPath: '/my notes/backup.json/',
      ...over,
    });

    const callsOf = (method: string) =>
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[1]?.method === method,
      );

    /** Mock Graph API: GET returns `remoteBody` (or a status), PUT is recorded. */
    const mockGraph = (opts: { remoteBody?: string; getStatus?: number; putOk?: boolean }) => {
      const { remoteBody = '', getStatus = 200, putOk = true } = opts;
      (global.fetch as any).mockImplementation(async (_url: string, init: any) => {
        if (init?.method === 'GET') {
          return { ok: getStatus === 200, status: getStatus, text: async () => remoteBody };
        }
        if (init?.method === 'PUT') {
          return { ok: putOk, status: putOk ? 200 : 500, statusText: 'Server Error' };
        }
        return { ok: true, json: async () => ({ success: true }) };
      });
    };

    it('rejects incomplete configs without touching the network', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const spy = global.fetch as unknown as ReturnType<typeof vi.fn>;
      spy.mockClear();

      expect(await storage.syncWithOneDriveAsync(odConf({ accessToken: '' }))).toBe(false);
      expect(await storage.syncWithOneDriveAsync(odConf({ folderPath: '' }))).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    });

    it('builds a Graph URL with trimmed, per-segment-encoded path and Bearer auth', async () => {
      mockGraph({ getStatus: 404 });
      await storage.syncWithOneDriveAsync(odConf());

      const [url, init] = callsOf('GET')[0];
      expect(url).toBe(
        'https://graph.microsoft.com/v1.0/me/drive/root:/my%20notes/backup.json:/content',
      );
      expect(init.headers.Authorization).toBe('Bearer tok');
    });

    it('uploads local notes when the remote file does not exist', async () => {
      const n = await storage.addNoteAsync({ title: 'only local' });
      mockGraph({ getStatus: 404 });

      expect(await storage.syncWithOneDriveAsync(odConf())).toBe(true);
      const uploaded = JSON.parse(callsOf('PUT').at(-1)![1].body);
      expect(uploaded.map((x: NoteItem) => x.id)).toEqual([n.id]);
    });

    it('merges remote-only notes into local storage and uploads the union', async () => {
      const local = await storage.addNoteAsync({ title: 'local' });
      mockGraph({ remoteBody: JSON.stringify([makeNote({ id: 'remote1', title: 'remote' })]) });

      expect(await storage.syncWithOneDriveAsync(odConf())).toBe(true);

      const ids = ((await storage.getDataAsync()) || []).map((x) => x.id).sort();
      expect(ids).toEqual([local.id, 'remote1'].sort());
      const uploaded = JSON.parse(callsOf('PUT').at(-1)![1].body);
      expect(uploaded.map((x: NoteItem) => x.id).sort()).toEqual(ids);
    });

    it('keeps the newer copy when the same note exists on both sides', async () => {
      const local = await storage.addNoteAsync({ title: 'local title' });
      mockGraph({
        remoteBody: JSON.stringify([
          makeNote({ id: local.id, title: 'newer remote', updatedAt: local.updatedAt + 5000 }),
        ]),
      });
      await storage.syncWithOneDriveAsync(odConf());
      expect((await storage.getNoteAsync(local.id))?.title).toBe('newer remote');

      // now the local copy is newer than the remote one
      const edited = await storage.updateNoteAsync(local.id, { title: 'newest local' });
      mockGraph({
        remoteBody: JSON.stringify([
          makeNote({ id: local.id, title: 'stale remote', updatedAt: edited!.updatedAt - 1 }),
        ]),
      });
      await storage.syncWithOneDriveAsync(odConf());
      expect((await storage.getNoteAsync(local.id))?.title).toBe('newest local');
    });

    it('normalizes remote notes that lack links/backlinks/versions', async () => {
      mockGraph({ remoteBody: JSON.stringify([makeNote({ id: 'bare' })]) });
      await storage.syncWithOneDriveAsync(odConf());
      expect(await storage.getNoteAsync('bare')).toMatchObject({
        links: [],
        backlinks: [],
        versions: [],
      });
    });

    it('encrypts the upload and decrypts the remote file when a key is set', async () => {
      await storage.addNoteAsync({ title: 'Hidden title' });
      const remote = await (storage as any).encryptText(
        JSON.stringify([makeNote({ id: 'enc-remote', title: 'remote enc' })]),
        'k',
      );
      mockGraph({ remoteBody: remote });

      expect(await storage.syncWithOneDriveAsync(odConf({ encryptionKey: 'k' }))).toBe(true);
      expect((await storage.getNoteAsync('enc-remote'))?.title).toBe('remote enc');

      const body: string = callsOf('PUT').at(-1)![1].body;
      expect(body).not.toContain('Hidden title');
      const plain = JSON.parse(await (storage as any).decryptText(body, 'k'));
      expect(plain.map((x: NoteItem) => x.title).sort()).toEqual(['Hidden title', 'remote enc']);
    });

    it('does not encrypt when encrypt=false even if a key is configured', async () => {
      await storage.addNoteAsync({ title: 'plain' });
      mockGraph({ getStatus: 404 });
      await storage.syncWithOneDriveAsync(odConf({ encryptionKey: 'k' }), false);
      expect(() => JSON.parse(callsOf('PUT').at(-1)![1].body)).not.toThrow();
    });

    it('falls back to parsing plaintext when the remote file cannot be decrypted', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockGraph({ remoteBody: JSON.stringify([makeNote({ id: 'plain-remote' })]) });

      expect(await storage.syncWithOneDriveAsync(odConf({ encryptionKey: 'k' }))).toBe(true);
      expect(await storage.getNoteAsync('plain-remote')).toBeDefined();
    });

    it('aborts without uploading when the remote file is corrupt or not an array', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const local = await storage.addNoteAsync({ title: 'safe' });

      for (const remoteBody of ['{not json', JSON.stringify({ not: 'array' })]) {
        mockGraph({ remoteBody });
        expect(await storage.syncWithOneDriveAsync(odConf())).toBe(false);
        expect(callsOf('PUT')).toHaveLength(0);
      }

      expect(((await storage.getDataAsync()) || []).map((x) => x.id)).toEqual([local.id]);
    });

    it('aborts without uploading when the remote is encrypted with a different key', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await storage.addNoteAsync({ title: 'this device' });
      const otherDevices = await (storage as any).encryptText(
        JSON.stringify([makeNote({ id: 'other-device' })]),
        'other-key',
      );
      mockGraph({ remoteBody: otherDevices });

      expect(await storage.syncWithOneDriveAsync(odConf({ encryptionKey: 'k' }))).toBe(false);
      expect(callsOf('PUT')).toHaveLength(0);
    });

    it.each([401, 429, 500, 503])(
      'aborts without uploading when reading the remote file fails with %i',
      async (getStatus) => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await storage.addNoteAsync({ title: 'local' });
        mockGraph({ getStatus });

        expect(await storage.syncWithOneDriveAsync(odConf())).toBe(false);
        expect(callsOf('PUT')).toHaveLength(0);
      },
    );

    it('returns false when the upload fails, but local merge is already saved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      // a local-only note makes an upload necessary
      await storage.addNoteAsync({ title: 'only here' });
      mockGraph({
        remoteBody: JSON.stringify([makeNote({ id: 'merged-anyway' })]),
        putOk: false,
      });

      expect(await storage.syncWithOneDriveAsync(odConf())).toBe(false);
      expect(await storage.getNoteAsync('merged-anyway')).toBeDefined();
    });

    it('returns false when the network throws', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      (global.fetch as any).mockRejectedValue(new Error('offline'));
      expect(await storage.syncWithOneDriveAsync(odConf())).toBe(false);
    });

    it('clears the stored OneDrive config', async () => {
      await storage.setOneDriveConfigAsync(odConf({ encryptionKey: 'k' }));
      expect(await storage.clearOneDriveConfigAsync()).toBe(true);
      expect(await storage.getOneDriveConfigAsync()).toBeNull();
    });
  });

  describe('clearAllAsync', () => {
    it('removes all notes', async () => {
      await storage.addNoteAsync({ title: 'a' });
      await storage.addNoteAsync({ title: 'b' });
      await storage.clearAllAsync();
      expect((await storage.getDataAsync()) || []).toHaveLength(0);
    });
  });
});

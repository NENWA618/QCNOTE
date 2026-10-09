// For a signed-in user, nothing the user wrote — nor anything that unlocks it
// — may sit in plaintext anywhere in browser storage. These tests write
// marked content through every path, dump all of IndexedDB and localStorage
// raw, and look for the markers.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoteStorage, type NoteConflict } from '../lib/storage';
import { encryptConfigSecret, WEBDAV_VAULT_KEY_STORAGE_KEY } from '../lib/storage/crypto';
import IDB from '../lib/idb';
import { getAISettings, saveAISettings } from '../lib/aiSettings';

const TEST_KEK = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));

let lsStore: Record<string, string> = {};
const resetLocalStorage = () => {
  lsStore = {};
  (global as any).localStorage = {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null),
    setItem: (k: string, v: string) => {
      lsStore[k] = String(v);
    },
    removeItem: (k: string) => {
      delete lsStore[k];
    },
    clear: () => {
      lsStore = {};
    },
  } as any;
};

const openRaw = (name: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** Every value in every object store of every database, plus localStorage. */
async function dumpAllStorage(): Promise<string> {
  const out: unknown[] = [Object.entries(lsStore)];
  for (const { name } of await indexedDB.databases()) {
    if (!name) continue;
    const db = await openRaw(name);
    for (const store of Array.from(db.objectStoreNames)) {
      const values = await new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      out.push([name, store, values]);
    }
    db.close();
  }
  return JSON.stringify(out);
}

const putRaw = async (dbName: string, store: string, value: unknown, key?: IDBValidKey) => {
  const db = await openRaw(dbName);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

const deleteRaw = async (dbName: string, store: string, key: IDBValidKey) => {
  const db = await openRaw(dbName);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

let userCounter = 0;

describe('encryption at rest for a signed-in user', () => {
  let storage: NoteStorage;
  let userId: string;

  const signIn = async (s: NoteStorage) => {
    sessionStorage.setItem(
      'qcnote:deviceSessionToken',
      JSON.stringify({ userId, token: `token-${userId}` }),
    );
    await s.setCurrentUser(userId);
    expect(s.notesDbLocked).toBe(false);
  };

  beforeEach(async () => {
    resetLocalStorage();
    if (IDB.clearStore) await IDB.clearStore().catch(() => {});
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, kek: TEST_KEK }),
    } as Response);
    userId = `secretive${++userCounter}`;
    storage = new NoteStorage();
    await signIn(storage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('leaves no user content or sync credentials readable anywhere', async () => {
    await storage.addNoteAsync({ title: 'SECRET-LINKED', content: 'x' });
    const note = await storage.addNoteAsync({
      title: 'SECRET-TITLE',
      content: 'SECRET-BODY-V1 [[SECRET-LINKED]]',
      tags: ['SECRET-TAG'],
      category: 'SECRET-CATEGORY',
    });
    // the first body now lives on only in the version history
    await storage.updateNoteAsync(note.id, { content: 'SECRET-BODY-V2 [[SECRET-LINKED]]' });

    expect(
      await storage.setWebDAVConfigAsync({
        url: 'https://SECRET-DAV-HOST/',
        username: 'SECRET-DAV-USER',
        password: 'SECRET-DAV-PASSWORD',
        remotePath: 'notes.json',
        encryptionKey: 'SECRET-DAV-SYNC-KEY',
      }),
    ).toBe(true);
    expect(
      await storage.setOneDriveConfigAsync({
        accessToken: 'SECRET-ONEDRIVE-TOKEN',
        folderPath: 'notes.json',
        encryptionKey: 'SECRET-ONEDRIVE-SYNC-KEY',
      }),
    ).toBe(true);

    const saved = (await storage.loadNotesAsync()).find((n) => n.id === note.id)!;
    const conflict: NoteConflict = {
      id: note.id,
      local: saved,
      remote: { ...saved, content: 'SECRET-CONFLICT-REMOTE' },
      resolved: false,
      createdAt: 1,
    };
    expect(await storage.setConflictsAsync([conflict])).toBe(true);
    await storage.saveSemanticCache({ [note.id]: { updatedAt: 1, vector: [0.123456789] } });
    // a successful push records a sync base
    expect(
      await storage.pushToWebDAVAsync({
        url: 'https://dav.test/',
        username: 'u',
        password: 'p',
        remotePath: 'notes.json',
      }),
    ).toBe(true);

    const dump = await dumpAllStorage();
    expect(dump.match(/SECRET-[A-Z0-9-]+/g)).toBeNull();
    expect(dump).not.toContain('0.123456789');

    // ...while everything still reads back for the user
    const reloaded = (await storage.loadNotesAsync()).find((n) => n.id === note.id)!;
    expect(reloaded.title).toBe('SECRET-TITLE');
    expect(reloaded.tags).toEqual(['SECRET-TAG']);
    expect(reloaded.category).toBe('SECRET-CATEGORY');
    expect(reloaded.links).toEqual(['SECRET-LINKED']);
    expect(reloaded.versions?.map((v) => v.content)).toEqual(['SECRET-BODY-V1 [[SECRET-LINKED]]']);
    expect((await storage.getWebDAVConfigAsync())?.encryptionKey).toBe('SECRET-DAV-SYNC-KEY');
    expect((await storage.getOneDriveConfigAsync())?.accessToken).toBe('SECRET-ONEDRIVE-TOKEN');
    expect((await storage.getConflictsAsync())[0].remote.content).toBe('SECRET-CONFLICT-REMOTE');
    expect((await storage.loadSemanticCache())?.[note.id].vector).toEqual([0.123456789]);
  });

  it('encrypts plaintext fields left by older versions when the database opens', async () => {
    const dbName = `QCNOTE_NOTES_DB_${userId}`;
    await putRaw(dbName, 'notes', {
      id: 'old',
      title: 'readable title',
      content: 'readable body',
      category: 'OLD-PLAIN-CATEGORY',
      tags: ['OLD-PLAIN-TAG'],
      versions: [{ versionId: 'v', title: 't', content: 'OLD-PLAIN-VERSION' }],
      color: '#000',
      isFavorite: false,
      isArchived: false,
      createdAt: 1,
      updatedAt: 1,
    });
    // pretend the database predates the current set of secret fields
    await deleteRaw(`${dbName}__qcnote_meta__`, 'meta', 'secretFields');

    const reopened = new NoteStorage();
    await signIn(reopened);

    expect(await dumpAllStorage()).not.toMatch(/OLD-PLAIN|readable (title|body)/);
    const old = (await reopened.loadNotesAsync()).find((n) => n.id === 'old')!;
    expect(old.tags).toEqual(['OLD-PLAIN-TAG']);
    expect(old.versions?.[0].content).toBe('OLD-PLAIN-VERSION');
  });

  it('re-saves plaintext conflicts and device-key sync credentials sealed', async () => {
    await storage.enableIndexedDB();
    const conflictsKey = storage['conflictsKey'] as string;
    const webdavKey = storage['webdavConfigKey'] as string;
    await IDB.setItem(conflictsKey, [
      { id: 'c', local: { content: 'OLD-PLAIN-CONFLICT' }, remote: {}, resolved: false },
    ]);
    await IDB.setItem(webdavKey, {
      url: 'https://dav.test/',
      username: 'u',
      remotePath: 'notes.json',
      password: await encryptConfigSecret('OLD-DEVICE-KEY-PASSWORD', WEBDAV_VAULT_KEY_STORAGE_KEY),
      encryptionKey: 'OLD-PLAIN-SYNC-KEY',
    });

    expect((await storage.getConflictsAsync())[0].local.content).toBe('OLD-PLAIN-CONFLICT');
    const config = await storage.getWebDAVConfigAsync();
    expect(config?.password).toBe('OLD-DEVICE-KEY-PASSWORD');
    expect(config?.encryptionKey).toBe('OLD-PLAIN-SYNC-KEY');

    // the device key sits next to its ciphertext, so it doesn't count either
    for (const key of Object.keys(lsStore)) delete lsStore[key];
    const dump = await dumpAllStorage();
    expect(dump).not.toMatch(/OLD-PLAIN|"encrypted:/);
    expect((await storage.getWebDAVConfigAsync())?.password).toBe('OLD-DEVICE-KEY-PASSWORD');
  });

  describe('AI settings', () => {
    const settings = {
      apiEndpoint: 'https://SECRET-AI-HOST/v1/chat/completions',
      modelName: 'SECRET-AI-MODEL',
      apiKey: 'SECRET-AI-API-KEY',
    };

    it('seals the API key with the notes key, not the device key', async () => {
      expect(await saveAISettings(userId, settings, storage)).toBe(true);

      expect((await dumpAllStorage()).match(/SECRET-[A-Z0-9-]+/g)).toBeNull();
      // nothing the device key alone could open, either
      expect(await IDB.getItem(`qcnote:ai-settings:${userId}`)).toHaveProperty('__sealed');
      expect(await getAISettings(userId, storage)).toMatchObject(settings);
    });

    it('re-saves a device-key record from older versions sealed', async () => {
      // what older versions wrote for every user: the key encrypted with the
      // device key that sits right next to it in localStorage
      const guestLike = new NoteStorage();
      expect(await saveAISettings(null, settings, guestLike)).toBe(true);
      await IDB.setItem(
        `qcnote:ai-settings:${userId}`,
        await IDB.getItem('qcnote:ai-settings:GUEST'),
      );
      await IDB.deleteItem('qcnote:ai-settings:GUEST');

      expect((await getAISettings(userId, storage))?.apiKey).toBe('SECRET-AI-API-KEY');
      expect(await IDB.getItem(`qcnote:ai-settings:${userId}`)).toHaveProperty('__sealed');
      expect(await getAISettings(userId, storage)).toMatchObject(settings);
    });

    it('can neither read nor save while the device is locked', async () => {
      expect(await saveAISettings(userId, settings, storage)).toBe(true);

      const locked = new NoteStorage();
      sessionStorage.clear(); // no device session token: the notes DB can't open
      await locked.setCurrentUser(userId);
      expect(locked.notesDbLocked).toBe(true);

      await expect(getAISettings(userId, locked)).rejects.toMatchObject({ kind: 'locked' });
      expect(await saveAISettings(userId, { ...settings, apiKey: 'LOCKED-KEY' }, locked)).toBe(
        false,
      );
      expect(await dumpAllStorage()).not.toContain('LOCKED-KEY');
    });

    it('refuses a storage that is switched to another user', async () => {
      await expect(getAISettings('someone-else', storage)).rejects.toThrow(/not switched/);
    });
  });

  it('refuses to save sync credentials while the device is locked', async () => {
    const locked = new NoteStorage();
    sessionStorage.clear(); // no device session token: the notes DB can't open
    await locked.setCurrentUser(`${userId}-locked`);
    expect(locked.notesDbLocked).toBe(true);

    expect(
      await locked.setWebDAVConfigAsync({
        url: 'https://dav.test/',
        username: 'u',
        password: 'LOCKED-PASSWORD',
        remotePath: 'notes.json',
      }),
    ).toBe(false);
    expect(await dumpAllStorage()).not.toContain('LOCKED-PASSWORD');
  });
});

describe('guest secrets', () => {
  beforeEach(async () => {
    resetLocalStorage();
    if (IDB.clearStore) await IDB.clearStore().catch(() => {});
  });

  it('encrypts the WebDAV sync key, not just the password', async () => {
    const guest = new NoteStorage();
    await guest.setWebDAVConfigAsync({
      url: 'https://dav.test/',
      username: 'u',
      password: 'GUEST-PASSWORD',
      remotePath: 'notes.json',
      encryptionKey: 'GUEST-SYNC-KEY',
    });
    const stored = (await IDB.getItem(guest['webdavConfigKey'])) as Record<string, string>;
    expect(stored.password.startsWith('encrypted:')).toBe(true);
    expect(stored.encryptionKey.startsWith('encrypted:')).toBe(true);
    expect((await guest.getWebDAVConfigAsync())?.encryptionKey).toBe('GUEST-SYNC-KEY');
  });

  it('still encrypts a guest AI API key with the device key', async () => {
    const guest = new NoteStorage();
    const settings = { apiEndpoint: 'https://ai.test', modelName: 'm', apiKey: 'GUEST-AI-KEY' };
    expect(await saveAISettings(null, settings, guest)).toBe(true);
    const stored = (await IDB.getItem('qcnote:ai-settings:GUEST')) as Record<string, string>;
    expect(JSON.stringify(stored)).not.toContain('GUEST-AI-KEY');
    expect((await getAISettings(null, guest))?.apiKey).toBe('GUEST-AI-KEY');
  });
});

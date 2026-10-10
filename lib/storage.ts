import Utils from './utils';
import IDB from './idb';
import logger from './logger';
import Indexer, { type SemanticCacheStore, type SemanticEmbeddingCache } from './indexer';
import SentimentUtil from './sentiment';
import { QCRuntime, QCDb, QCStoreSchema, UNDECRYPTABLE_MARKER } from '../qcruntime/qcnote-runtime';
import {
  LEGACY_ONEDRIVE_PASSPHRASE,
  LEGACY_WEBDAV_PASSPHRASE,
  ONEDRIVE_VAULT_KEY_STORAGE_KEY,
  WEBDAV_VAULT_KEY_STORAGE_KEY,
  decryptConfigSecret,
  decryptText,
  encryptConfigSecret,
  encryptText,
} from './storage/crypto';
import {
  fetchVaultKey,
  getDeviceFingerprint,
  getDeviceSessionToken,
  setDeviceSessionToken,
  validateDeviceSessionToken,
} from './storage/deviceSession';
import { normalizeNote, syncLinkGraph } from './storage/linkGraph';
import {
  normalizeWebDAVUrl,
  oneDriveTransport,
  webdavFetch,
  webdavTransport,
  type SyncTransport,
} from './storage/remoteSync';
import {
  applicableBase,
  noteSyncHash,
  threeWayMerge,
  type SyncBase,
  type SyncStrategy,
  type ThreeWayMergeResult,
} from './storage/syncEngine';

import type {
  ColoredRange,
  NoteConflict,
  NoteItem,
  NoteVersion,
  OneDriveConfig,
  Stats,
  UserSettings,
  WebDAVConfig,
} from './storage/types';

export type {
  ColoredRange,
  NoteConflict,
  NoteItem,
  NoteVersion,
  OneDriveConfig,
  Stats,
  UserSettings,
  WebDAVConfig,
};

const SEALED_FIELD = '__sealed';
export type SealedValue = { [SEALED_FIELD]: string };

export function isSealedValue(value: unknown): value is SealedValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[SEALED_FIELD] === 'string'
  );
}

const WEBDAV_SECRET_FIELDS: (keyof WebDAVConfig & string)[] = ['password', 'encryptionKey'];
const ONEDRIVE_SECRET_FIELDS: (keyof OneDriveConfig & string)[] = ['accessToken', 'encryptionKey'];

const LOCKED_MESSAGE =
  '当前设备未解锁（无法获取加密密钥）。请检查网络连接，或重新验证/注册当前设备后重试。';

/** How long a locked signed-in user's notes DB waits before the next unlock attempt. */
export const NOTES_DB_RETRY_MS = 10_000;

/**
 * Thrown when notes can't be read or written. Mutations never fall back to
 * "assume there are no notes": doing so and then writing back would wipe the
 * user's data.
 */
export class NoteStorageError extends Error {
  constructor(
    message: string,
    readonly kind: 'locked' | 'read' | 'write',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'NoteStorageError';
  }
}

/** Thrown when the signed-in user changed while a sync was in flight. */
class UserChangedError extends Error {
  constructor() {
    super('User changed during sync');
    this.name = 'UserChangedError';
  }
}

export class NoteStorage implements SemanticCacheStore {
  storageKeyPrefix = 'QCNOTE';
  storageKey!: string;
  settingsKey!: string;
  webdavConfigKey!: string;
  oneDriveConfigKey!: string;
  conflictsKey!: string;
  useIndexedDB: boolean;
  currentUserId: string | null;

  private readonly noteStoreSchema: QCStoreSchema = {
    name: 'notes',
    keyField: 'id',
    keyAuto: false,
    fields: [
      // Everything the user wrote, or that is derived from it, is secret:
      // title/content, but also their version history, tags, category, the
      // [[titles]] they link to, text colouring and sentiment. Only ids,
      // timestamps, flags and the note colour stay in plaintext. (A field
      // missing from this list is stored as-is, so new note fields that carry
      // user content must be added here.)
      { name: 'id', type: 'str', indexed: true, secret: false },
      { name: 'title', type: 'str', indexed: false, secret: true },
      { name: 'content', type: 'str', indexed: false, secret: true },
      // `indexed` only affects databases created from now on; an index on
      // ciphertext is useless, and existing databases keep a harmless one.
      { name: 'category', type: 'str', indexed: false, secret: true },
      { name: 'tags', type: 'json', indexed: false, secret: true },
      { name: 'color', type: 'str', indexed: false, secret: false },
      { name: 'coloredRanges', type: 'json', indexed: false, secret: true },
      { name: 'isFavorite', type: 'bool', indexed: false, secret: false },
      { name: 'isArchived', type: 'bool', indexed: false, secret: false },
      { name: 'createdAt', type: 'num', indexed: false, secret: false },
      { name: 'updatedAt', type: 'num', indexed: false, secret: false },
      { name: 'links', type: 'json', indexed: false, secret: true },
      { name: 'backlinks', type: 'json', indexed: false, secret: false },
      { name: 'versions', type: 'json', indexed: false, secret: true },
      { name: 'sentimentScore', type: 'num', indexed: false, secret: true },
      { name: 'sentimentComparative', type: 'num', indexed: false, secret: true },
      { name: 'sentimentCategory', type: 'str', indexed: false, secret: true },
      { name: 'isDeleted', type: 'bool', indexed: false, secret: false },
      { name: 'deletedAt', type: 'num', indexed: false, secret: false },
      { name: 'ownerId', type: 'str', indexed: true, secret: false },
    ],
  };

  private notesDb?: QCDb | null;
  private notesDbName: string | null = null;
  /** The open in progress, if any; see ensureNotesDb. */
  private notesDbOpening: { dbName: string; promise: Promise<QCDb | null> } | null = null;
  private notesDbOpenFailed = false;
  /** Earliest time (ms) a failed open of a signed-in user's notes DB is retried. */
  private notesDbRetryAt = 0;
  /**
   * True when the last ensureNotesDb() attempt failed specifically because a
   * server-held vault key couldn't be fetched (e.g. offline) and no
   * already-migrated local key was available to fall back to. UI code can
   * check this to show "需要联网解锁" instead of implying notes were lost.
   */
  notesDbLocked = false;

  /**
   * How many records in the notes DB couldn't be decrypted on the last read.
   * They are hidden and left untouched; UI code can surface the count.
   */
  undecryptableCount = 0;

  /**
   * Tail of the write queue. Every read-modify-write of the notes, and every
   * user switch, runs through runExclusive() so two saves in this tab can't
   * interleave and overwrite each other.
   */
  private writeChain: Promise<unknown> = Promise.resolve();

  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(task, task);
    this.writeChain = run.catch(() => {});
    return run;
  }

  /**
   * Bumped synchronously by every setCurrentUser() call, before the switch
   * itself is queued. A sync reads it before downloading and re-checks it
   * inside the write lock, so data fetched with one user's sync config is
   * never merged into, or recorded against, another session's store — even
   * when the same user signs back in mid-download.
   */
  private userGenerationCounter = 0;

  get userGeneration(): number {
    return this.userGenerationCounter;
  }

  /**
   * Runs `task` under the write lock, unless the user changed since
   * `generation` (read from userGeneration); then it returns false without
   * running it. `task` must not itself take the lock (e.g. save notes).
   */
  async runIfSameUser(generation: number, task: () => Promise<unknown>): Promise<boolean> {
    try {
      await this.runForGeneration(generation, task);
      return true;
    } catch (e) {
      if (e instanceof UserChangedError) return false;
      throw e;
    }
  }

  /** runExclusive, but throws UserChangedError if the user changed since `generation`. */
  private runForGeneration<T>(generation: number, task: () => Promise<T>): Promise<T> {
    return this.runExclusive(async () => {
      if (generation !== this.userGenerationCounter) throw new UserChangedError();
      return task();
    });
  }

  private getDeviceSessionToken(userId: string | null): string | null {
    return getDeviceSessionToken(userId);
  }

  private setDeviceSessionToken(userId: string | null, token: string | null): void {
    setDeviceSessionToken(userId, token);
  }

  constructor() {
    this.currentUserId = null;
    this.useIndexedDB = false;
    this.updateNamespacedKeys();
    this.init();
    // 自动检查 IndexedDB 是否可用
    this.detectIndexedDB();
    if (typeof window !== 'undefined') {
      Indexer.purgeLegacyPlaintextCaches().catch(() => {});
    }
  }

  // 自动检测 IndexedDB 是否已初始化
  async detectIndexedDB() {
    if (typeof window === 'undefined') return;
    try {
      const data = await IDB.getItem(this.storageKey);
      if (data) {
        this.useIndexedDB = true;
        logger.info('✓ 检测到 IndexedDB 数据，自动启用');
      }
    } catch (e) {
      // IndexedDB 不可用或出错，保持 useIndexedDB = false
    }
  }

  private sanitizeUserId(userId: string): string {
    return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private getNamespacedKey(baseKey: string, userId: string | null = null): string {
    if (!userId) {
      return `${this.storageKeyPrefix}_${baseKey}`;
    }
    return `${this.storageKeyPrefix}_${baseKey}_USER_${this.sanitizeUserId(userId)}`;
  }

  private updateNamespacedKeys() {
    this.storageKey = this.getNamespacedKey('STORAGE', this.currentUserId);
    this.settingsKey = this.getNamespacedKey('SETTINGS', this.currentUserId);
    this.webdavConfigKey = this.getNamespacedKey('WEBDAV_CONFIG', this.currentUserId);
    this.oneDriveConfigKey = this.getNamespacedKey('ONEDRIVE_CONFIG', this.currentUserId);
    this.conflictsKey = this.getNamespacedKey('CONFLICTS', this.currentUserId);
  }

  private getNotesDbName(userId: string | null = this.currentUserId): string {
    const suffix = userId ? this.sanitizeUserId(userId) : 'GUEST';
    return `${this.storageKeyPrefix}_NOTES_DB_${suffix}`;
  }

  private async ensureNotesDb(userId: string | null = this.currentUserId): Promise<QCDb | null> {
    const dbName = this.getNotesDbName(userId);
    if (this.notesDb && this.notesDbName === dbName) {
      return this.notesDb;
    }
    // Reads don't take the write lock, so several can arrive while the DB is
    // still opening. Share one open: each extra one would fetch the vault key
    // again and leave its own connection open once the next replaced it.
    if (this.notesDbOpening?.dbName === dbName) {
      return this.notesDbOpening.promise;
    }
    const opening = { dbName, promise: this.openNotesDb(userId, dbName) };
    this.notesDbOpening = opening;
    try {
      return await opening.promise;
    } finally {
      if (this.notesDbOpening === opening) this.notesDbOpening = null;
    }
  }

  private async openNotesDb(userId: string | null, dbName: string): Promise<QCDb | null> {
    if (this.notesDb) {
      this.notesDb.close();
      this.notesDb = null;
      this.notesDbName = null;
    }

    if (this.notesDbOpenFailed) {
      // A guest stays on the fallback store for the rest of the session. A
      // signed-in user's open usually fails because the vault key couldn't
      // be fetched (offline, backend down), so retry after a pause instead
      // of staying locked until the page is reloaded.
      if (!userId || Date.now() < this.notesDbRetryAt) return null;
      this.notesDbOpenFailed = false;
    }

    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      this.notesDbOpenFailed = true;
      return null;
    }

    this.notesDbLocked = false;

    try {
      // A signed-in user's notes DB is always encrypted under the vault
      // scheme: a validated device session token buys the server-held KEK.
      let sessionToken: string | undefined;
      let kekBytes: Uint8Array | undefined;
      if (userId) {
        sessionToken = this.getDeviceSessionToken(userId) ?? undefined;
        if (!sessionToken) {
          throw new Error('Device session token is required to open encrypted notes database');
        }
        // Validating the token and fetching the vault key both need the
        // device fingerprint — compute it once.
        const fingerprint = await getDeviceFingerprint();
        const validToken = fingerprint ? await validateDeviceSessionToken(sessionToken) : false;
        if (!validToken) {
          this.setDeviceSessionToken(userId, null);
          throw new Error('Invalid or expired device session token');
        }
        kekBytes = (await fetchVaultKey(sessionToken, fingerprint)) ?? undefined;
      }

      this.notesDb = await QCRuntime.open(
        dbName,
        [this.noteStoreSchema],
        1,
        undefined,
        sessionToken,
        kekBytes,
      );
      this.notesDbName = dbName;
      this.notesDbOpenFailed = false;
      if (!userId) {
        try {
          await this.absorbLegacyGuestNotes(this.notesDb);
        } catch (e) {
          console.warn('[NoteStorage] 合并旧存储中的访客笔记失败，已保留原数据', e);
        }
      }
      return this.notesDb;
    } catch (e) {
      console.warn('[NoteStorage] QCRuntime.open failed', e);
      this.notesDbOpenFailed = true;
      // A signed-in user has no fallback store, so any failure to open their
      // encrypted DB — offline, bad token, a KEK that no longer unwraps the
      // DEK — means their notes are unreachable, not that there are none.
      // (A guest falls back to the plaintext legacy key/value store.)
      if (userId) {
        this.notesDbLocked = true;
        this.notesDbRetryAt = Date.now() + NOTES_DB_RETRY_MS;
      }
      return null;
    }
  }

  /**
   * Moves notes from the guest's legacy key/value store into the guest notes
   * DB. Notes land there when the DB couldn't be opened (the guest fallback)
   * or were written by older versions; without this they stay invisible
   * until sign-in. The legacy copy is emptied only after the DB accepted
   * them, and notes the DB already has are left alone.
   */
  private async absorbLegacyGuestNotes(db: QCDb): Promise<void> {
    const key = this.getNamespacedKey('STORAGE', null);
    const legacy = await this.readNotesFromKey(key);
    if (legacy.length === 0) return;
    const store = this.noteStoreSchema.name;
    const existingIds = new Set((await db.find<NoteItem>(store, {})).map((n) => n.id));
    const incoming = legacy.filter((n) => !existingIds.has(n.id)).map((n) => normalizeNote(n));
    if (incoming.length > 0) {
      await db.bulkWrite(store, incoming, []);
      Indexer.invalidateIndex();
    }
    await this.writeStoredValue(key, []);
  }

  /**
   * Runs `task` against the guest notes DB through a separate handle, so the
   * signed-in user's `this.notesDb` is never swapped out from under
   * concurrent reads.
   */
  private async withGuestDb<T>(task: (db: QCDb) => Promise<T>): Promise<T> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      throw new Error('IndexedDB unavailable');
    }
    const guestDb = await QCRuntime.open(this.getNotesDbName(null), [this.noteStoreSchema], 1);
    try {
      return await task(guestDb);
    } finally {
      await guestDb.close().catch(() => {});
    }
  }

  private async readGuestNotesAsync(): Promise<NoteItem[]> {
    if (this.currentUserId === null) {
      // ensureNotesDb() already points at the guest DB
      return this.loadNotesAsync();
    }
    return this.withGuestDb((db) => db.find<NoteItem>(this.noteStoreSchema.name, {}));
  }

  private async clearGuestNotesAsync(): Promise<void> {
    try {
      await this.withGuestDb((db) => db.clear(this.noteStoreSchema.name));
    } catch (e) {
      console.warn('[NoteStorage] clearGuestNotesAsync failed', e);
    }
  }

  private encryptText(plain: string, passphrase: string): Promise<string> {
    return encryptText(plain, passphrase);
  }

  private decryptText(encryptedBase64: string, passphrase: string): Promise<string> {
    return decryptText(encryptedBase64, passphrase);
  }

  private decryptConfigSecret(
    value: string,
    vaultKeyStorageKey: string,
    legacyPassphrase: string,
  ): Promise<{ value: string; needsReencrypt: boolean }> {
    return decryptConfigSecret(value, vaultKeyStorageKey, legacyPassphrase);
  }

  private encryptConfigSecret(plain: string, vaultKeyStorageKey: string): Promise<string> {
    return encryptConfigSecret(plain, vaultKeyStorageKey);
  }

  private async requireUserDb(): Promise<QCDb> {
    const db = await this.ensureNotesDb();
    if (!db) throw new NoteStorageError(LOCKED_MESSAGE, 'locked');
    return db;
  }

  /**
   * For a signed-in user, encrypts `value` with their notes-DB key before it
   * goes into the plain key/value store. Anything that holds note content or
   * unlocks it (conflicts, sync state, sync credentials, search caches) must
   * be no easier to read than the notes. A guest's notes are plaintext by
   * design, so their data is returned as-is.
   */
  private async sealForUser<T>(value: T): Promise<T | SealedValue> {
    if (!this.currentUserId) return value;
    return { [SEALED_FIELD]: await (await this.requireUserDb()).seal(value) };
  }

  /** Inverse of sealForUser; unsealed (legacy plaintext) values pass through. */
  private async unsealForUser<T>(stored: unknown): Promise<T | null> {
    if (stored === null || stored === undefined) return null;
    if (isSealedValue(stored)) {
      return (await this.requireUserDb()).unseal<T>(stored[SEALED_FIELD]);
    }
    return stored as T;
  }

  /**
   * sealForUser for callers outside NoteStorage that keep their own
   * per-user secrets (e.g. AI settings). Throws NoteStorageError('locked')
   * while a signed-in user's device is locked.
   */
  sealForCurrentUser<T>(value: T): Promise<T | SealedValue> {
    return this.sealForUser(value);
  }

  unsealForCurrentUser<T>(stored: unknown): Promise<T | null> {
    return this.unsealForUser<T>(stored);
  }

  /** Raw read from the key/value store: IndexedDB if enabled, else localStorage. */
  private async readKeyValue(key: string): Promise<unknown> {
    if (this.useIndexedDB) {
      const data = await IDB.getItem(key);
      if (data) return data;
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }

  /** Write to IndexedDB (enabling it on first success), else localStorage. */
  private async writeKeyValue(key: string, value: unknown): Promise<void> {
    if (this.useIndexedDB) {
      await IDB.setItem(key, value);
      return;
    }
    try {
      await IDB.setItem(key, value);
      this.useIndexedDB = true;
      localStorage.removeItem(key);
    } catch {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  /**
   * Reads a sync config. A signed-in user's config is sealed as a whole; a
   * guest's has its `secretFields` encrypted with the per-device key. Configs
   * in an older format (device-key or legacy-passphrase fields, plaintext
   * secrets, or not yet sealed for a signed-in user) are re-saved in the
   * current one.
   */
  private async readSyncConfig<T extends object>(
    key: string,
    secretFields: (keyof T & string)[],
    vaultKeyStorageKey: string,
    legacyPassphrase: string,
    write: (config: T) => Promise<boolean>,
  ): Promise<T | null> {
    const stored = await this.readKeyValue(key);
    if (!stored) return null;
    if (isSealedValue(stored)) return this.unsealForUser<T>(stored);

    const config = { ...(stored as T) } as Record<string, unknown>;
    let needsRewrite = Boolean(this.currentUserId);
    for (const field of secretFields) {
      const value = config[field];
      if (typeof value !== 'string' || !value) continue;
      if (!value.startsWith('encrypted:')) {
        needsRewrite = true; // a secret stored in plaintext
        continue;
      }
      try {
        const result = await this.decryptConfigSecret(value, vaultKeyStorageKey, legacyPassphrase);
        config[field] = result.value;
        needsRewrite = needsRewrite || result.needsReencrypt;
      } catch (e) {
        console.warn(`[NoteStorage] Failed to decrypt config field ${field}`, e);
      }
    }
    if (needsRewrite) {
      await write(config as T).catch((err) => {
        console.warn('[NoteStorage] Failed to migrate config encryption', err);
      });
    }
    return config as T;
  }

  private async writeSyncConfig<T extends object>(
    key: string,
    config: T,
    secretFields: (keyof T & string)[],
    vaultKeyStorageKey: string,
  ): Promise<void> {
    let toStore: unknown;
    if (this.currentUserId) {
      // Throws while the device is locked rather than falling back to a
      // weaker encryption.
      toStore = await this.sealForUser(config);
    } else {
      const fields = { ...config } as Record<string, unknown>;
      for (const field of secretFields) {
        const value = fields[field];
        if (typeof value !== 'string' || !value || value.startsWith('encrypted:')) continue;
        try {
          fields[field] = await this.encryptConfigSecret(value, vaultKeyStorageKey);
        } catch (e) {
          console.warn(
            `[NoteStorage] Failed to encrypt config field ${field}, storing plaintext`,
            e,
          );
        }
      }
      toStore = fields;
    }
    await this.writeKeyValue(key, toStore);
  }

  async setCurrentUser(userId: string | null): Promise<void> {
    this.userGenerationCounter++;
    // Queued behind any in-flight save so a mutation can never read one
    // user's notes and write them into another user's DB.
    return this.runExclusive(async () => {
      this.currentUserId = userId;
      this.updateNamespacedKeys();

      if (this.notesDb) {
        this.notesDb.close();
        this.notesDb = null;
        this.notesDbName = null;
      }
      this.notesDbOpenFailed = false;
      this.notesDbLocked = false;

      if (this.currentUserId) {
        try {
          await this.ensureNotesDb();
        } catch (err) {
          console.warn('[NoteStorage] setCurrentUser failed to initialize notes DB', err);
        }
      }
    });
  }

  /**
   * Moves guest notes into the signed-in user's store. The guest copy is only
   * cleared after the user's store has durably accepted the notes; on any
   * failure both copies are left as they were, and a retry is idempotent.
   */
  async migrateGuestDataToUser(): Promise<boolean> {
    const userId = this.currentUserId;
    if (!userId) {
      return false;
    }

    let guestNotes: NoteItem[];
    try {
      const legacyGuestStorageKey = this.getNamespacedKey('STORAGE', null);
      const legacyNotes = await this.readNotesFromKey(legacyGuestStorageKey);
      const runtimeNotes = await this.readGuestNotesAsync();
      guestNotes = [...legacyNotes, ...runtimeNotes];
    } catch (e) {
      console.warn('[NoteStorage] 读取访客笔记失败，跳过迁移', e);
      return false;
    }

    if (guestNotes.length === 0) {
      return false;
    }

    try {
      await this.mutateNotes((current) => {
        const existingIds = new Set(current.map((n) => n.id));
        const incoming = guestNotes
          .filter((note) => !existingIds.has(note.id))
          .map((note) => ({ ...note, ownerId: userId }));
        return incoming.length > 0 ? [...current, ...incoming] : null;
      });
    } catch (e) {
      console.warn('[NoteStorage] 访客笔记写入账号失败，保留访客数据', e);
      return false;
    }

    await this.clearGuestNamespace();
    await this.clearGuestNotesAsync();
    return true;
  }

  private async clearGuestNamespace(): Promise<void> {
    const guestKeys = [
      this.getNamespacedKey('STORAGE', null),
      this.getNamespacedKey('SETTINGS', null),
      this.getNamespacedKey('WEBDAV_CONFIG', null),
      this.getNamespacedKey('CONFLICTS', null),
    ];

    if (this.useIndexedDB) {
      for (const key of guestKeys) {
        await IDB.deleteItem(key);
      }
    }
    guestKeys.forEach((key) => localStorage.removeItem(key));
  }

  /**
   * Reads a raw value from the legacy key/value store. Unlike a missing key
   * (null), an IndexedDB or parse error is thrown: callers write the result
   * back, so treating "unreadable" as "empty" would erase the data.
   */
  private async readStoredValue<T>(key: string): Promise<T | null> {
    if (this.useIndexedDB) {
      const item = await IDB.getItem<T>(key);
      if (item !== undefined && item !== null) {
        return item;
      }
    }
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  private async writeStoredValue<T>(key: string, value: T): Promise<void> {
    if (this.useIndexedDB) {
      await IDB.setItem(key, value);
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }

  /**
   * Plaintext notes stored under a legacy key (guest fallback when IndexedDB
   * is unavailable, or data from older versions); [] if the key is absent,
   * throws if it can't be read.
   */
  private async readNotesFromKey(key: string): Promise<NoteItem[]> {
    const stored = await this.readStoredValue<unknown>(key);
    if (!stored) return [];
    if (Array.isArray(stored)) {
      return stored as NoteItem[];
    }
    throw new Error(`Unrecognized notes payload under ${key}`);
  }

  private async storeNotesByKey(key: string, notes: NoteItem[]): Promise<void> {
    if (this.currentUserId) {
      // Never write a signed-in user's notes in plaintext; their only store
      // is the encrypted notes DB.
      throw new Error('Plaintext fallback store is guest-only');
    }
    await this.writeStoredValue(key, notes);
  }

  async getWebDAVConfigAsync(): Promise<WebDAVConfig | null> {
    try {
      return await this.readSyncConfig<WebDAVConfig>(
        this.webdavConfigKey,
        WEBDAV_SECRET_FIELDS,
        WEBDAV_VAULT_KEY_STORAGE_KEY,
        LEGACY_WEBDAV_PASSPHRASE,
        (config) => this.setWebDAVConfigAsync(config),
      );
    } catch (e) {
      console.error('[NoteStorage] getWebDAVConfigAsync failed', e);
      return null;
    }
  }

  async setWebDAVConfigAsync(config: WebDAVConfig): Promise<boolean> {
    try {
      await this.writeSyncConfig(
        this.webdavConfigKey,
        config,
        WEBDAV_SECRET_FIELDS,
        WEBDAV_VAULT_KEY_STORAGE_KEY,
      );
      return true;
    } catch (e) {
      console.error('[NoteStorage] setWebDAVConfigAsync failed', e);
      return false;
    }
  }

  async getOneDriveConfigAsync(): Promise<OneDriveConfig | null> {
    try {
      return await this.readSyncConfig<OneDriveConfig>(
        this.oneDriveConfigKey,
        ONEDRIVE_SECRET_FIELDS,
        ONEDRIVE_VAULT_KEY_STORAGE_KEY,
        LEGACY_ONEDRIVE_PASSPHRASE,
        (config) => this.setOneDriveConfigAsync(config),
      );
    } catch (e) {
      console.error('[NoteStorage] getOneDriveConfigAsync failed', e);
      return null;
    }
  }

  async setOneDriveConfigAsync(config: OneDriveConfig): Promise<boolean> {
    try {
      await this.writeSyncConfig(
        this.oneDriveConfigKey,
        config,
        ONEDRIVE_SECRET_FIELDS,
        ONEDRIVE_VAULT_KEY_STORAGE_KEY,
      );
      return true;
    } catch (e) {
      console.error('[NoteStorage] setOneDriveConfigAsync failed', e);
      return false;
    }
  }

  async clearOneDriveConfigAsync(): Promise<boolean> {
    try {
      if (this.useIndexedDB) {
        await IDB.setItem(this.oneDriveConfigKey, null);
      }
      localStorage.removeItem(this.oneDriveConfigKey);
      return true;
    } catch (e) {
      console.error('[NoteStorage] clearOneDriveConfigAsync failed', e);
      return false;
    }
  }

  async clearWebDAVConfigAsync(): Promise<boolean> {
    try {
      if (this.useIndexedDB) {
        await IDB.setItem(this.webdavConfigKey, null);
      }
      localStorage.removeItem(this.webdavConfigKey);
      return true;
    } catch (e) {
      console.error('[NoteStorage] clearWebDAVConfigAsync failed', e);
      return false;
    }
  }

  /**
   * Reads the conflict list, throwing if it can't be read. Use this (never
   * getConflictsAsync) for anything that writes the list back: treating
   * "unreadable" as "no conflicts" would erase them.
   */
  private async readConflicts(): Promise<NoteConflict[]> {
    const stored = await this.readKeyValue(this.conflictsKey);
    const conflicts = (await this.unsealForUser<NoteConflict[]>(stored)) ?? [];
    if (this.currentUserId && stored && !isSealedValue(stored)) {
      // Conflicts hold full copies of both notes: never leave them in
      // plaintext for a signed-in user.
      await this.setConflictsAsync(conflicts);
    }
    return conflicts;
  }

  private async writeConflicts(conflicts: NoteConflict[]): Promise<void> {
    await this.writeKeyValue(this.conflictsKey, await this.sealForUser(conflicts));
  }

  /**
   * Display-only convenience: like readConflicts but logs and returns [] on
   * failure. Never write back what this returns.
   */
  async getConflictsAsync(): Promise<NoteConflict[]> {
    try {
      return await this.readConflicts();
    } catch (e) {
      console.error('[NoteStorage] getConflictsAsync failed', e);
      return [];
    }
  }

  async setConflictsAsync(conflicts: NoteConflict[]): Promise<boolean> {
    try {
      await this.writeConflicts(conflicts);
      return true;
    } catch (e) {
      console.error('[NoteStorage] setConflictsAsync failed', e);
      return false;
    }
  }

  // The conflict list is read-modify-written under the write lock, like
  // runSync's updates to it: otherwise a sync landing between our read and
  // write would have its new conflicts overwritten.

  async addConflictAsync(conflict: NoteConflict): Promise<boolean> {
    return this.runExclusive(async () => {
      try {
        const conflicts = await this.readConflicts();
        conflicts.push(conflict);
        await this.writeConflicts(conflicts);
        return true;
      } catch (e) {
        console.error('[NoteStorage] addConflictAsync failed', e);
        return false;
      }
    });
  }

  async resolveConflictAsync(id: string, resolvedNote: NoteItem): Promise<boolean> {
    return this.runExclusive(async () => {
      let conflicts: NoteConflict[];
      try {
        conflicts = await this.readConflicts();
      } catch (e) {
        console.error('[NoteStorage] resolveConflictAsync failed', e);
        return false;
      }
      if (!conflicts.some((c) => c.id === id)) return false;
      // Save the note first: if that fails the conflict stays listed so the
      // user can retry, instead of the resolution being silently dropped.
      try {
        await this.mutateNotesUnlocked((notes) => {
          const noteIndex = notes.findIndex((n) => n.id === id);
          if (noteIndex !== -1) {
            notes[noteIndex] = resolvedNote;
          } else {
            notes.push(resolvedNote);
          }
          return notes;
        });
      } catch (e) {
        console.error('[NoteStorage] resolveConflictAsync failed', e);
        return false;
      }
      return this.setConflictsAsync(conflicts.filter((c) => c.id !== id));
    });
  }

  /**
   * Explicit "overwrite the remote with this device's notes" (the 上传
   * button). Unlike syncWithWebDAVAsync it discards remote-only changes, so
   * it is only for when the user asks for exactly that.
   */
  async pushToWebDAVAsync(config: WebDAVConfig, encrypt = true): Promise<boolean> {
    if (typeof fetch !== 'function' || typeof window === 'undefined') {
      console.warn('[NoteStorage] WebDAV 仅在浏览器环境支持');
      return false;
    }

    // `config` is the current user's: never push another session's notes to it.
    const generation = this.userGenerationCounter;
    try {
      // Strict read: pushing an empty list after a failed read would wipe
      // the remote copy.
      const allNotes = await this.loadNotesAsync();
      let payload = JSON.stringify(allNotes);
      if (encrypt && config.encryptionKey && config.encryptionKey.length > 0) {
        payload = await this.encryptText(payload, config.encryptionKey);
      }
      if (generation !== this.userGenerationCounter) throw new UserChangedError();
      const url = normalizeWebDAVUrl(config);
      const response = await webdavFetch('PUT', url, config, payload);
      if (!response.ok) return false;
      // Both sides now hold exactly these notes.
      const hashes = Object.fromEntries(allNotes.map((n) => [n.id, noteSyncHash(n)]));
      await this.runForGeneration(generation, () =>
        this.writeSyncBase('webdav', { remoteId: webdavTransport(config).remoteId, hashes }),
      );
      return true;
    } catch (e) {
      if (e instanceof UserChangedError) {
        console.warn('[NoteStorage] WebDAV 上传期间切换了用户，已中止');
        return false;
      }
      console.error('[NoteStorage] pushToWebDAVAsync failed', e);
      return false;
    }
  }

  /** Merges remote changes into this device without uploading anything. */
  async pullFromWebDAVAsync(config: WebDAVConfig, decrypt = true): Promise<boolean> {
    if (typeof fetch !== 'function' || typeof window === 'undefined') {
      console.warn('[NoteStorage] WebDAV 仅在浏览器环境支持');
      return false;
    }
    return this.runSync('webdav', webdavTransport(config), {
      key: decrypt ? config.encryptionKey : undefined,
      strategy: config.conflictStrategy ?? 'manual',
      upload: false,
    });
  }

  /** Two-way sync: download, three-way merge, save locally, conditionally upload. */
  async syncWithWebDAVAsync(config: WebDAVConfig, encrypt = true): Promise<boolean> {
    if (typeof fetch !== 'function' || typeof window === 'undefined') {
      console.warn('[NoteStorage] WebDAV 仅在浏览器环境支持');
      return false;
    }
    return this.runSync('webdav', webdavTransport(config), {
      key: encrypt ? config.encryptionKey : undefined,
      strategy: config.conflictStrategy ?? 'manual',
      upload: true,
    });
  }

  private semanticCacheKey(): string {
    return this.getNamespacedKey('SEMANTIC_CACHE', this.currentUserId);
  }

  /** Per-user, sealed for signed-in users (embeddings reveal what notes are about). */
  async loadSemanticCache(): Promise<SemanticEmbeddingCache | null> {
    try {
      return await this.unsealForUser<SemanticEmbeddingCache>(
        await IDB.getItem(this.semanticCacheKey()),
      );
    } catch (e) {
      console.warn('[NoteStorage] loadSemanticCache failed', e);
      return null;
    }
  }

  async saveSemanticCache(cache: SemanticEmbeddingCache): Promise<void> {
    await IDB.setItem(this.semanticCacheKey(), await this.sealForUser(cache));
  }

  private syncBaseKey(provider: 'webdav' | 'onedrive'): string {
    return this.getNamespacedKey(`SYNC_BASE_${provider.toUpperCase()}`, this.currentUserId);
  }

  private async readSyncBase(provider: 'webdav' | 'onedrive', remoteId: string) {
    // Sealed: the per-note hashes are short enough to dictionary-attack.
    const stored = await this.unsealForUser<SyncBase>(
      await this.readStoredValue<unknown>(this.syncBaseKey(provider)),
    );
    // A base recorded against another file says nothing about this one.
    return stored && stored.remoteId === remoteId ? stored.hashes : null;
  }

  private async writeSyncBase(provider: 'webdav' | 'onedrive', base: SyncBase): Promise<void> {
    await this.writeStoredValue(this.syncBaseKey(provider), await this.sealForUser(base));
  }

  /**
   * One sync round trip against `transport`, retried if another device
   * uploads in between:
   *   1. download; abort unless the file is absent or readable (never
   *      overwrite what we couldn't read);
   *   2. three-way merge against the base, inside the notes write lock, and
   *      save the local result;
   *   3. upload, conditional on the remote being unchanged since step 1;
   *   4. record the new base.
   * Returns false (leaving the remote untouched) on any failure.
   */
  private async runSync(
    provider: 'webdav' | 'onedrive',
    transport: SyncTransport,
    opts: { key?: string; strategy: SyncStrategy; upload: boolean },
  ): Promise<boolean> {
    // `transport` and `key` come from the current user's sync config: if the
    // user changes before we write, this download belongs to someone else.
    const generation = this.userGenerationCounter;
    const key = opts.key || undefined;
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const snapshot = await transport.get();
        if (!snapshot && !opts.upload) {
          // a pull with nothing to pull is almost always a wrong path
          console.warn(`[NoteStorage] ${provider} 远程文件不存在`);
          return false;
        }
        let remoteNotes: NoteItem[] = [];
        if (snapshot) {
          const parsed = await this.parseRemoteNotes(snapshot.body, key);
          if (!parsed) {
            console.warn(
              `[NoteStorage] ${provider} 远程文件无法解密或解析，已中止同步以免覆盖远端`,
            );
            return false;
          }
          remoteNotes = parsed;
        }

        // Base, merge, conflicts and the new base are read and written in
        // one locked step, so they all land in the store of the user this
        // sync started for.
        const result = await this.runForGeneration(generation, async () => {
          const storedBase = await this.readSyncBase(provider, transport.remoteId);
          const base = applicableBase(storedBase, snapshot ? remoteNotes : null);
          if (storedBase && !base) {
            console.warn(
              `[NoteStorage] ${provider} 远程文件不存在或与上次同步的不是同一个，按首次同步合并（不删除任何笔记）`,
            );
          }
          // Strict reads/writes: merging without knowing which notes are in
          // conflict would overwrite them, and a base recorded without its
          // conflicts would make the next sync upload over the remote edit.
          const pending = new Set((await this.readConflicts()).map((c) => c.id));
          const merged: { result?: ThreeWayMergeResult } = {};
          await this.mutateNotesUnlocked((localNotes) => {
            merged.result = threeWayMerge({
              local: localNotes,
              remote: remoteNotes,
              base,
              pending,
              strategy: opts.strategy,
            });
            return syncLinkGraph(merged.result.nextLocal);
          });
          const mergeResult = merged.result;
          if (!mergeResult) return null;

          if (mergeResult.conflicts.length > 0) {
            const newIds = new Set(mergeResult.conflicts.map((c) => c.id));
            const existing = await this.readConflicts();
            await this.writeConflicts([
              ...existing.filter((c) => !newIds.has(c.id)),
              ...mergeResult.conflicts,
            ]);
          }
          await this.writeSyncBase(provider, {
            remoteId: transport.remoteId,
            hashes: mergeResult.baseAfterLocal,
          });
          return mergeResult;
        });
        if (!result) return false;

        if (!opts.upload) return true;
        // Uploading is still safe after a switch (it's this user's merged
        // data going to this user's remote), but skip it: nothing would
        // record the new base for it.
        if (generation !== this.userGenerationCounter) throw new UserChangedError();
        if (result.remoteChanged) {
          let payload = JSON.stringify(result.nextRemote);
          if (key) payload = await this.encryptText(payload, key);
          if ((await transport.put(payload, snapshot)) === 'conflict') {
            console.info(`[NoteStorage] ${provider} 远端在同步期间被修改，重试 (${attempt})`);
            continue;
          }
        }
        await this.runForGeneration(generation, () =>
          this.writeSyncBase(provider, {
            remoteId: transport.remoteId,
            hashes: result.baseAfterUpload,
          }),
        );
        return true;
      }
      console.warn(`[NoteStorage] ${provider} 远端持续被修改，放弃本次同步`);
      return false;
    } catch (e) {
      if (e instanceof UserChangedError) {
        console.warn(`[NoteStorage] ${provider} 同步期间切换了用户，已中止，未写入任何数据`);
        return false;
      }
      console.error(`[NoteStorage] ${provider} 同步失败`, e);
      return false;
    }
  }

  async enableIndexedDB() {
    if (typeof window === 'undefined') return false;
    if (this.useIndexedDB) return true; // 已启用，跳过
    try {
      const existing = await IDB.getItem(this.storageKey);
      if (existing !== undefined && existing !== null) {
        this.useIndexedDB = true;
        logger.info('✓ IndexedDB 已有数据，保留现有数据，启用索引存储');
        return true;
      }

      // 否则从 localStorage 迁移（如果有）
      const raw = localStorage.getItem(this.storageKey);
      const settingsRaw = localStorage.getItem(this.settingsKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // init() seeds an empty list on every load; backing that up would
          // leave a new empty backup key behind each time.
          if (!(Array.isArray(parsed) && parsed.length === 0)) {
            const backupKey = `${this.storageKey}_backup_${Date.now()}`;
            await IDB.setItem(backupKey, parsed);
            logger.info('✓ 本地数据已备份到 IndexedDB 键：', backupKey);
          }
          await IDB.setItem(this.storageKey, parsed);
          if (settingsRaw) {
            try {
              const parsedSettings = JSON.parse(settingsRaw);
              await IDB.setItem(this.settingsKey, parsedSettings);
            } catch {
              // ignore settings parse issues
            }
          }
          this.useIndexedDB = true;
          localStorage.removeItem(this.storageKey);
          localStorage.removeItem(this.settingsKey);
          logger.info('✓ IndexedDB 已启用，数据迁移成功');
          return true;
        } catch (err) {
          logger.warn('[NoteStorage] 本地数据迁移到 IndexedDB 失败，继续启用 IndexedDB：', err);
        }
      }

      this.useIndexedDB = true;
      logger.info('✓ IndexedDB 已启用（无需迁移）');
      return true;
    } catch (e: unknown) {
      console.error('启用IndexedDB失败:', e);
      return false;
    }
  }

  // disable IndexedDB usage (keeps data in place)
  disableIndexedDB() {
    this.useIndexedDB = false;
  }

  /**
   * Reads all notes, throwing NoteStorageError if they can't be read. Use this
   * (never getDataAsync) for anything whose result may be written back or
   * exported.
   */
  async loadNotesAsync(): Promise<NoteItem[]> {
    const notesDb = await this.ensureNotesDb();
    return this.readNotes(notesDb);
  }

  /**
   * Display-only convenience: like loadNotesAsync but logs and returns [] on
   * failure. Never write back what this returns.
   */
  async getDataAsync(): Promise<NoteItem[] | null> {
    try {
      return await this.loadNotesAsync();
    } catch (e) {
      console.error('读取存储失败:', e);
      return [];
    }
  }

  private async readNotes(notesDb: QCDb | null): Promise<NoteItem[]> {
    try {
      if (notesDb) {
        const records = await notesDb.find<NoteItem>(this.noteStoreSchema.name, {});
        // Records that don't decrypt are quarantined: left out here, so they
        // are never shown, synced, rewritten or deleted by a mutation (which
        // only touches notes it read), and stay intact for later recovery.
        const readable = records.filter(
          (r) => !(r as unknown as Record<string, unknown>)[UNDECRYPTABLE_MARKER],
        );
        this.undecryptableCount = records.length - readable.length;
        return readable.map((note) => normalizeNote(note));
      }
      if (this.notesDbLocked) {
        throw new NoteStorageError(LOCKED_MESSAGE, 'locked');
      }
      this.undecryptableCount = 0;
      const notes = await this.readNotesFromKey(this.storageKey);
      return notes.map((note) => normalizeNote(note));
    } catch (e) {
      if (e instanceof NoteStorageError) throw e;
      throw new NoteStorageError('读取笔记失败', 'read', { cause: e });
    }
  }

  /**
   * The single read-modify-write path for notes. Serialized with other
   * mutations in this tab; reads strictly (a failed read aborts instead of
   * looking like an empty store); writes only the notes that changed, all in
   * one IndexedDB transaction. `mutate` may edit the array in place and
   * returns the new full list, or null to skip writing.
   *
   * Throws NoteStorageError if the notes can't be read or the write fails;
   * in either case storage is left unchanged.
   */
  private mutateNotes(
    mutate: (notes: NoteItem[]) => NoteItem[] | null,
  ): Promise<NoteItem[] | null> {
    return this.runExclusive(() => this.mutateNotesUnlocked(mutate));
  }

  /** mutateNotes body; the caller must already hold the write lock. */
  private async mutateNotesUnlocked(
    mutate: (notes: NoteItem[]) => NoteItem[] | null,
  ): Promise<NoteItem[] | null> {
    // Read and write through the same handle: setCurrentUser is queued
    // behind us, so the target DB can't change mid-mutation.
    const notesDb = await this.ensureNotesDb();
    const current = await this.readNotes(notesDb);
    const before = new Map(current.map((note) => [note.id, JSON.stringify(note)]));

    const result = mutate(current);
    if (!result) return null;
    const next = result.map((note) => normalizeNote(note));

    try {
      if (notesDb) {
        const nextIds = new Set(next.map((note) => note.id));
        const puts = next.filter((note) => before.get(note.id) !== JSON.stringify(note));
        const deletes = [...before.keys()].filter((id) => !nextIds.has(id));
        if (puts.length > 0 || deletes.length > 0) {
          await notesDb.bulkWrite(this.noteStoreSchema.name, puts, deletes);
        }
      } else {
        // Legacy store keeps all notes under one key, so this single
        // write is already all-or-nothing.
        await this.storeNotesByKey(this.storageKey, next);
      }
    } catch (e) {
      throw new NoteStorageError(
        this.notesDbLocked ? LOCKED_MESSAGE : '保存笔记失败：写入存储失败',
        this.notesDbLocked ? 'locked' : 'write',
        { cause: e },
      );
    }

    Indexer.invalidateIndex();
    return next;
  }

  /**
   * Applies `transform` to a fresh read of all notes and saves the result.
   * Prefer this over setDataAsync(list) when the list was derived from
   * notes read earlier (e.g. UI state), which may be stale by now.
   */
  async updateNotesAsync(transform: (notes: NoteItem[]) => NoteItem[]): Promise<NoteItem[]> {
    return (await this.mutateNotes(transform)) ?? [];
  }

  /**
   * Replaces all notes with `notes`. Returns false (and changes nothing) if
   * the current notes can't be read or the write fails.
   */
  async setDataAsync(notes: NoteItem[]): Promise<boolean> {
    try {
      await this.mutateNotes(() => notes);
      return true;
    } catch (e) {
      console.error('保存存储失败:', e);
      return false;
    }
  }

  init() {
    // 如果已启用 IndexedDB，跳过 localStorage 初始化
    // 因为数据已经在 IndexedDB 中了
    if (this.useIndexedDB) {
      return;
    }

    if (!localStorage.getItem(this.storageKey) && !this.currentUserId) {
      localStorage.setItem(this.storageKey, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.settingsKey)) {
      localStorage.setItem(
        this.settingsKey,
        JSON.stringify({
          theme: 'light',
          sortBy: 'date',
          itemsPerPage: 12,
          defaultCategory: '生活',
        }),
      );
    }
  }

  async getSettingsAsync(): Promise<UserSettings | null> {
    try {
      // 优先尝试 IndexedDB
      const idbSettings = await IDB.getItem(this.settingsKey);
      if (idbSettings) {
        this.useIndexedDB = true;
        return idbSettings as UserSettings;
      }
      // IndexedDB 无数据，尝试 localStorage
      const settings = localStorage.getItem(this.settingsKey);
      return settings ? (JSON.parse(settings) as UserSettings) : null;
    } catch (e) {
      console.error('读取设置失败:', e);
      const settings = localStorage.getItem(this.settingsKey);
      return settings ? (JSON.parse(settings) as UserSettings) : null;
    }
  }

  async setSettingsAsync(settings: UserSettings) {
    try {
      if (this.useIndexedDB) {
        await IDB.setItem(this.settingsKey, settings);
        return true;
      }
      // 尝试写入 IndexedDB
      try {
        await IDB.setItem(this.settingsKey, settings);
        this.useIndexedDB = true;
        localStorage.removeItem(this.settingsKey);
        return true;
      } catch (_) {
        // fallback to localStorage
        localStorage.setItem(this.settingsKey, JSON.stringify(settings));
        return true;
      }
    } catch (e) {
      console.error('保存设置失败:', e);
      return false;
    }
  }

  // The mutation methods below throw NoteStorageError when the change could
  // not be saved, so callers never mistake an unsaved edit for a saved one.

  async addNoteAsync(note: Partial<NoteItem>): Promise<NoteItem> {
    const rawTitle = note.title || '无标题';
    const rawContent = note.content || '';
    const sentimentData = SentimentUtil.analyzeEmotion(`${rawTitle} ${rawContent}`);
    const sentimentCategory = SentimentUtil.getSentimentCategory(
      sentimentData.score,
      sentimentData.comparative,
    );

    const newNote: NoteItem = {
      id: `note_${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`,
      title: rawTitle,
      content: rawContent,
      category: note.category || '生活',
      tags: note.tags || [],
      color: note.color || '#dc96b4',
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isArchived: false,
      links: [],
      backlinks: [],
      versions: [],
      sentimentScore: sentimentData.score,
      sentimentComparative: sentimentData.comparative,
      sentimentCategory,
    };

    const saved = await this.mutateNotes((notes) => syncLinkGraph([newNote, ...notes]));
    return saved?.find((n) => n.id === newNote.id) as NoteItem;
  }

  async updateNoteAsync(id: string, updates: Partial<NoteItem>): Promise<NoteItem | null> {
    const saved = await this.mutateNotes((notes) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index === -1) return null;
      const existing = notes[index];
      const version: NoteVersion = {
        versionId: `ver_${Date.now()}`,
        title: existing.title,
        content: existing.content,
        category: existing.category,
        tags: [...existing.tags],
        color: existing.color,
        isFavorite: existing.isFavorite,
        isArchived: existing.isArchived,
        updatedAt: existing.updatedAt,
      };
      const updatedVersionList = [...(existing.versions || []), version].slice(-20);

      const updatedTitle = updates.title ?? existing.title;
      const updatedContent = updates.content ?? existing.content;
      const sentimentData = SentimentUtil.analyzeEmotion(`${updatedTitle} ${updatedContent}`);
      const sentimentCategory = SentimentUtil.getSentimentCategory(
        sentimentData.score,
        sentimentData.comparative,
      );

      notes[index] = {
        ...existing,
        ...updates,
        sentimentScore: sentimentData.score,
        sentimentComparative: sentimentData.comparative,
        sentimentCategory,
        updatedAt: Math.max(Date.now(), existing.updatedAt + 1),
        versions: updatedVersionList,
      };
      return syncLinkGraph(notes);
    });
    return saved?.find((n) => n.id === id) ?? null;
  }

  async deleteNoteAsync(id: string): Promise<boolean> {
    const saved = await this.mutateNotes((notes) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index === -1) return null;
      notes[index] = {
        ...notes[index],
        isDeleted: true,
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      };
      return syncLinkGraph(notes);
    });
    return saved !== null;
  }

  async permanentlyDeleteNoteAsync(id: string): Promise<boolean> {
    await this.mutateNotes((notes) => notes.filter((n) => n.id !== id));
    return true;
  }

  async restoreNoteAsync(id: string): Promise<boolean> {
    const saved = await this.mutateNotes((notes) => {
      const note = notes.find((n) => n.id === id);
      if (!note || !note.isDeleted) return null;
      note.isDeleted = false;
      note.deletedAt = undefined;
      note.updatedAt = Date.now();
      return syncLinkGraph(notes);
    });
    return saved !== null;
  }

  async getTrashNotesAsync() {
    const notes = (await this.getDataAsync()) || [];
    return notes.filter((n) => n.isDeleted);
  }

  async getNoteAsync(id: string) {
    const notes = (await this.getDataAsync()) || [];
    return notes.find((n) => n.id === id);
  }

  async searchNotesAsync(keyword?: string, includeDeleted = false) {
    const notes = (await this.getDataAsync()) || [];
    let filtered = notes;
    if (!includeDeleted) {
      filtered = filtered.filter((n) => !n.isDeleted);
    }
    if (!keyword) return filtered;

    return Utils.searchNotes(filtered, keyword);
  }

  async getNotesByCategoryAsync(category: string, includeDeleted = false) {
    const notes = (await this.getDataAsync()) || [];
    let filtered = notes;
    if (!includeDeleted) {
      filtered = filtered.filter((n) => !n.isDeleted);
    }
    if (category === 'all') return filtered;
    return filtered.filter((n) => n.category === category);
  }

  async getFavoriteNotesAsync() {
    const notes = (await this.getDataAsync()) || [];
    return notes.filter((n) => !n.isDeleted && n.isFavorite);
  }

  async toggleFavoriteAsync(id: string): Promise<boolean | null> {
    let favorite: boolean | null = null;
    await this.mutateNotes((notes) => {
      const note = notes.find((n) => n.id === id);
      if (!note) return null;
      note.isFavorite = !note.isFavorite;
      favorite = note.isFavorite;
      return notes;
    });
    return favorite;
  }

  async getCategoriesAsync() {
    const notes = (await this.getDataAsync()) || [];
    const categories = new Set(notes.map((n) => n.category));
    return Array.from(categories).sort();
  }

  async getAllTagsAsync() {
    const notes = (await this.getDataAsync()) || [];
    const tagsSet = new Set<string>();
    notes.forEach((note) => {
      note.tags.forEach((tag) => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }

  async exportToJSON() {
    // Strict: a backup silently containing [] is worse than an error.
    const notes = await this.loadNotesAsync();
    const dataStr = JSON.stringify(notes, null, 2);
    if (typeof window === 'undefined') return;
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `QCNOTE_backup_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async importFromJSON(file: File): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e: ProgressEvent<FileReader>) => {
        try {
          const result = e.target?.result as string;
          const importedNotes = JSON.parse(result);
          if (!Array.isArray(importedNotes)) {
            reject('无效的JSON格式');
            return;
          }

          let importedCount = 0;
          try {
            await this.mutateNotes((existingNotes) => {
              const existingIds = new Set(existingNotes.map((note) => note.id));
              const normalizedImportedNotes = importedNotes.map((note) => {
                const normalized = normalizeNote(note as NoteItem);
                // If note with same ID exists, generate new ID to avoid conflicts
                if (existingIds.has(normalized.id)) {
                  normalized.id = `${normalized.id}_imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                }
                return normalized;
              });
              importedCount = normalizedImportedNotes.length;
              return [...existingNotes, ...normalizedImportedNotes];
            });
          } catch (err) {
            reject(
              err instanceof NoteStorageError && err.kind === 'locked'
                ? `导入失败：${LOCKED_MESSAGE}`
                : '导入失败：写入存储失败',
            );
            return;
          }
          resolve(importedCount);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          reject('导入失败: ' + msg);
        }
      };
      reader.onerror = () => reject('读取文件失败');
      reader.readAsText(file);
    });
  }

  /**
   * Decodes a downloaded notes file, or returns null if it isn't one we can
   * read. With a key, a plaintext file is still accepted (a remote written
   * before encryption was turned on); ciphertext under another key is not.
   */
  private async parseRemoteNotes(raw: string, key?: string): Promise<NoteItem[] | null> {
    const parseArray = (text: string): NoteItem[] | null => {
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed.map((note) => normalizeNote(note as NoteItem)) : null;
      } catch {
        return null;
      }
    };
    if (key) {
      try {
        return parseArray(await this.decryptText(raw, key));
      } catch {
        // not encrypted with this key: fall through to the plaintext check
      }
    }
    return parseArray(raw);
  }

  async syncWithOneDriveAsync(config: OneDriveConfig, encrypt: boolean = true): Promise<boolean> {
    if (!config.accessToken || !config.folderPath) {
      console.warn('[NoteStorage] OneDrive 配置不完整');
      return false;
    }
    // OneDrive has no conflict-strategy setting; a note edited on both sides
    // keeps the newer edit and files the other under its version history.
    return this.runSync('onedrive', oneDriveTransport(config), {
      key: encrypt ? config.encryptionKey : undefined,
      strategy: 'newest',
      upload: true,
    });
  }

  async clearAllAsync() {
    if (typeof window === 'undefined') return false;
    return this.runExclusive(() => this.clearAllUnlocked());
  }

  private async clearAllUnlocked() {
    // Storage layer should not perform UI confirmation prompts.
    const keysToRemove = [
      this.storageKey,
      this.settingsKey,
      this.webdavConfigKey,
      this.conflictsKey,
      this.syncBaseKey('webdav'),
      this.syncBaseKey('onedrive'),
      this.semanticCacheKey(),
    ];

    try {
      const notesDb = await this.ensureNotesDb();
      if (notesDb) {
        await notesDb.clear(this.noteStoreSchema.name);
      }
    } catch (e) {
      logger.warn('[NoteStorage] clearAllAsync failed to clear notes DB', e);
    }

    if (this.useIndexedDB) {
      for (const key of keysToRemove) {
        await IDB.deleteItem(key);
      }
    } else {
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
    if (this.notesDb) {
      this.notesDb.close();
      this.notesDb = null;
      this.notesDbName = null;
      this.notesDbOpenFailed = false;
    }
    this.init();
    return true;
  }

  async getStatsAsync(): Promise<Stats> {
    const notes = (await this.getDataAsync()) || [];
    const aliveNotes = notes.filter((n) => !n.isDeleted);
    const categories = await this.getCategoriesAsync();
    const categoryStats: Record<string, number> = {};

    categories.forEach((cat) => {
      categoryStats[cat] = aliveNotes.filter((n) => n.category === cat).length;
    });

    return {
      totalNotes: aliveNotes.length,
      favoriteNotes: aliveNotes.filter((n) => n.isFavorite).length,
      archivedNotes: aliveNotes.filter((n) => n.isArchived).length,
      categories: categoryStats,
      totalTags: (await this.getAllTagsAsync()).length,
      createdToday: aliveNotes.filter((n) => {
        const today = new Date().toDateString();
        return new Date(n.createdAt).toDateString() === today;
      }).length,
    };
  }
}

export function initWindowStorage() {
  if (typeof window === 'undefined') return null;
  // 检查是否已经存在全局 storage，避免重复创建
  if (window.storage instanceof NoteStorage) {
    return window.storage;
  }
  const s = new NoteStorage();
  window.storage = s;
  // optionally expose Utils
  window.Utils = Utils;
  return s;
}

export default NoteStorage;

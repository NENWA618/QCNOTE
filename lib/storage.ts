import Utils from './utils';
import IDB from './idb';
import logger from './logger';
import Indexer, { type SemanticCacheStore, type SemanticEmbeddingCache } from './indexer';
import { type QCDb, UNDECRYPTABLE_MARKER } from '../qcruntime/qcnote-runtime';
import { downloadJSON, readFileAsText } from './storage/backupFile';
import { LOCKED_MESSAGE, NoteStorageError } from './storage/errors';
import { absorbLegacyGuestNotes, migrateGuestDataToUser } from './storage/guestMigration';
import { KeyValueStore } from './storage/keyValueStore';
import { normalizeNote, syncLinkGraph } from './storage/linkGraph';
import { STORAGE_KEY_PREFIX, namespacedKey } from './storage/namespace';
import {
  applyNoteUpdate,
  computeStats,
  createNote,
  listCategories,
  listTags,
  mergeImportedNotes,
} from './storage/noteOps';
import { NOTE_STORE_SCHEMA } from './storage/noteSchema';
import { NotesDbConnection } from './storage/notesDb';
import { oneDriveTransport, webdavTransport } from './storage/remoteSync';
import { SEALED_FIELD, isSealedValue, type SealedValue } from './storage/sealing';
import {
  ONEDRIVE_CONFIG_SPEC,
  WEBDAV_CONFIG_SPEC,
  readSyncConfig,
  writeSyncConfig,
  type SyncConfigStore,
} from './storage/syncConfig';
import type { SyncBase } from './storage/syncEngine';
import { pushToWebDAV, runSync, type SyncHost, type SyncProvider } from './storage/syncRunner';
import { UserChangedError, WriteLock } from './storage/writeLock';

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
export { NoteStorageError, isSealedValue, type SealedValue };
export { NOTES_DB_RETRY_MS } from './storage/notesDb';

/**
 * The single read/write entry point for notes and everything kept alongside
 * them (settings, sync configs, conflicts, sync bases, search caches), per
 * user. The mechanics live in ./storage/*; this class owns the per-user
 * namespace and makes sure every mutation goes through the write lock.
 */
export class NoteStorage implements SemanticCacheStore {
  storageKeyPrefix = STORAGE_KEY_PREFIX;
  storageKey!: string;
  settingsKey!: string;
  webdavConfigKey!: string;
  oneDriveConfigKey!: string;
  conflictsKey!: string;
  currentUserId: string | null;

  private readonly kv = new KeyValueStore();
  private readonly lock = new WriteLock();
  private readonly notesDb = new NotesDbConnection(this.storageKeyPrefix, (db) =>
    absorbLegacyGuestNotes(this.kv, this.getNamespacedKey('STORAGE', null), db),
  );

  /**
   * How many records in the notes DB couldn't be decrypted on the last read.
   * They are hidden and left untouched; UI code can surface the count.
   */
  undecryptableCount = 0;

  /** Whether the key/value store is IndexedDB (true) or localStorage. */
  get useIndexedDB(): boolean {
    return this.kv.useIndexedDB;
  }

  set useIndexedDB(value: boolean) {
    this.kv.useIndexedDB = value;
  }

  /**
   * True when the signed-in user's notes DB couldn't be unlocked (e.g. the
   * vault key couldn't be fetched offline). UI code can check this to show
   * "需要联网解锁" instead of implying notes were lost.
   */
  get notesDbLocked(): boolean {
    return this.notesDb.locked;
  }

  /** Bumped by every setCurrentUser() call; see runIfSameUser. */
  get userGeneration(): number {
    return this.lock.generation;
  }

  /**
   * Runs `task` under the write lock, unless the user changed since
   * `generation` (read from userGeneration); then it returns false without
   * running it. `task` must not itself take the lock (e.g. save notes).
   */
  async runIfSameUser(generation: number, task: () => Promise<unknown>): Promise<boolean> {
    try {
      await this.lock.runForGeneration(generation, task);
      return true;
    } catch (e) {
      if (e instanceof UserChangedError) return false;
      throw e;
    }
  }

  constructor() {
    this.currentUserId = null;
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

  private getNamespacedKey(baseKey: string, userId: string | null = null): string {
    return namespacedKey(this.storageKeyPrefix, baseKey, userId);
  }

  private updateNamespacedKeys() {
    this.storageKey = this.getNamespacedKey('STORAGE', this.currentUserId);
    this.settingsKey = this.getNamespacedKey('SETTINGS', this.currentUserId);
    this.webdavConfigKey = this.getNamespacedKey('WEBDAV_CONFIG', this.currentUserId);
    this.oneDriveConfigKey = this.getNamespacedKey('ONEDRIVE_CONFIG', this.currentUserId);
    this.conflictsKey = this.getNamespacedKey('CONFLICTS', this.currentUserId);
  }

  private ensureNotesDb(): Promise<QCDb | null> {
    return this.notesDb.ensure(this.currentUserId);
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

  private syncConfigStore(): SyncConfigStore {
    return {
      kv: this.kv,
      signedIn: Boolean(this.currentUserId),
      seal: (value) => this.sealForUser(value),
      unseal: (stored) => this.unsealForUser(stored),
    };
  }

  async setCurrentUser(userId: string | null): Promise<void> {
    this.lock.nextGeneration();
    // Queued behind any in-flight save so a mutation can never read one
    // user's notes and write them into another user's DB.
    return this.lock.run(async () => {
      this.currentUserId = userId;
      this.updateNamespacedKeys();
      this.notesDb.reset();

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
   * Moves guest notes, settings and sync configs into the signed-in user's
   * store; see ./storage/guestMigration.
   */
  async migrateGuestDataToUser(): Promise<boolean> {
    return migrateGuestDataToUser({
      kv: this.kv,
      notesDb: this.notesDb,
      currentUserId: () => this.currentUserId,
      guestKey: (baseKey) => this.getNamespacedKey(baseKey, null),
      accountKeys: () => ({
        settings: this.settingsKey,
        webdavConfig: this.webdavConfigKey,
        oneDriveConfig: this.oneDriveConfigKey,
      }),
      loadNotes: () => this.loadNotesAsync(),
      mutateNotes: (mutate) => this.mutateNotes(mutate),
      setSettings: (settings) => this.setSettingsAsync(settings),
      writeSyncConfig: (key, config, spec) =>
        writeSyncConfig(this.syncConfigStore(), key, config, spec),
    });
  }

  private async storeNotesByKey(key: string, notes: NoteItem[]): Promise<void> {
    if (this.currentUserId) {
      // Never write a signed-in user's notes in plaintext; their only store
      // is the encrypted notes DB.
      throw new Error('Plaintext fallback store is guest-only');
    }
    await this.kv.writeStoredValue(key, notes);
  }

  async getWebDAVConfigAsync(): Promise<WebDAVConfig | null> {
    try {
      return await readSyncConfig(
        this.syncConfigStore(),
        this.webdavConfigKey,
        WEBDAV_CONFIG_SPEC,
        (config) => this.setWebDAVConfigAsync(config),
      );
    } catch (e) {
      console.error('[NoteStorage] getWebDAVConfigAsync failed', e);
      return null;
    }
  }

  async setWebDAVConfigAsync(config: WebDAVConfig): Promise<boolean> {
    try {
      await writeSyncConfig(
        this.syncConfigStore(),
        this.webdavConfigKey,
        config,
        WEBDAV_CONFIG_SPEC,
      );
      return true;
    } catch (e) {
      console.error('[NoteStorage] setWebDAVConfigAsync failed', e);
      return false;
    }
  }

  async getOneDriveConfigAsync(): Promise<OneDriveConfig | null> {
    try {
      return await readSyncConfig(
        this.syncConfigStore(),
        this.oneDriveConfigKey,
        ONEDRIVE_CONFIG_SPEC,
        (config) => this.setOneDriveConfigAsync(config),
      );
    } catch (e) {
      console.error('[NoteStorage] getOneDriveConfigAsync failed', e);
      return null;
    }
  }

  async setOneDriveConfigAsync(config: OneDriveConfig): Promise<boolean> {
    try {
      await writeSyncConfig(
        this.syncConfigStore(),
        this.oneDriveConfigKey,
        config,
        ONEDRIVE_CONFIG_SPEC,
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
    const stored = await this.kv.readKeyValue(this.conflictsKey);
    const conflicts = (await this.unsealForUser<NoteConflict[]>(stored)) ?? [];
    if (this.currentUserId && stored && !isSealedValue(stored)) {
      // Conflicts hold full copies of both notes: never leave them in
      // plaintext for a signed-in user.
      await this.setConflictsAsync(conflicts);
    }
    return conflicts;
  }

  private async writeConflicts(conflicts: NoteConflict[]): Promise<void> {
    await this.kv.writeKeyValue(this.conflictsKey, await this.sealForUser(conflicts));
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
    return this.lock.run(async () => {
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
    return this.lock.run(async () => {
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
   * Resolves a conflict in favour of the note as it is on this device now,
   * edits made since the conflict was recorded included. The next sync
   * uploads it.
   */
  async dismissConflictAsync(id: string): Promise<boolean> {
    return this.lock.run(async () => {
      let conflicts: NoteConflict[];
      try {
        conflicts = await this.readConflicts();
      } catch (e) {
        console.error('[NoteStorage] dismissConflictAsync failed', e);
        return false;
      }
      if (!conflicts.some((c) => c.id === id)) return false;
      return this.setConflictsAsync(conflicts.filter((c) => c.id !== id));
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

  private syncBaseKey(provider: SyncProvider): string {
    return this.getNamespacedKey(`SYNC_BASE_${provider.toUpperCase()}`, this.currentUserId);
  }

  /** What NoteStorage exposes to a sync run (see ./storage/syncRunner). */
  private syncHost(): SyncHost {
    return {
      lock: this.lock,
      loadNotes: () => this.loadNotesAsync(),
      mutateNotesUnlocked: (mutate) => this.mutateNotesUnlocked(mutate),
      readConflicts: () => this.readConflicts(),
      writeConflicts: (conflicts) => this.writeConflicts(conflicts),
      readSyncBase: async (provider, remoteId) => {
        // Sealed: the per-note hashes are short enough to dictionary-attack.
        const stored = await this.unsealForUser<SyncBase>(
          await this.kv.readStoredValue<unknown>(this.syncBaseKey(provider)),
        );
        // A base recorded against another file says nothing about this one.
        return stored && stored.remoteId === remoteId ? stored : null;
      },
      writeSyncBase: async (provider, base) => {
        await this.kv.writeStoredValue(this.syncBaseKey(provider), await this.sealForUser(base));
      },
    };
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
    return pushToWebDAV(this.syncHost(), config, encrypt);
  }

  /** Merges remote changes into this device without uploading anything. */
  async pullFromWebDAVAsync(config: WebDAVConfig, decrypt = true): Promise<boolean> {
    if (typeof fetch !== 'function' || typeof window === 'undefined') {
      console.warn('[NoteStorage] WebDAV 仅在浏览器环境支持');
      return false;
    }
    return runSync(this.syncHost(), 'webdav', webdavTransport(config), {
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
    return runSync(this.syncHost(), 'webdav', webdavTransport(config), {
      key: encrypt ? config.encryptionKey : undefined,
      strategy: config.conflictStrategy ?? 'manual',
      upload: true,
    });
  }

  async syncWithOneDriveAsync(config: OneDriveConfig, encrypt: boolean = true): Promise<boolean> {
    if (!config.accessToken || !config.folderPath) {
      console.warn('[NoteStorage] OneDrive 配置不完整');
      return false;
    }
    // OneDrive has no conflict-strategy setting; a note edited on both sides
    // keeps the newer edit and files the other under its version history.
    return runSync(this.syncHost(), 'onedrive', oneDriveTransport(config), {
      key: encrypt ? config.encryptionKey : undefined,
      strategy: 'newest',
      upload: true,
    });
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
        const records = await notesDb.find<NoteItem>(NOTE_STORE_SCHEMA.name, {});
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
      const notes = await this.kv.readLegacyNotes(this.storageKey);
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
    return this.lock.run(() => this.mutateNotesUnlocked(mutate));
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
          await notesDb.bulkWrite(NOTE_STORE_SCHEMA.name, puts, deletes);
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
      await this.kv.writeKeyValue(this.settingsKey, settings);
      return true;
    } catch (e) {
      console.error('保存设置失败:', e);
      return false;
    }
  }

  // The mutation methods below throw NoteStorageError when the change could
  // not be saved, so callers never mistake an unsaved edit for a saved one.

  async addNoteAsync(note: Partial<NoteItem>): Promise<NoteItem> {
    const newNote = createNote(note);
    const saved = await this.mutateNotes((notes) => syncLinkGraph([newNote, ...notes]));
    return saved?.find((n) => n.id === newNote.id) as NoteItem;
  }

  async updateNoteAsync(id: string, updates: Partial<NoteItem>): Promise<NoteItem | null> {
    const saved = await this.mutateNotes((notes) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index === -1) return null;
      notes[index] = applyNoteUpdate(notes[index], updates);
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

  async getCategoriesAsync() {
    return listCategories((await this.getDataAsync()) || []);
  }

  async getAllTagsAsync() {
    return listTags((await this.getDataAsync()) || []);
  }

  async exportToJSON() {
    // Strict: a backup silently containing [] is worse than an error.
    const notes = await this.loadNotesAsync();
    if (typeof window === 'undefined') return;
    downloadJSON(notes, `QCNOTE_backup_${Date.now()}.json`);
  }

  /** Appends the notes in a JSON backup; rejects with a user-facing message string. */
  async importFromJSON(file: File): Promise<number> {
    const text = await readFileAsText(file);
    let importedNotes: unknown;
    try {
      importedNotes = JSON.parse(text);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return Promise.reject('导入失败: ' + msg);
    }
    if (!Array.isArray(importedNotes)) {
      return Promise.reject('无效的JSON格式');
    }

    let importedCount = 0;
    try {
      await this.mutateNotes((existingNotes) => {
        importedCount = importedNotes.length;
        return mergeImportedNotes(existingNotes, importedNotes);
      });
    } catch (err) {
      return Promise.reject(
        err instanceof NoteStorageError && err.kind === 'locked'
          ? `导入失败：${LOCKED_MESSAGE}`
          : '导入失败：写入存储失败',
      );
    }
    return importedCount;
  }

  async clearAllAsync() {
    if (typeof window === 'undefined') return false;
    return this.lock.run(() => this.clearAllUnlocked());
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
        await notesDb.clear(NOTE_STORE_SCHEMA.name);
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
    this.notesDb.close();
    this.init();
    return true;
  }

  async getStatsAsync(): Promise<Stats> {
    return computeStats((await this.getDataAsync()) || []);
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

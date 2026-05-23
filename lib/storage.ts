import Utils from './utils';
import IDB from './idb';
import logger from './logger';
import Indexer from './indexer';
import SentimentUtil from './sentiment';
import { QCRuntime, QCDb, QCStoreSchema } from '../qcruntime/qcnote-runtime';

export interface NoteVersion {
  versionId: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  color: string;
  isFavorite: boolean;
  isArchived: boolean;
  updatedAt: number;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  color: string;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
  links?: string[];
  backlinks?: string[];
  versions?: NoteVersion[];
  sentimentScore?: number;
  sentimentComparative?: number;
  sentimentCategory?: 'positive' | 'neutral' | 'negative';
  isDeleted?: boolean;
  deletedAt?: number;
  ownerId?: string;
}

export interface Stats {
  totalNotes: number;
  favoriteNotes: number;
  archivedNotes: number;
  categories: Record<string, number>;
  totalTags: number;
  createdToday: number;
}

export interface UserSettings {
  theme: string;
  sortBy: string;
  itemsPerPage: number;
  defaultCategory: string;
}

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  remotePath: string;
  encryptionKey?: string;
  // Auto-sync settings
  autoSyncEnabled?: boolean;
  syncInterval?: number; // in milliseconds
  lastSyncTime?: number; // timestamp
  lastSyncStatus?: 'success' | 'failure' | 'pending';
  lastSyncError?: string;
  conflictStrategy?: 'prefer-local' | 'prefer-remote' | 'manual';
}

export interface OneDriveConfig {
  accessToken: string;
  folderPath: string;
  encryptionKey?: string;
}

export interface NoteConflict {
  id: string;
  local: NoteItem;
  remote: NoteItem;
  resolved: boolean;
  createdAt: number;
}

export class NoteStorage {
  storageKeyPrefix = 'QCNOTE';
  storageKey!: string;
  settingsKey!: string;
  webdavConfigKey!: string;
  oneDriveConfigKey!: string;
  conflictsKey!: string;
  useIndexedDB: boolean;
  currentUserId: string | null;
  useEncryption: boolean;
  currentEncryptionKey: string | null;

  private readonly noteStoreSchema: QCStoreSchema = {
    name: 'notes',
    keyField: 'id',
    keyAuto: false,
    fields: [
      { name: 'id', type: 'str', indexed: true, secret: false },
      { name: 'title', type: 'str', indexed: false, secret: true },
      { name: 'content', type: 'str', indexed: false, secret: true },
      { name: 'category', type: 'str', indexed: true, secret: false },
      { name: 'tags', type: 'json', indexed: false, secret: false },
      { name: 'color', type: 'str', indexed: false, secret: false },
      { name: 'isFavorite', type: 'bool', indexed: false, secret: false },
      { name: 'isArchived', type: 'bool', indexed: false, secret: false },
      { name: 'createdAt', type: 'num', indexed: false, secret: false },
      { name: 'updatedAt', type: 'num', indexed: false, secret: false },
      { name: 'links', type: 'json', indexed: false, secret: false },
      { name: 'backlinks', type: 'json', indexed: false, secret: false },
      { name: 'versions', type: 'json', indexed: false, secret: false },
      { name: 'isDeleted', type: 'bool', indexed: false, secret: false },
      { name: 'deletedAt', type: 'num', indexed: false, secret: false },
      { name: 'ownerId', type: 'str', indexed: true, secret: false },
    ],
  };

  private notesDb?: QCDb | null;
  private notesDbName: string | null = null;
  private notesDbOpenFailed = false;

  constructor() {
    this.currentUserId = null;
    this.useEncryption = false;
    this.currentEncryptionKey = null;
    this.useIndexedDB = false;
    this.updateNamespacedKeys();
    this.init();
    // 自动检查 IndexedDB 是否可用
    this.detectIndexedDB();
  }

  private _warnSyncUsage(method: string) {
    if (typeof window !== 'undefined') {
      // keep message concise to aid debugging during migration
      console.warn(
        `[NoteStorage] Deprecated sync method used: ${method}. Prefer using the async variant (e.g. ${method}Async).`,
      );
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

  private parseWikiLinks(text: string): string[] {
    const re = /\[\[([^\]]+)\]\]/g;
    const links = new Set<string>();
    let match;
    while ((match = re.exec(text)) !== null) {
      const label = match[1].trim();
      if (label) links.add(label);
    }
    return Array.from(links);
  }

  private normalizeNote(note: NoteItem): NoteItem {
    return {
      ...note,
      links: note.links || [],
      backlinks: note.backlinks || [],
      versions: note.versions || [],
    };
  }

  private syncLinkGraph(notes: NoteItem[]): NoteItem[] {
    const titleToId = new Map<string, string>();
    notes.forEach((note) => {
      titleToId.set(note.title, note.id);
    });

    const backlinksMap = new Map<string, Set<string>>();

    const enriched = notes.map((note) => {
      const normalizedNote = this.normalizeNote(note);
      const links = this.parseWikiLinks(normalizedNote.content);
      links.forEach((linkTitle) => {
        const targetId = titleToId.get(linkTitle);
        if (!targetId) return;
        if (!backlinksMap.has(targetId)) backlinksMap.set(targetId, new Set());
        backlinksMap.get(targetId)?.add(normalizedNote.id);
      });
      return {
        ...normalizedNote,
        links,
      };
    });

    return enriched.map((note) => ({
      ...note,
      backlinks: Array.from(backlinksMap.get(note.id) || []),
    }));
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

    if (this.notesDb) {
      this.notesDb.close();
      this.notesDb = null;
      this.notesDbName = null;
    }

    if (this.notesDbOpenFailed) {
      return null;
    }

    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      this.notesDbOpenFailed = true;
      return null;
    }

    try {
      const secret =
        userId && this.useEncryption ? (this.currentEncryptionKey ?? undefined) : undefined;
      this.notesDb = await QCRuntime.open(dbName, [this.noteStoreSchema], 1, secret);
      this.notesDbName = dbName;
      this.notesDbOpenFailed = false;
      return this.notesDb;
    } catch (e) {
      console.warn('[NoteStorage] QCRuntime.open failed, falling back to legacy storage', e);
      this.notesDbOpenFailed = true;
      return null;
    }
  }

  private async readGuestNotesAsync(): Promise<NoteItem[]> {
    try {
      const guestDb = await this.ensureNotesDb(null);
      if (!guestDb) return [];
      return await guestDb.find<NoteItem>(this.noteStoreSchema.name, {});
    } catch (e) {
      console.warn('[NoteStorage] readGuestNotesAsync failed', e);
      return [];
    }
  }

  private async clearGuestNotesAsync(): Promise<void> {
    try {
      const guestDb = await this.ensureNotesDb(null);
      if (!guestDb) return;
      await guestDb.clear(this.noteStoreSchema.name);
    } catch (e) {
      console.warn('[NoteStorage] clearGuestNotesAsync failed', e);
    }
  }

  /**
   * Internal helpers for localStorage access.
   *
   * These used to be the public sync methods (getData/setData)
   * but those have been removed from the public API.  We keep
   * private helpers here so that the async methods can fall back
   * to localStorage when IndexedDB is unavailable.  They are
   * intentionally not exported or documented.
   */
  private _getDataLocal(): NoteItem[] | null {
    const raw = localStorage.getItem(this.storageKey);
    return raw ? (JSON.parse(raw) as NoteItem[]) : null;
  }

  private _setDataLocal(notes: NoteItem[]): boolean {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(notes));
      return true;
    } catch (e) {
      console.error('[NoteStorage] _setDataLocal failed', e);
      return false;
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const saltBuffer = salt.buffer.slice(
      salt.byteOffset,
      salt.byteOffset + salt.byteLength,
    ) as ArrayBuffer;
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBuffer, iterations: 250000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  private async encryptText(plain: string, passphrase: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(passphrase, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plain),
    );
    // format: salt + iv + ciphertext
    const combined = new Uint8Array(salt.byteLength + iv.byteLength + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.byteLength);
    combined.set(new Uint8Array(encrypted), salt.byteLength + iv.byteLength);
    return this.arrayBufferToBase64(combined.buffer);
  }

  private async decryptText(encryptedBase64: string, passphrase: string): Promise<string> {
    const decoder = new TextDecoder();
    const combined = new Uint8Array(this.base64ToArrayBuffer(encryptedBase64));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);
    const key = await this.deriveKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return decoder.decode(decrypted);
  }

  private isEncryptedPayload(value: unknown): value is { encrypted: true; payload: string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as any).encrypted === true &&
      typeof (value as any).payload === 'string'
    );
  }

  async setCurrentUser(userId: string | null, secret?: string): Promise<void> {
    const previousUserId = this.currentUserId;
    this.currentUserId = userId;
    this.useEncryption = Boolean(userId);
    if (!userId) {
      this.currentEncryptionKey = null;
    } else if (secret) {
      this.currentEncryptionKey = secret;
    } else if (previousUserId !== userId) {
      this.currentEncryptionKey = null;
    }
    this.updateNamespacedKeys();

    if (this.notesDb) {
      this.notesDb.close();
      this.notesDb = null;
      this.notesDbName = null;
      this.notesDbOpenFailed = false;
    }

    if (this.currentUserId) {
      try {
        await this.ensureNotesDb();
      } catch (err) {
        console.warn('[NoteStorage] setCurrentUser failed to initialize notes DB', err);
      }
    }
  }

  async migrateGuestDataToUser(): Promise<boolean> {
    if (!this.currentUserId) {
      return false;
    }

    const legacyGuestStorageKey = this.getNamespacedKey('STORAGE', null);
    const legacyRawGuestValue = await this.readStoredValue<
      NoteItem[] | { encrypted: true; payload: string }
    >(legacyGuestStorageKey);
    let guestNotes: NoteItem[] | null = null;

    if (legacyRawGuestValue) {
      guestNotes = Array.isArray(legacyRawGuestValue)
        ? legacyRawGuestValue
        : (() => {
            try {
              return JSON.parse(legacyRawGuestValue.payload) as NoteItem[];
            } catch {
              return null;
            }
          })();
    }

    if (!guestNotes || guestNotes.length === 0) {
      guestNotes = await this.readGuestNotesAsync();
    }

    if (!guestNotes || guestNotes.length === 0) {
      return false;
    }

    const currentNotes = (await this.getDataAsync()) || [];
    const mergedNotes = [
      ...currentNotes,
      ...guestNotes.map((note) => ({ ...note, ownerId: this.currentUserId ?? undefined })),
    ];

    await this.setDataAsync(mergedNotes);
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

  private async readStoredValue<T>(key: string): Promise<T | null> {
    try {
      if (this.useIndexedDB) {
        const item = await IDB.getItem<T>(key);
        if (item !== undefined) {
          return item;
        }
      }
    } catch (e) {
      console.warn('[NoteStorage] 读取 IndexedDB 数据失败，回退到 localStorage', e);
    }

    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (e) {
      console.error('[NoteStorage] 解析本地存储数据失败', e);
      return null;
    }
  }

  private async writeStoredValue<T>(key: string, value: T): Promise<void> {
    if (this.useIndexedDB) {
      await IDB.setItem(key, value);
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }

  private async getNotesFromKey(key: string): Promise<NoteItem[] | null> {
    const stored = await this.readStoredValue<NoteItem[] | { encrypted: true; payload: string }>(
      key,
    );
    if (!stored) return null;
    if (Array.isArray(stored)) {
      return stored as NoteItem[];
    }
    if (this.isEncryptedPayload(stored)) {
      if (!this.useEncryption) {
        return null;
      }
      if (!this.currentEncryptionKey) {
        console.warn('[NoteStorage] Encryption key unavailable for stored notes decryption');
        return null;
      }
      try {
        const decrypted = await this.decryptText(stored.payload, this.currentEncryptionKey);
        return JSON.parse(decrypted) as NoteItem[];
      } catch (e) {
        console.error('[NoteStorage] 解密笔记失败:', e);
        return null;
      }
    }
    return null;
  }

  private async storeNotesByKey(key: string, notes: NoteItem[]): Promise<void> {
    if (this.useEncryption) {
      if (!this.currentEncryptionKey) {
        throw new Error('Encryption key unavailable for storing encrypted notes');
      }
      const payload = {
        encrypted: true,
        payload: await this.encryptText(JSON.stringify(notes), this.currentEncryptionKey),
      };
      await this.writeStoredValue(key, payload);
      return;
    }
    await this.writeStoredValue(key, notes);
  }

  async getWebDAVConfigAsync(): Promise<WebDAVConfig | null> {
    try {
      let config: WebDAVConfig | null = null;
      if (this.useIndexedDB) {
        const data = await IDB.getItem(this.webdavConfigKey);
        if (data) config = data as WebDAVConfig;
      }
      if (!config) {
        const raw = localStorage.getItem(this.webdavConfigKey);
        config = raw ? (JSON.parse(raw) as WebDAVConfig) : null;
      }

      // Decrypt password if encrypted
      if (config && config.password) {
        try {
          if (config.password.startsWith('encrypted:')) {
            const encryptedPart = config.password.slice('encrypted:'.length);
            config.password = await this.decryptText(encryptedPart, 'qcnote-webdav-default');
          }
        } catch (e) {
          console.warn('[NoteStorage] Failed to decrypt WebDAV password', e);
        }
      }
      return config;
    } catch (e) {
      console.error('[NoteStorage] getWebDAVConfigAsync failed', e);
      return null;
    }
  }

  async setWebDAVConfigAsync(config: WebDAVConfig): Promise<boolean> {
    try {
      // Encrypt password before storing
      const configToStore = { ...config };
      if (configToStore.password && !configToStore.password.startsWith('encrypted:')) {
        try {
          const encrypted = await this.encryptText(configToStore.password, 'qcnote-webdav-default');
          configToStore.password = `encrypted:${encrypted}`;
        } catch (e) {
          console.warn('[NoteStorage] Failed to encrypt WebDAV password, storing plaintext', e);
        }
      }

      if (this.useIndexedDB) {
        await IDB.setItem(this.webdavConfigKey, configToStore);
      } else {
        try {
          await IDB.setItem(this.webdavConfigKey, configToStore);
          this.useIndexedDB = true;
          localStorage.removeItem(this.webdavConfigKey);
        } catch {
          localStorage.setItem(this.webdavConfigKey, JSON.stringify(configToStore));
        }
      }
      return true;
    } catch (e) {
      console.error('[NoteStorage] setWebDAVConfigAsync failed', e);
      return false;
    }
  }

  async getOneDriveConfigAsync(): Promise<OneDriveConfig | null> {
    try {
      let config: OneDriveConfig | null = null;
      if (this.useIndexedDB) {
        const data = await IDB.getItem(this.oneDriveConfigKey);
        if (data) config = data as OneDriveConfig;
      }
      if (!config) {
        const raw = localStorage.getItem(this.oneDriveConfigKey);
        config = raw ? (JSON.parse(raw) as OneDriveConfig) : null;
      }

      if (config) {
        if (config.accessToken && config.accessToken.startsWith('encrypted:')) {
          try {
            const encryptedPart = config.accessToken.slice('encrypted:'.length);
            config.accessToken = await this.decryptText(encryptedPart, 'qcnote-onedrive-default');
          } catch (e) {
            console.warn('[NoteStorage] Failed to decrypt OneDrive access token', e);
          }
        }
        if (config.encryptionKey && config.encryptionKey.startsWith('encrypted:')) {
          try {
            const encryptedPart = config.encryptionKey.slice('encrypted:'.length);
            config.encryptionKey = await this.decryptText(encryptedPart, 'qcnote-onedrive-default');
          } catch (e) {
            console.warn('[NoteStorage] Failed to decrypt OneDrive encryption key', e);
          }
        }
      }
      return config;
    } catch (e) {
      console.error('[NoteStorage] getOneDriveConfigAsync failed', e);
      return null;
    }
  }

  async setOneDriveConfigAsync(config: OneDriveConfig): Promise<boolean> {
    try {
      const configToStore = { ...config };
      if (configToStore.accessToken && !configToStore.accessToken.startsWith('encrypted:')) {
        try {
          const encrypted = await this.encryptText(
            configToStore.accessToken,
            'qcnote-onedrive-default',
          );
          configToStore.accessToken = `encrypted:${encrypted}`;
        } catch (e) {
          console.warn(
            '[NoteStorage] Failed to encrypt OneDrive access token, storing plaintext',
            e,
          );
        }
      }
      if (configToStore.encryptionKey && !configToStore.encryptionKey.startsWith('encrypted:')) {
        try {
          const encrypted = await this.encryptText(
            configToStore.encryptionKey,
            'qcnote-onedrive-default',
          );
          configToStore.encryptionKey = `encrypted:${encrypted}`;
        } catch (e) {
          console.warn(
            '[NoteStorage] Failed to encrypt OneDrive encryption key, storing plaintext',
            e,
          );
        }
      }

      if (this.useIndexedDB) {
        await IDB.setItem(this.oneDriveConfigKey, configToStore);
      } else {
        try {
          await IDB.setItem(this.oneDriveConfigKey, configToStore);
          this.useIndexedDB = true;
          localStorage.removeItem(this.oneDriveConfigKey);
        } catch {
          localStorage.setItem(this.oneDriveConfigKey, JSON.stringify(configToStore));
        }
      }
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

  async getConflictsAsync(): Promise<NoteConflict[]> {
    try {
      if (this.useIndexedDB) {
        const data = await IDB.getItem(this.conflictsKey);
        if (data) return data as NoteConflict[];
      }
      const raw = localStorage.getItem(this.conflictsKey);
      return raw ? (JSON.parse(raw) as NoteConflict[]) : [];
    } catch (e) {
      console.error('[NoteStorage] getConflictsAsync failed', e);
      return [];
    }
  }

  async setConflictsAsync(conflicts: NoteConflict[]): Promise<boolean> {
    try {
      if (this.useIndexedDB) {
        await IDB.setItem(this.conflictsKey, conflicts);
      } else {
        try {
          await IDB.setItem(this.conflictsKey, conflicts);
          this.useIndexedDB = true;
        } catch (_) {
          localStorage.setItem(this.conflictsKey, JSON.stringify(conflicts));
        }
      }
      return true;
    } catch (e) {
      console.error('[NoteStorage] setConflictsAsync failed', e);
      return false;
    }
  }

  async addConflictAsync(conflict: NoteConflict): Promise<boolean> {
    const conflicts = await this.getConflictsAsync();
    conflicts.push(conflict);
    return this.setConflictsAsync(conflicts);
  }

  async resolveConflictAsync(id: string, resolvedNote: NoteItem): Promise<boolean> {
    const conflicts = await this.getConflictsAsync();
    const index = conflicts.findIndex((c) => c.id === id);
    if (index === -1) return false;
    conflicts.splice(index, 1);
    await this.setConflictsAsync(conflicts);
    // Update the note
    const notes = (await this.getDataAsync()) || [];
    const noteIndex = notes.findIndex((n) => n.id === id);
    if (noteIndex !== -1) {
      notes[noteIndex] = resolvedNote;
    } else {
      notes.push(resolvedNote);
    }
    return this.setDataAsync(notes);
  }

  private async webdavFetch(
    method: string,
    url: string,
    config: WebDAVConfig,
    body?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };
    if (config.username && config.password) {
      headers.Authorization = `Basic ${btoa(`${config.username}:${config.password}`)}`;
    }
    return fetch(url, { method, headers, body });
  }

  private normalizeWebDAVUrl(config: WebDAVConfig): string {
    const base = config.url.trim().replace(/\/+$/, '');
    const path = config.remotePath.trim().replace(/^\/+/, '');
    return `${base}/${path}`;
  }

  async pushToWebDAVAsync(config: WebDAVConfig, encrypt = true): Promise<boolean> {
    if (typeof fetch !== 'function' || typeof window === 'undefined') {
      console.warn('[NoteStorage] WebDAV 仅在浏览器环境支持');
      return false;
    }

    try {
      const allNotes = (await this.getDataAsync()) || [];
      let payload = JSON.stringify(allNotes);
      if (encrypt && config.encryptionKey && config.encryptionKey.length > 0) {
        payload = await this.encryptText(payload, config.encryptionKey);
      }
      const url = this.normalizeWebDAVUrl(config);
      const response = await this.webdavFetch('PUT', url, config, payload);
      return response.ok;
    } catch (e) {
      console.error('[NoteStorage] pushToWebDAVAsync failed', e);
      return false;
    }
  }

  async pullFromWebDAVAsync(config: WebDAVConfig, decrypt = true): Promise<boolean> {
    if (typeof fetch !== 'function' || typeof window === 'undefined') {
      console.warn('[NoteStorage] WebDAV 仅在浏览器环境支持');
      return false;
    }

    try {
      const url = this.normalizeWebDAVUrl(config);
      const response = await this.webdavFetch('GET', url, config);
      if (!response.ok) {
        console.warn('[NoteStorage] pullFromWebDAVAsync 读取失败', response.status);
        return false;
      }
      const raw = await response.text();
      let content = raw;
      if (decrypt && config.encryptionKey && config.encryptionKey.length > 0) {
        content = await this.decryptText(raw, config.encryptionKey);
      }
      const remoteNotes = JSON.parse(content) as NoteItem[];
      if (!Array.isArray(remoteNotes)) {
        throw new Error('WebDAV 数据格式错误');
      }

      const localNotes = (await this.getDataAsync()) || [];
      const localMap = new Map(localNotes.map((n) => [n.id, n]));
      const mergedNotes: NoteItem[] = [];
      const conflicts: NoteConflict[] = [];

      for (const remote of remoteNotes) {
        const local = localMap.get(remote.id);
        if (local) {
          // Check for conflict: if local is newer or content differs
          if (
            local.updatedAt > remote.updatedAt ||
            local.content !== remote.content ||
            local.title !== remote.title
          ) {
            const strategy = config.conflictStrategy || 'manual';
            if (strategy === 'prefer-local') {
              mergedNotes.push(local);
            } else if (strategy === 'prefer-remote') {
              mergedNotes.push(remote);
            } else {
              // manual
              conflicts.push({
                id: remote.id,
                local,
                remote,
                resolved: false,
                createdAt: Date.now(),
              });
              mergedNotes.push(local);
            }
          } else {
            // Remote is same or newer, use remote
            mergedNotes.push(remote);
          }
        } else {
          // New remote note
          mergedNotes.push(remote);
        }
      }

      // Add local notes not in remote
      for (const local of localNotes) {
        if (!remoteNotes.some((r) => r.id === local.id)) {
          mergedNotes.push(local);
        }
      }

      await this.setDataAsync(mergedNotes);
      if (conflicts.length > 0) {
        await this.setConflictsAsync(conflicts);
      }
      return true;
    } catch (e) {
      console.error('[NoteStorage] pullFromWebDAVAsync failed', e);
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
          const backupKey = `${this.storageKey}_backup_${Date.now()}`;
          await IDB.setItem(backupKey, parsed);
          logger.info('✓ 本地数据已备份到 IndexedDB 键：', backupKey);
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

  // async accessors that respect IndexedDB when enabled
  async getDataAsync(): Promise<NoteItem[] | null> {
    try {
      const notesDb = await this.ensureNotesDb();
      if (notesDb) {
        const notes = await notesDb.find<NoteItem>(this.noteStoreSchema.name, {});
        return notes.map((note) => this.normalizeNote(note));
      }

      const notes = await this.getNotesFromKey(this.storageKey);
      return notes ? notes.map((note) => this.normalizeNote(note)) : [];
    } catch (e) {
      console.error('读取存储失败:', e);
      return [];
    }
  }

  async setDataAsync(notes: NoteItem[]): Promise<boolean> {
    const normalizedNotes = notes.map((note) => this.normalizeNote(note));
    try {
      const notesDb = await this.ensureNotesDb();
      if (notesDb) {
        try {
          await notesDb.clear(this.noteStoreSchema.name);
          await Promise.all(
            normalizedNotes.map((note) => notesDb.put(this.noteStoreSchema.name, note)),
          );
          this.syncWithServer(notes).catch((err) => {
            logger.warn('[NoteStorage] 同步服务器失败', err);
          });
          return true;
        } catch (err) {
          console.warn('[NoteStorage] QCRuntime note storage 写入失败，回退到旧存储', err);
        }
      }

      await this.storeNotesByKey(this.storageKey, normalizedNotes);
      this.syncWithServer(notes).catch((err) => {
        logger.warn('[NoteStorage] 同步服务器失败', err);
      });
      return true;
    } catch (e) {
      console.error('保存存储失败:', e);
      return false;
    }
  }

  // 尝试将单条或多条笔记发送给后端
  private async syncWithServer(notes?: NoteItem[] | NoteItem) {
    // originally we avoided attempting network calls when running on server
    // side (no "window"). for tests we prefer to simply check for a
    // fetch implementation so that the polyfilled global.fetch is usable.
    if (typeof fetch !== 'function') return;
    const url = '/syncNote';
    try {
      if (!notes) {
        const all = await this.getDataAsync();
        if (!all) return;
        notes = all;
      }
      const list = Array.isArray(notes) ? notes : [notes];
      // send requests in parallel; avoid throwing for individual failures
      await Promise.allSettled(
        list.map((note) =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(note),
          }),
        ),
      );
    } catch (e) {
      console.debug('[NoteStorage] 无法同步到服务器', e);
    }
  }

  private async writeDataWithCleanupAsync(notes: NoteItem[]): Promise<void> {
    try {
      await IDB.setItem(this.storageKey, notes);
    } catch (error: unknown) {
      const isQuotaError =
        error instanceof DOMException &&
        (error.name === 'QuotaExceededError' || error.name === 'QuotaError');

      if (isQuotaError) {
        logger.warn(
          '[NoteStorage] IndexedDB 空间不足，已回退到 localStorage，不会自动删除笔记内容',
        );
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(
            new CustomEvent('qcnote:storage-fallback', {
              detail: {
                message:
                  '检测到 IndexedDB 存储空间不足，已自动回退到本地存储。笔记未丢失，但建议尽快备份或清理旧数据。',
              },
            }),
          );
        }
      } else if (typeof error === 'object' && error !== null) {
        const maybeMsg = (error as Error).message || '';
        if (maybeMsg.includes('quota') || maybeMsg.includes('QuotaExceeded')) {
          logger.warn(
            '[NoteStorage] IndexedDB 空间不足，已回退到 localStorage，不会自动删除笔记内容',
          );
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(
              new CustomEvent('qcnote:storage-fallback', {
                detail: {
                  message:
                    '检测到 IndexedDB 存储空间不足，已自动回退到本地存储。笔记未丢失，但建议尽快备份或清理旧数据。',
                },
              }),
            );
          }
        } else {
          throw error;
        }
      }

      throw error;
    }
  }

  init() {
    // 如果已启用 IndexedDB，跳过 localStorage 初始化
    // 因为数据已经在 IndexedDB 中了
    if (this.useIndexedDB) {
      return;
    }

    if (!localStorage.getItem(this.storageKey) && !this.useEncryption) {
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

  async addNoteAsync(note: Partial<NoteItem>) {
    const notes = (await this.getDataAsync()) || [];

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

    notes.unshift(newNote);
    const updatedNotes = this.syncLinkGraph(notes);
    await this.setDataAsync(updatedNotes);
    Indexer.invalidateIndex(); // Invalidate search index cache
    return updatedNotes.find((n) => n.id === newNote.id) as NoteItem;
  }

  async updateNoteAsync(id: string, updates: Partial<NoteItem>) {
    const notes = (await this.getDataAsync()) || [];
    const index = notes.findIndex((n) => n.id === id);
    if (index !== -1) {
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
        updatedAt: Date.now(),
        versions: updatedVersionList,
      };

      const updatedNotes = this.syncLinkGraph(notes);
      await this.setDataAsync(updatedNotes);
      Indexer.invalidateIndex(); // Invalidate search index cache
      return updatedNotes.find((n) => n.id === id) || null;
    }
    return null;
  }

  async deleteNoteAsync(id: string) {
    const notes = (await this.getDataAsync()) || [];
    const index = notes.findIndex((n) => n.id === id);
    if (index !== -1) {
      notes[index] = {
        ...notes[index],
        isDeleted: true,
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      };
      const updatedNotes = this.syncLinkGraph(notes);
      await this.setDataAsync(updatedNotes);
      Indexer.invalidateIndex(); // Invalidate search index cache
      return true;
    }
    return false;
  }

  async permanentlyDeleteNoteAsync(id: string) {
    const notes = (await this.getDataAsync()) || [];
    const filteredNotes = notes.filter((n) => n.id !== id);
    await this.setDataAsync(filteredNotes);
    Indexer.invalidateIndex(); // Invalidate search index cache
    return true;
  }

  async restoreNoteAsync(id: string) {
    const notes = (await this.getDataAsync()) || [];
    const note = notes.find((n) => n.id === id);
    if (note && note.isDeleted) {
      note.isDeleted = false;
      note.deletedAt = undefined;
      note.updatedAt = Date.now();
      const updatedNotes = this.syncLinkGraph(notes);
      await this.setDataAsync(updatedNotes);
      Indexer.invalidateIndex(); // Invalidate search index cache
      return true;
    }
    return false;
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
    const notes = (await this.getDataAsync()) || [];
    const note = notes.find((n) => n.id === id);
    if (note) {
      note.isFavorite = !note.isFavorite;
      await this.setDataAsync(notes);
      return note.isFavorite;
    }
    return null;
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
    const notes = (await this.getDataAsync()) || [];
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
          const notes = JSON.parse(result);
          if (!Array.isArray(notes)) {
            reject('无效的JSON格式');
            return;
          }

          const normalizedNotes = notes.map((note) => this.normalizeNote(note as NoteItem));
          const success = await this.setDataAsync(normalizedNotes);
          if (!success) {
            reject('导入失败：写入存储失败');
            return;
          }
          resolve(normalizedNotes.length);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          reject('导入失败: ' + msg);
        }
      };
      reader.onerror = () => reject('读取文件失败');
      reader.readAsText(file);
    });
  }

  private normalizeOneDrivePath(path: string): string {
    return path.trim().replace(/^\/+|\/+$/g, '');
  }

  private async oneDriveFetch(
    method: string,
    config: OneDriveConfig,
    body?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/octet-stream',
    };
    const path = this.normalizeOneDrivePath(config.folderPath)
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, {
      method,
      headers,
      body,
    });
  }

  async syncWithOneDriveAsync(config: OneDriveConfig, encrypt: boolean = true): Promise<boolean> {
    if (!config.accessToken || !config.folderPath) {
      console.warn('[NoteStorage] OneDrive 配置不完整');
      return false;
    }

    try {
      const localNotes = (await this.getDataAsync()) || [];
      let remoteNotes: NoteItem[] = [];
      const response = await this.oneDriveFetch('GET', config);
      if (response.ok) {
        const raw = await response.text();
        let content = raw;
        if (encrypt && config.encryptionKey) {
          try {
            content = await this.decryptText(raw, config.encryptionKey);
          } catch (e) {
            console.warn('[NoteStorage] OneDrive 解密失败，尝试直接解析远程内容', e);
          }
        }
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            remoteNotes = parsed.map((note) => this.normalizeNote(note as NoteItem));
          }
        } catch (err) {
          console.warn('[NoteStorage] 解析 OneDrive 远程文件失败', err);
        }
      }

      const mergedMap = new Map<string, NoteItem>();
      for (const note of [...remoteNotes, ...localNotes]) {
        const existing = mergedMap.get(note.id);
        if (!existing || (note.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
          mergedMap.set(note.id, note);
        }
      }
      const mergedNotes = Array.from(mergedMap.values());

      const saved = await this.setDataAsync(mergedNotes);
      if (!saved) {
        console.warn('[NoteStorage] OneDrive 本地写入失败');
        return false;
      }

      let payload = JSON.stringify(mergedNotes);
      if (encrypt && config.encryptionKey) {
        payload = await this.encryptText(payload, config.encryptionKey);
      }

      const uploadResponse = await this.oneDriveFetch('PUT', config, payload);
      if (!uploadResponse.ok) {
        console.error('[NoteStorage] OneDrive 上传失败', uploadResponse.statusText);
        return false;
      }

      return true;
    } catch (e) {
      console.error('[NoteStorage] syncWithOneDriveAsync failed', e);
      return false;
    }
  }

  async clearAllAsync() {
    if (typeof window === 'undefined') return false;
    // Storage layer should not perform UI confirmation prompts.
    const keysToRemove = [
      this.storageKey,
      this.settingsKey,
      this.webdavConfigKey,
      this.conflictsKey,
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

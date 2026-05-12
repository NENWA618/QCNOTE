/**
 * Storage Adapter Module
 * Abstracts localStorage and IndexedDB access patterns
 */
import IDB from '../idb';
import logger from '../logger';
import { safeAsync } from '../errorHandler';

export interface IStorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  clear(): Promise<boolean>;
  getType(): 'localStorage' | 'indexedDB';
}

/**
 * LocalStorage Adapter
 */
class LocalStorageAdapter implements IStorageAdapter {
  get<T>(key: string): Promise<T | null> {
    return Promise.resolve(
      safeAsync(
        () => {
          const raw = localStorage.getItem(key);
          return raw ? (JSON.parse(raw) as T) : null;
        },
        null,
        `[LocalStorage] Failed to get ${key}`
      )
    );
  }

  set<T>(key: string, value: T): Promise<boolean> {
    return Promise.resolve(
      safeAsync(
        () => {
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        },
        false,
        `[LocalStorage] Failed to set ${key}`
      )
    );
  }

  async remove(key: string): Promise<boolean> {
    return safeAsync(
      () => {
        localStorage.removeItem(key);
        return true;
      },
      false,
      `[LocalStorage] Failed to remove ${key}`
    );
  }

  async clear(): Promise<boolean> {
    return safeAsync(
      () => {
        localStorage.clear();
        return true;
      },
      false,
      `[LocalStorage] Failed to clear`
    );
  }

  getType(): 'localStorage' {
    return 'localStorage';
  }
}

/**
 * IndexedDB Adapter
 */
class IndexedDBAdapter implements IStorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    return safeAsync(
      async () => {
        const data = await IDB.getItem<T>(key);
        return data || null;
      },
      null,
      `[IndexedDB] Failed to get ${key}`
    );
  }

  async set<T>(key: string, value: T): Promise<boolean> {
    return safeAsync(
      async () => {
        await IDB.setItem(key, value);
        return true;
      },
      false,
      `[IndexedDB] Failed to set ${key}`
    );
  }

  async remove(key: string): Promise<boolean> {
    return safeAsync(
      async () => {
        await IDB.setItem(key, null);
        return true;
      },
      false,
      `[IndexedDB] Failed to remove ${key}`
    );
  }

  async clear(): Promise<boolean> {
    return safeAsync(
      async () => {
        await IDB.clear();
        return true;
      },
      false,
      `[IndexedDB] Failed to clear`
    );
  }

  getType(): 'indexedDB' {
    return 'indexedDB';
  }
}

/**
 * Hybrid Storage Adapter (tries IndexedDB first, falls back to localStorage)
 */
export class HybridStorageAdapter implements IStorageAdapter {
  private idbAdapter = new IndexedDBAdapter();
  private lsAdapter = new LocalStorageAdapter();
  private preferIDB: boolean = false;

  constructor(preferIndexedDB: boolean = false) {
    this.preferIDB = preferIndexedDB;
  }

  async get<T>(key: string): Promise<T | null> {
    // Try IndexedDB first
    if (this.preferIDB) {
      const data = await this.idbAdapter.get<T>(key);
      if (data !== null) {
        return data;
      }
    }

    // Fall back to localStorage
    return this.lsAdapter.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<boolean> {
    let success = false;

    // Try IndexedDB
    const idbSuccess = await this.idbAdapter.set(key, value);
    if (idbSuccess) {
      this.preferIDB = true;
      success = true;
    }

    // Also try localStorage as fallback
    if (!success) {
      success = await this.lsAdapter.set(key, value);
    }

    return success;
  }

  async remove(key: string): Promise<boolean> {
    const idbSuccess = await this.idbAdapter.remove(key);
    const lsSuccess = await this.lsAdapter.remove(key);
    return idbSuccess || lsSuccess;
  }

  async clear(): Promise<boolean> {
    const idbSuccess = await this.idbAdapter.clear();
    const lsSuccess = await this.lsAdapter.clear();
    return idbSuccess && lsSuccess;
  }

  getType(): 'localStorage' | 'indexedDB' {
    return this.preferIDB ? 'indexedDB' : 'localStorage';
  }

  setPreferIndexedDB(prefer: boolean): void {
    this.preferIDB = prefer;
    logger.info(`[Storage] Switched to ${prefer ? 'IndexedDB' : 'localStorage'}`);
  }
}

export { LocalStorageAdapter, IndexedDBAdapter };

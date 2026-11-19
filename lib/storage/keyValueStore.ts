import IDB from '../idb';
import type { NoteItem } from './types';

/**
 * The plain key/value store behind settings, sync configs, conflicts and the
 * guest's legacy notes: IndexedDB once enabled, localStorage until then.
 * Values are stored as given; sealing is the caller's job.
 */
export class KeyValueStore {
  useIndexedDB = false;

  /** Raw read: IndexedDB if enabled, else localStorage. */
  async readKeyValue(key: string): Promise<unknown> {
    if (this.useIndexedDB) {
      const data = await IDB.getItem(key);
      if (data) return data;
    }
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }

  /** Write to IndexedDB (enabling it on first success), else localStorage. */
  async writeKeyValue(key: string, value: unknown): Promise<void> {
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
   * Reads a raw value. Unlike a missing key (null), an IndexedDB or parse
   * error is thrown: callers write the result back, so treating "unreadable"
   * as "empty" would erase the data.
   */
  async readStoredValue<T>(key: string): Promise<T | null> {
    if (this.useIndexedDB) {
      const item = await IDB.getItem<T>(key);
      if (item !== undefined && item !== null) {
        return item;
      }
    }
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  /** Writes where the store currently is, without switching to IndexedDB. */
  async writeStoredValue<T>(key: string, value: T): Promise<void> {
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
  async readLegacyNotes(key: string): Promise<NoteItem[]> {
    const stored = await this.readStoredValue<unknown>(key);
    if (!stored) return [];
    if (Array.isArray(stored)) {
      return stored as NoteItem[];
    }
    throw new Error(`Unrecognized notes payload under ${key}`);
  }

  /** Reads `key` from IndexedDB, else localStorage, whether or not IndexedDB is enabled. */
  async readFromEitherStore<T>(key: string): Promise<T | null> {
    const fromIdb = await IDB.getItem<T>(key);
    if (fromIdb !== undefined && fromIdb !== null) return fromIdb;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
}

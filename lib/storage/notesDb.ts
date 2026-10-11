import { QCRuntime, type QCDb } from '../../qcruntime/qcnote-runtime';
import {
  fetchVaultKey,
  getDeviceFingerprint,
  getDeviceSessionToken,
  setDeviceSessionToken,
  validateDeviceSessionToken,
} from './deviceSession';
import { notesDbName } from './namespace';
import { NOTE_STORE_SCHEMA } from './noteSchema';

/** How long a locked signed-in user's notes DB waits before the next unlock attempt. */
export const NOTES_DB_RETRY_MS = 10_000;

/**
 * The open connection to the current user's notes DB (encrypted for a
 * signed-in user, plaintext for the guest), plus why it couldn't be opened.
 */
export class NotesDbConnection {
  private db: QCDb | null = null;
  private dbName: string | null = null;
  /** The open in progress, if any; see ensure. */
  private opening: { dbName: string; promise: Promise<QCDb | null> } | null = null;
  private openFailed = false;
  /** Earliest time (ms) a failed open of a signed-in user's notes DB is retried. */
  private retryAt = 0;
  /**
   * True when the last ensure() attempt failed specifically because a
   * server-held vault key couldn't be fetched (e.g. offline) and no
   * already-migrated local key was available to fall back to.
   */
  locked = false;

  /**
   * @param onGuestDbOpened runs after the guest DB is opened; a failure is
   *   logged and leaves the DB usable.
   */
  constructor(
    private readonly prefix: string,
    private readonly onGuestDbOpened: (db: QCDb) => Promise<void>,
  ) {}

  /** The notes DB for `userId`, or null when it can't be opened (see `locked`). */
  async ensure(userId: string | null): Promise<QCDb | null> {
    const dbName = notesDbName(this.prefix, userId);
    if (this.db && this.dbName === dbName) {
      return this.db;
    }
    // Reads don't take the write lock, so several can arrive while the DB is
    // still opening. Share one open: each extra one would fetch the vault key
    // again and leave its own connection open once the next replaced it.
    if (this.opening?.dbName === dbName) {
      return this.opening.promise;
    }
    const opening = { dbName, promise: this.open(userId, dbName) };
    this.opening = opening;
    try {
      return await opening.promise;
    } finally {
      if (this.opening === opening) this.opening = null;
    }
  }

  private async open(userId: string | null, dbName: string): Promise<QCDb | null> {
    this.close();

    if (this.openFailed) {
      // A guest stays on the fallback store for the rest of the session. A
      // signed-in user's open usually fails because the vault key couldn't
      // be fetched (offline, backend down), so retry after a pause instead
      // of staying locked until the page is reloaded.
      if (!userId || Date.now() < this.retryAt) return null;
      this.openFailed = false;
    }

    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      this.openFailed = true;
      return null;
    }

    this.locked = false;

    try {
      // A signed-in user's notes DB is always encrypted under the vault
      // scheme: a validated device session token buys the server-held KEK.
      let sessionToken: string | undefined;
      let kekBytes: Uint8Array | undefined;
      if (userId) {
        sessionToken = getDeviceSessionToken(userId) ?? undefined;
        if (!sessionToken) {
          throw new Error('Device session token is required to open encrypted notes database');
        }
        // Validating the token and fetching the vault key both need the
        // device fingerprint — compute it once.
        const fingerprint = await getDeviceFingerprint();
        const validToken = fingerprint ? await validateDeviceSessionToken(sessionToken) : false;
        if (!validToken) {
          setDeviceSessionToken(userId, null);
          throw new Error('Invalid or expired device session token');
        }
        kekBytes = (await fetchVaultKey(sessionToken, fingerprint)) ?? undefined;
      }

      const db = await QCRuntime.open(
        dbName,
        [NOTE_STORE_SCHEMA],
        1,
        undefined,
        sessionToken,
        kekBytes,
      );
      this.db = db;
      this.dbName = dbName;
      this.openFailed = false;
      if (!userId) {
        try {
          await this.onGuestDbOpened(db);
        } catch (e) {
          console.warn('[NoteStorage] 合并旧存储中的访客笔记失败，已保留原数据', e);
        }
      }
      return db;
    } catch (e) {
      console.warn('[NoteStorage] QCRuntime.open failed', e);
      this.openFailed = true;
      // A signed-in user has no fallback store, so any failure to open their
      // encrypted DB — offline, bad token, a KEK that no longer unwraps the
      // DEK — means their notes are unreachable, not that there are none.
      // (A guest falls back to the plaintext legacy key/value store.)
      if (userId) {
        this.locked = true;
        this.retryAt = Date.now() + NOTES_DB_RETRY_MS;
      }
      return null;
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbName = null;
    }
  }

  /** Closes the DB and forgets earlier failures, e.g. on a user switch. */
  reset(): void {
    this.close();
    this.openFailed = false;
    this.locked = false;
  }

  /**
   * Runs `task` against the guest notes DB through a separate handle, so the
   * signed-in user's DB is never swapped out from under concurrent reads.
   */
  async withGuestDb<T>(task: (db: QCDb) => Promise<T>): Promise<T> {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      throw new Error('IndexedDB unavailable');
    }
    const guestDb = await QCRuntime.open(notesDbName(this.prefix, null), [NOTE_STORE_SCHEMA], 1);
    try {
      return await task(guestDb);
    } finally {
      await guestDb.close().catch(() => {});
    }
  }
}

import IDB from '../idb';
import Indexer from '../indexer';
import type { QCDb } from '../../qcruntime/qcnote-runtime';
import type { KeyValueStore } from './keyValueStore';
import { normalizeNote } from './linkGraph';
import { NOTE_STORE_SCHEMA } from './noteSchema';
import type { NotesDbConnection } from './notesDb';
import {
  ONEDRIVE_CONFIG_SPEC,
  WEBDAV_CONFIG_SPEC,
  readGuestSyncConfig,
  type SyncConfigSpec,
} from './syncConfig';
import type { NoteItem, UserSettings } from './types';

/** The parts of NoteStorage that moving the guest's data into an account touches. */
export interface GuestMigrationHost {
  readonly kv: KeyValueStore;
  readonly notesDb: NotesDbConnection;
  /** The signed-in user, or null for the guest. */
  currentUserId(): string | null;
  /** `baseKey` in the guest's key/value namespace. */
  guestKey(baseKey: string): string;
  /** Where the current account keeps what the guest's settings and sync configs move to. */
  accountKeys(): { settings: string; webdavConfig: string; oneDriveConfig: string };
  /** Strict read of the current user's notes. */
  loadNotes(): Promise<NoteItem[]>;
  /** Locked read-modify-write of the current user's notes; see NoteStorage.mutateNotes. */
  mutateNotes(mutate: (notes: NoteItem[]) => NoteItem[] | null): Promise<NoteItem[] | null>;
  setSettings(settings: UserSettings): Promise<boolean>;
  /** Saves a sync config for the current user (sealed when signed in). */
  writeSyncConfig<T extends object>(key: string, config: T, spec: SyncConfigSpec<T>): Promise<void>;
}

/**
 * Moves notes from the guest's legacy key/value store (under `legacyKey`)
 * into the guest notes DB. Notes land there when the DB couldn't be opened
 * (the guest fallback) or were written by older versions; without this they
 * stay invisible until sign-in. The legacy copy is emptied only after the DB
 * accepted them, and notes the DB already has are left alone.
 */
export async function absorbLegacyGuestNotes(
  kv: KeyValueStore,
  legacyKey: string,
  db: QCDb,
): Promise<void> {
  const legacy = await kv.readLegacyNotes(legacyKey);
  if (legacy.length === 0) return;
  const store = NOTE_STORE_SCHEMA.name;
  const existingIds = new Set((await db.find<NoteItem>(store, {})).map((n) => n.id));
  const incoming = legacy.filter((n) => !existingIds.has(n.id)).map((n) => normalizeNote(n));
  if (incoming.length > 0) {
    await db.bulkWrite(store, incoming, []);
    Indexer.invalidateIndex();
  }
  await kv.writeStoredValue(legacyKey, []);
}

/**
 * Moves guest notes into the signed-in user's store. The guest copy is only
 * cleared after the user's store has durably accepted the notes; on any
 * failure both copies are left as they were, and a retry is idempotent.
 */
export async function migrateGuestDataToUser(host: GuestMigrationHost): Promise<boolean> {
  const userId = host.currentUserId();
  if (!userId) {
    return false;
  }

  let guestNotes: NoteItem[];
  try {
    const legacyNotes = await host.kv.readLegacyNotes(host.guestKey('STORAGE'));
    const runtimeNotes = await readGuestNotes(host);
    guestNotes = [...legacyNotes, ...runtimeNotes];
  } catch (e) {
    console.warn('[NoteStorage] 读取访客笔记失败，跳过迁移', e);
    return false;
  }

  if (guestNotes.length === 0) {
    return false;
  }

  try {
    await host.mutateNotes((current) => {
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

  await clearGuestNamespace(host);
  await clearGuestNotes(host);
  return true;
}

async function readGuestNotes(host: GuestMigrationHost): Promise<NoteItem[]> {
  if (host.currentUserId() === null) {
    // the current notes DB already is the guest DB
    return host.loadNotes();
  }
  return host.notesDb.withGuestDb((db) => db.find<NoteItem>(NOTE_STORE_SCHEMA.name, {}));
}

async function clearGuestNotes(host: GuestMigrationHost): Promise<void> {
  try {
    await host.notesDb.withGuestDb((db) => db.clear(NOTE_STORE_SCHEMA.name));
  } catch (e) {
    console.warn('[NoteStorage] clearGuestNotesAsync failed', e);
  }
}

/**
 * Empties the guest namespace once its notes are in the account. Settings
 * and sync configs go along with the notes unless the account already has
 * its own; one that can't be moved (e.g. a secret that no longer decrypts)
 * is left in place rather than lost. The rest (conflicts, sync bases,
 * search cache) describes the guest's copy of the notes and is dropped:
 * the next sync with no base merges without deleting anything.
 */
async function clearGuestNamespace(host: GuestMigrationHost): Promise<void> {
  const kv = host.kv;
  const guestKey = (baseKey: string) => host.guestKey(baseKey);
  const account = host.accountKeys();
  const toDelete = [
    guestKey('STORAGE'),
    guestKey('CONFLICTS'),
    guestKey('SYNC_BASE_WEBDAV'),
    guestKey('SYNC_BASE_ONEDRIVE'),
    guestKey('SEMANTIC_CACHE'),
  ];

  const moves: [string, string, () => Promise<void>][] = [
    [
      guestKey('SETTINGS'),
      account.settings,
      async () => {
        const settings = await kv.readFromEitherStore<UserSettings>(guestKey('SETTINGS'));
        if (settings && !(await host.setSettings(settings))) {
          throw new Error('Failed to save settings');
        }
      },
    ],
    [
      guestKey('WEBDAV_CONFIG'),
      account.webdavConfig,
      () =>
        moveGuestSyncConfig(
          host,
          guestKey('WEBDAV_CONFIG'),
          account.webdavConfig,
          WEBDAV_CONFIG_SPEC,
        ),
    ],
    [
      guestKey('ONEDRIVE_CONFIG'),
      account.oneDriveConfig,
      () =>
        moveGuestSyncConfig(
          host,
          guestKey('ONEDRIVE_CONFIG'),
          account.oneDriveConfig,
          ONEDRIVE_CONFIG_SPEC,
        ),
    ],
  ];
  for (const [fromKey, toKey, move] of moves) {
    try {
      // the account's own copy wins; the guest's is then discarded
      if ((await kv.readFromEitherStore(toKey)) === null) await move();
      toDelete.push(fromKey);
    } catch (e) {
      console.warn(`[NoteStorage] 无法把 ${fromKey} 迁移到账号，已保留访客副本`, e);
    }
  }

  for (const key of toDelete) {
    await IDB.deleteItem(key).catch(() => {});
    localStorage.removeItem(key);
  }
}

/** Decrypts a guest sync config with the device key and saves it sealed for the user. */
async function moveGuestSyncConfig<T extends object>(
  host: GuestMigrationHost,
  fromKey: string,
  toKey: string,
  spec: SyncConfigSpec<T>,
): Promise<void> {
  const config = await readGuestSyncConfig(host.kv, fromKey, spec);
  if (!config) return;
  await host.writeSyncConfig(toKey, config, spec);
}

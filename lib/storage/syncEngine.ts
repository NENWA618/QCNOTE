// Three-way sync between the local notes and one remote notes file (WebDAV,
// OneDrive). Everything here is pure; NoteStorage owns I/O and locking.
//
// The "base" is what both sides agreed on at the end of the last successful
// sync, recorded per note as a hash of its user-edited fields. Comparing each
// side against the base tells us which side changed a note, instead of
// guessing from timestamps (clock skew) or treating every difference as a
// conflict. It also turns "present in the base, missing on one side" into a
// deletion that propagates, without needing tombstones.
import type { NoteConflict, NoteItem, NoteVersion } from './types';

export type SyncStrategy = 'manual' | 'prefer-local' | 'prefer-remote' | 'newest';

/** note id -> noteSyncHash() at the last point both sides agreed. */
export type SyncBaseHashes = Record<string, string>;

/** Persisted per provider + user. `remoteId` ties the base to one remote file. */
export interface SyncBase {
  remoteId: string;
  hashes: SyncBaseHashes;
}

/** cyrb53: a fast, well-distributed 53-bit string hash. */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Hash of the fields a user actually edits. Derived or bookkeeping fields
 * (links, backlinks, versions, sentiment, timestamps) are left out so that
 * recomputing them on one device never registers as an edit.
 */
export function noteSyncHash(note: NoteItem): string {
  return cyrb53(
    JSON.stringify([
      note.title ?? '',
      note.content ?? '',
      note.category ?? '',
      note.tags ?? [],
      note.color ?? '',
      note.coloredRanges ?? [],
      Boolean(note.isFavorite),
      Boolean(note.isArchived),
      Boolean(note.isDeleted),
    ]),
  );
}

/**
 * Returns `base` if it plausibly describes `remote`, else null (merge as a
 * first sync: union everything, delete nothing). `remote` is null when the
 * remote file doesn't exist.
 *
 * Without this, "the file is gone" or "this is a different file" (e.g. the
 * same OneDrive path in another account) would read as "the remote deleted
 * every note", and the merge would delete them all locally. An existing but
 * empty file is trusted: that is how "all notes were deleted" looks. The
 * cost is that a remote where every base note was replaced by new ones
 * brings the old ones back — resurrecting beats losing data.
 */
export function applicableBase(
  base: SyncBaseHashes | null,
  remote: NoteItem[] | null,
): SyncBaseHashes | null {
  if (!base || Object.keys(base).length === 0) return base;
  if (remote === null) return null;
  if (remote.length === 0) return base;
  return remote.some((note) => base[note.id] !== undefined) ? base : null;
}

export interface ThreeWayMergeInput {
  local: NoteItem[];
  remote: NoteItem[];
  /** null on the first sync with this remote: union everything, delete nothing. */
  base: SyncBaseHashes | null;
  /** Notes with an unresolved conflict; left exactly as they are on both sides. */
  pending: ReadonlySet<string>;
  strategy: SyncStrategy;
  now?: number;
}

export interface ThreeWayMergeResult {
  nextLocal: NoteItem[];
  nextRemote: NoteItem[];
  /** New manual conflicts (only with strategy 'manual'). */
  conflicts: NoteConflict[];
  /** True if nextRemote differs from what was downloaded, i.e. an upload is needed. */
  remoteChanged: boolean;
  /** The base to persist once nextLocal is saved but before the upload lands. */
  baseAfterLocal: SyncBaseHashes;
  /** The base to persist once nextRemote has been uploaded. */
  baseAfterUpload: SyncBaseHashes;
}

/** Keeps the losing side of an auto-resolved conflict in the winner's history. */
function withLoserVersion(winner: NoteItem, loser: NoteItem, now: number): NoteItem {
  const version: NoteVersion = {
    versionId: `sync_${now}_${loser.updatedAt}`,
    title: loser.title,
    content: loser.content,
    category: loser.category,
    tags: [...(loser.tags ?? [])],
    color: loser.color,
    coloredRanges: loser.coloredRanges,
    isFavorite: loser.isFavorite,
    isArchived: loser.isArchived,
    updatedAt: loser.updatedAt,
  };
  return { ...winner, versions: [...(winner.versions ?? []), version].slice(-20) };
}

export function threeWayMerge(input: ThreeWayMergeInput): ThreeWayMergeResult {
  const { pending, strategy } = input;
  const now = input.now ?? Date.now();
  const base = input.base ?? {};
  const localById = new Map(input.local.map((n) => [n.id, n]));
  const remoteById = new Map(input.remote.map((n) => [n.id, n]));

  // Local order first, then notes only the remote (or only the base) knows.
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of [...localById.keys(), ...remoteById.keys(), ...Object.keys(base)]) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  const nextLocal: NoteItem[] = [];
  const nextRemote: NoteItem[] = [];
  const conflicts: NoteConflict[] = [];
  const baseAfterLocal: SyncBaseHashes = {};
  const baseAfterUpload: SyncBaseHashes = {};
  let remoteChanged = false;

  /** Both sides end up with `note`. */
  const agree = (id: string, note: NoteItem, remote: NoteItem | undefined) => {
    nextLocal.push(note);
    nextRemote.push(note);
    const hash = noteSyncHash(note);
    baseAfterUpload[id] = hash;
    if (remote && noteSyncHash(remote) === hash) {
      // remote already has this content: agreed even if the upload fails
      baseAfterLocal[id] = hash;
    } else {
      remoteChanged = true;
      if (base[id] !== undefined) baseAfterLocal[id] = base[id];
    }
  };

  /** Neither side keeps the note. */
  const drop = (id: string, remote: NoteItem | undefined) => {
    if (remote) {
      // still on the remote until the upload lands; keep the base entry so a
      // retry still sees "deleted locally, unchanged remotely"
      remoteChanged = true;
      if (base[id] !== undefined) baseAfterLocal[id] = base[id];
    }
  };

  const resolve = (id: string, local: NoteItem, remote: NoteItem) => {
    if (strategy === 'manual') {
      nextLocal.push(local);
      nextRemote.push(remote);
      conflicts.push({ id, local, remote, resolved: false, createdAt: now });
      // Record the remote side as seen: once the user resolves the conflict,
      // their choice differs from the base while the remote doesn't, so the
      // next sync uploads it.
      baseAfterLocal[id] = noteSyncHash(remote);
      baseAfterUpload[id] = baseAfterLocal[id];
      return;
    }
    const localWins =
      strategy === 'prefer-local' ||
      (strategy === 'newest' && (local.updatedAt ?? 0) > (remote.updatedAt ?? 0));
    const winner = localWins
      ? withLoserVersion(local, remote, now)
      : withLoserVersion(remote, local, now);
    agree(id, winner, remote);
  };

  for (const id of ids) {
    const local = localById.get(id);
    const remote = remoteById.get(id);
    const baseHash = base[id];

    if (pending.has(id)) {
      if (local) nextLocal.push(local);
      if (remote) nextRemote.push(remote);
      if (baseHash !== undefined) {
        baseAfterLocal[id] = baseHash;
        baseAfterUpload[id] = baseHash;
      }
      continue;
    }

    if (local && remote) {
      const localHash = noteSyncHash(local);
      const remoteHash = noteSyncHash(remote);
      if (localHash === remoteHash) {
        // same content: leave each side's bookkeeping fields alone
        nextLocal.push(local);
        nextRemote.push(remote);
        baseAfterLocal[id] = localHash;
        baseAfterUpload[id] = localHash;
      } else if (baseHash !== undefined && localHash === baseHash) {
        agree(id, remote, remote); // only the remote changed
      } else if (baseHash !== undefined && remoteHash === baseHash) {
        agree(id, local, remote); // only the local copy changed
      } else {
        resolve(id, local, remote); // both changed, or first sync and they differ
      }
    } else if (local) {
      if (baseHash === undefined) {
        agree(id, local, undefined); // new locally
      } else if (noteSyncHash(local) === baseHash) {
        drop(id, undefined); // deleted remotely, untouched locally
      } else {
        agree(id, local, undefined); // deleted remotely but edited locally: keep the edit
      }
    } else if (remote) {
      if (baseHash === undefined) {
        agree(id, remote, remote); // new remotely
      } else if (noteSyncHash(remote) === baseHash) {
        drop(id, remote); // deleted locally, untouched remotely
      } else {
        agree(id, remote, remote); // deleted locally but edited remotely: keep the edit
      }
    }
    // in the base only: deleted on both sides, nothing left to track
  }

  return { nextLocal, nextRemote, conflicts, remoteChanged, baseAfterLocal, baseAfterUpload };
}

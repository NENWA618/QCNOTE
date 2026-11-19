import { z } from 'zod';
import { decryptText, encryptText } from './crypto';
import { normalizeNote, syncLinkGraph } from './linkGraph';
import { normalizeWebDAVUrl, webdavFetch, webdavTransport, type SyncTransport } from './remoteSync';
import {
  applicableBase,
  isRolledBack,
  noteSyncHash,
  remoteBodyHash,
  threeWayMerge,
  withSeenBody,
  type SyncBase,
  type SyncStrategy,
  type ThreeWayMergeResult,
} from './syncEngine';
import type { NoteConflict, NoteItem, WebDAVConfig } from './types';
import { UserChangedError, type WriteLock } from './writeLock';

export type SyncProvider = 'webdav' | 'onedrive';

/** The parts of NoteStorage a sync reads and writes. */
export interface SyncHost {
  readonly lock: WriteLock;
  /** Strict read of all notes. */
  loadNotes(): Promise<NoteItem[]>;
  /** Read-modify-write of the notes; the caller must hold the write lock. */
  mutateNotesUnlocked(mutate: (notes: NoteItem[]) => NoteItem[] | null): Promise<NoteItem[] | null>;
  /** Strict read of the conflict list. */
  readConflicts(): Promise<NoteConflict[]>;
  writeConflicts(conflicts: NoteConflict[]): Promise<void>;
  /** The stored base, or null if none was recorded for `remoteId`. */
  readSyncBase(provider: SyncProvider, remoteId: string): Promise<SyncBase | null>;
  writeSyncBase(provider: SyncProvider, base: SyncBase): Promise<void>;
}

const remoteColoredRange = z.object({
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
  color: z.string(),
});

// purely cosmetic: drop malformed ranges instead of rejecting the note
const remoteColoredRanges = z
  .array(z.unknown())
  .optional()
  .transform((ranges) =>
    ranges?.flatMap((range) => {
      const parsed = remoteColoredRange.safeParse(range);
      return parsed.success && parsed.data.startIndex < parsed.data.endIndex ? [parsed.data] : [];
    }),
  );

const remoteVersion = z.looseObject({
  versionId: z.string().min(1),
  title: z.string().default(''),
  content: z.string().default(''),
  category: z.string().default(''),
  tags: z.array(z.string()).default([]),
  color: z.string().default(''),
  coloredRanges: remoteColoredRanges,
  updatedAt: z.number(),
});

/**
 * Shape of one note in a downloaded notes file. Lenient on what older
 * clients may have left out, strict on types, and keeps unknown fields so a
 * newer client's data survives the round trip.
 */
const remoteNoteSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string().default(''),
  content: z.string().default(''),
  category: z.string().default(''),
  tags: z.array(z.string()).default([]),
  color: z.string().default(''),
  coloredRanges: remoteColoredRanges,
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  isDeleted: z.boolean().optional(),
  links: z.array(z.string()).optional(),
  backlinks: z.array(z.string()).optional(),
  // history only: drop malformed versions instead of rejecting the whole
  // file, but never let one through to code that reads them
  versions: z
    .array(z.unknown())
    .optional()
    .transform((versions) =>
      versions?.flatMap((version) => {
        const parsed = remoteVersion.safeParse(version);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
});

/**
 * Validates a parsed notes file. All or nothing: dropping one bad note
 * would read as "deleted on the remote" and delete it locally too.
 */
function validateRemoteNotes(value: unknown): NoteItem[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  const notes: NoteItem[] = [];
  for (const item of value) {
    const parsed = remoteNoteSchema.safeParse(item);
    if (!parsed.success || ids.has(parsed.data.id)) return null;
    ids.add(parsed.data.id);
    notes.push(normalizeNote(parsed.data as NoteItem));
  }
  return notes;
}

/**
 * Decodes a downloaded notes file, or returns null if it isn't one we can
 * read. With a key, a plaintext file is still decoded (a remote written
 * before encryption was turned on; runSync decides whether to trust it);
 * ciphertext under another key is not.
 */
async function parseRemoteNotes(
  raw: string,
  key?: string,
): Promise<{ notes: NoteItem[]; encrypted: boolean } | null> {
  const parseArray = (text: string): NoteItem[] | null => {
    try {
      return validateRemoteNotes(JSON.parse(text));
    } catch {
      return null;
    }
  };
  if (key) {
    let plain: string | null = null;
    try {
      plain = await decryptText(raw, key);
    } catch {
      // not encrypted with this key: fall through to the plaintext check
    }
    if (plain !== null) {
      const notes = parseArray(plain);
      return notes ? { notes, encrypted: true } : null;
    }
  }
  const notes = parseArray(raw);
  return notes ? { notes, encrypted: false } : null;
}

/**
 * Explicit "overwrite the remote with this device's notes": discards
 * remote-only changes. Returns false on any failure.
 */
export async function pushToWebDAV(
  host: SyncHost,
  config: WebDAVConfig,
  encrypt: boolean,
): Promise<boolean> {
  // `config` is the current user's: never push another session's notes to it.
  const generation = host.lock.generation;
  try {
    // Strict read: pushing an empty list after a failed read would wipe
    // the remote copy.
    const allNotes = await host.loadNotes();
    let payload = JSON.stringify(allNotes);
    const encrypted = Boolean(encrypt && config.encryptionKey);
    if (encrypted) payload = await encryptText(payload, config.encryptionKey!);
    host.lock.assertGeneration(generation);
    const url = normalizeWebDAVUrl(config);
    const response = await webdavFetch('PUT', url, config, payload);
    if (!response.ok) return false;
    // Both sides now hold exactly these notes.
    const hashes = Object.fromEntries(allNotes.map((n) => [n.id, noteSyncHash(n)]));
    const remoteId = webdavTransport(config).remoteId;
    await host.lock.runForGeneration(generation, async () => {
      const stored = await host.readSyncBase('webdav', remoteId);
      await host.writeSyncBase('webdav', {
        remoteId,
        hashes,
        encrypted,
        seen: withSeenBody(stored?.seen, remoteBodyHash(payload)),
      });
    });
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
export async function runSync(
  host: SyncHost,
  provider: SyncProvider,
  transport: SyncTransport,
  opts: { key?: string; strategy: SyncStrategy; upload: boolean },
): Promise<boolean> {
  // `transport` and `key` come from the current user's sync config: if the
  // user changes before we write, this download belongs to someone else.
  const generation = host.lock.generation;
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
      let remoteEncrypted = false;
      if (snapshot) {
        const parsed = await parseRemoteNotes(snapshot.body, key);
        if (!parsed) {
          console.warn(`[NoteStorage] ${provider} 远程文件无法解密或解析，已中止同步以免覆盖远端`);
          return false;
        }
        remoteNotes = parsed.notes;
        remoteEncrypted = parsed.encrypted;
      }
      // With a key, a plaintext remote is ours to encrypt: upload it even if
      // the merge changed nothing, so it doesn't stay plaintext.
      const plaintextUnderKey = Boolean(key && snapshot && !remoteEncrypted);
      const downloadedHash = snapshot ? remoteBodyHash(snapshot.body) : null;

      // Base, merge, conflicts and the new base are read and written in
      // one locked step, so they all land in the store of the user this
      // sync started for.
      const result = await host.lock.runForGeneration(generation, async () => {
        const stored = await host.readSyncBase(provider, transport.remoteId);
        if (plaintextUnderKey && stored?.encrypted) {
          // It was ciphertext last time: plaintext now means someone other
          // than us wrote it. Never merge notes we can't authenticate.
          console.warn(
            `[NoteStorage] ${provider} 远程文件上次同步时已加密，现在却是明文，已中止同步` +
              (provider === 'webdav' ? '。如需用本机笔记覆盖远端，请使用“覆盖上传”' : ''),
          );
          return null;
        }
        const storedBase = stored?.hashes ?? null;
        const rolledBack = downloadedHash !== null && isRolledBack(stored?.seen, downloadedHash);
        const base = rolledBack ? null : applicableBase(storedBase, snapshot ? remoteNotes : null);
        if (rolledBack) {
          // Merged against the base, every note made since that older state
          // would read as deleted remotely and be deleted here too.
          console.warn(
            `[NoteStorage] ${provider} 远程文件回到了之前的某个版本，按首次同步合并（不删除任何笔记）`,
          );
        } else if (storedBase && !base) {
          console.warn(
            `[NoteStorage] ${provider} 远程文件不存在或与上次同步的不是同一个，按首次同步合并（不删除任何笔记）`,
          );
        }
        // Strict reads/writes: merging without knowing which notes are in
        // conflict would overwrite them, and a base recorded without its
        // conflicts would make the next sync upload over the remote edit.
        const pending = new Set((await host.readConflicts()).map((c) => c.id));
        const merged: { result?: ThreeWayMergeResult } = {};
        await host.mutateNotesUnlocked((localNotes) => {
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
          const existing = await host.readConflicts();
          await host.writeConflicts([
            ...existing.filter((c) => !newIds.has(c.id)),
            ...mergeResult.conflicts,
          ]);
        }
        const seen = downloadedHash ? withSeenBody(stored?.seen, downloadedHash) : stored?.seen;
        await host.writeSyncBase(provider, {
          remoteId: transport.remoteId,
          hashes: mergeResult.baseAfterLocal,
          // the remote is unchanged so far: once encrypted, stays encrypted
          encrypted: Boolean(key) && (remoteEncrypted || Boolean(stored?.encrypted)),
          seen,
        });
        return { mergeResult, seen };
      });
      if (!result) return false;
      const { mergeResult } = result;
      let seen = result.seen;

      if (!opts.upload) return true;
      // Uploading is still safe after a switch (it's this user's merged
      // data going to this user's remote), but skip it: nothing would
      // record the new base for it.
      host.lock.assertGeneration(generation);
      const uploading = mergeResult.remoteChanged || plaintextUnderKey;
      if (uploading) {
        let payload = JSON.stringify(mergeResult.nextRemote);
        if (key) payload = await encryptText(payload, key);
        if ((await transport.put(payload, snapshot)) === 'conflict') {
          console.info(`[NoteStorage] ${provider} 远端在同步期间被修改，重试 (${attempt})`);
          continue;
        }
        seen = withSeenBody(seen, remoteBodyHash(payload));
      }
      await host.lock.runForGeneration(generation, () =>
        host.writeSyncBase(provider, {
          remoteId: transport.remoteId,
          hashes: mergeResult.baseAfterUpload,
          encrypted: Boolean(key) && (uploading || remoteEncrypted),
          seen,
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

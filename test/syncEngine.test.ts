import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoteStorage, type NoteConflict, type NoteItem, type WebDAVConfig } from '../lib/storage';
import {
  applicableBase,
  noteSyncHash,
  threeWayMerge,
  type SyncBaseHashes,
} from '../lib/storage/syncEngine';
import IDB from '../lib/idb';

const note = (id: string, over: Partial<NoteItem> = {}): NoteItem => ({
  id,
  title: id,
  content: '',
  category: '生活',
  tags: [],
  color: '#000',
  isFavorite: false,
  isArchived: false,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const baseOf = (...notes: NoteItem[]): SyncBaseHashes =>
  Object.fromEntries(notes.map((n) => [n.id, noteSyncHash(n)]));

const ids = (notes: NoteItem[]) => notes.map((n) => n.id).sort();
const byId = (notes: NoteItem[], id: string) => notes.find((n) => n.id === id);

describe('noteSyncHash', () => {
  it('changes with user-edited fields only', () => {
    const n = note('a', { content: 'x' });
    expect(noteSyncHash({ ...n, content: 'y' })).not.toBe(noteSyncHash(n));
    expect(noteSyncHash({ ...n, isDeleted: true })).not.toBe(noteSyncHash(n));
    expect(
      noteSyncHash({
        ...n,
        updatedAt: 99,
        backlinks: ['b'],
        links: ['c'],
        versions: [],
        sentimentScore: 3,
      }),
    ).toBe(noteSyncHash(n));
  });
});

describe('applicableBase', () => {
  const base = baseOf(note('a'), note('b'));

  it('trusts a base that shares notes with the remote, or an empty remote file', () => {
    expect(applicableBase(base, [note('b'), note('c')])).toBe(base);
    expect(applicableBase(base, [])).toBe(base);
  });

  it('drops the base when the remote file is missing or shares no notes with it', () => {
    expect(applicableBase(base, null)).toBeNull();
    expect(applicableBase(base, [note('x')])).toBeNull();
  });

  it('passes a missing or empty base through', () => {
    expect(applicableBase(null, null)).toBeNull();
    expect(applicableBase({}, null)).toEqual({});
  });
});

describe('threeWayMerge', () => {
  const merge = (
    local: NoteItem[],
    remote: NoteItem[],
    base: SyncBaseHashes | null,
    strategy: 'manual' | 'prefer-local' | 'prefer-remote' | 'newest' = 'manual',
    pending: string[] = [],
  ) => threeWayMerge({ local, remote, base, pending: new Set(pending), strategy, now: 1000 });

  it('takes a change made only on the remote', () => {
    const a = note('a', { content: 'v1' });
    const remote = { ...a, content: 'v2' };
    const r = merge([a], [remote], baseOf(a));
    expect(byId(r.nextLocal, 'a')?.content).toBe('v2');
    expect(r.remoteChanged).toBe(false);
    expect(r.conflicts).toEqual([]);
  });

  it('pushes a change made only locally', () => {
    const a = note('a', { content: 'v1' });
    const local = { ...a, content: 'v2' };
    const r = merge([local], [a], baseOf(a));
    expect(byId(r.nextRemote, 'a')?.content).toBe('v2');
    expect(r.remoteChanged).toBe(true);
    expect(r.conflicts).toEqual([]);
  });

  it('does not report a conflict when both sides made the same edit', () => {
    const a = note('a', { content: 'v1' });
    const r = merge([{ ...a, content: 'v2' }], [{ ...a, content: 'v2', updatedAt: 5 }], baseOf(a));
    expect(r.conflicts).toEqual([]);
    expect(r.remoteChanged).toBe(false);
  });

  it('records a manual conflict for different edits on both sides', () => {
    const a = note('a', { content: 'v1' });
    const local = { ...a, content: 'mine' };
    const remote = { ...a, content: 'theirs' };
    const r = merge([local], [remote], baseOf(a));
    expect(r.conflicts.map((c) => [c.local.content, c.remote.content])).toEqual([
      ['mine', 'theirs'],
    ]);
    // each side keeps its own copy until the user decides
    expect(byId(r.nextLocal, 'a')?.content).toBe('mine');
    expect(byId(r.nextRemote, 'a')?.content).toBe('theirs');
    expect(r.remoteChanged).toBe(false);
    // the remote side counts as seen, so the user's choice uploads next time
    expect(r.baseAfterUpload.a).toBe(noteSyncHash(remote));
  });

  it('auto-resolves by strategy and keeps the losing edit in version history', () => {
    const a = note('a', { content: 'v1' });
    const local = { ...a, content: 'mine', updatedAt: 10 };
    const remote = { ...a, content: 'theirs', updatedAt: 20 };

    const newest = merge([local], [remote], baseOf(a), 'newest');
    const winner = byId(newest.nextLocal, 'a')!;
    expect(winner.content).toBe('theirs');
    expect(winner.versions?.map((v) => v.content)).toEqual(['mine']);
    expect(byId(newest.nextRemote, 'a')?.content).toBe('theirs');

    expect(byId(merge([local], [remote], baseOf(a), 'prefer-local').nextLocal, 'a')?.content).toBe(
      'mine',
    );
  });

  it('propagates a permanent deletion in either direction', () => {
    const a = note('a');
    const b = note('b');
    // deleted locally, untouched remotely -> removed from the remote
    const localDeleted = merge([b], [a, b], baseOf(a, b));
    expect(ids(localDeleted.nextRemote)).toEqual(['b']);
    expect(localDeleted.remoteChanged).toBe(true);
    // deleted remotely, untouched locally -> removed locally
    const remoteDeleted = merge([a, b], [b], baseOf(a, b));
    expect(ids(remoteDeleted.nextLocal)).toEqual(['b']);
    expect(remoteDeleted.baseAfterUpload).toEqual(baseOf(b));
  });

  it('keeps an edit that races a deletion on the other side', () => {
    const a = note('a', { content: 'v1' });
    const edited = { ...a, content: 'v2' };
    expect(ids(merge([edited], [], baseOf(a)).nextRemote)).toEqual(['a']);
    expect(ids(merge([], [edited], baseOf(a)).nextLocal)).toEqual(['a']);
  });

  it('on a first sync unions both sides and deletes nothing', () => {
    const r = merge([note('a')], [note('b')], null);
    expect(ids(r.nextLocal)).toEqual(['a', 'b']);
    expect(ids(r.nextRemote)).toEqual(['a', 'b']);
  });

  it('leaves notes with a pending conflict untouched on both sides', () => {
    const a = note('a', { content: 'v1' });
    const r = merge(
      [{ ...a, content: 'mine' }],
      [{ ...a, content: 'newer theirs' }],
      baseOf(a),
      'manual',
      ['a'],
    );
    expect(byId(r.nextLocal, 'a')?.content).toBe('mine');
    expect(byId(r.nextRemote, 'a')?.content).toBe('newer theirs');
    expect(r.conflicts).toEqual([]);
    expect(r.remoteChanged).toBe(false);
  });

  it('only advances the base for a new local note once it is uploaded', () => {
    const r = merge([note('a')], [], {});
    expect(r.baseAfterLocal).toEqual({});
    expect(r.baseAfterUpload).toEqual(baseOf(note('a')));
  });
});

// --- Two devices against one WebDAV server -----------------------------------

const TEST_KEK = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)));

/** In-memory WebDAV file with optional ETag / conditional-request support. */
function makeServer({ etags = true }: { etags?: boolean } = {}) {
  let file: { body: string; version: number } | null = null;
  let afterNextGet: (() => Promise<void>) | null = null;
  let putCount = 0;
  const reply = (status: number, body = '', headers: Record<string, string> = {}) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      json: async () => JSON.parse(body),
      headers: new Headers(headers),
    }) as unknown as Response;

  const handler = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/device/session/validate')) return reply(200, '{"success":true}');
    if (url.includes('/api/vault/key')) {
      return reply(200, JSON.stringify({ success: true, kek: TEST_KEK }));
    }
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if ((init?.method ?? 'GET') === 'GET') {
      const res = file
        ? reply(200, file.body, etags ? { ETag: `"${file.version}"` } : {})
        : reply(404);
      if (afterNextGet) {
        const hook = afterNextGet;
        afterNextGet = null;
        await hook();
      }
      return res;
    }
    // PUT
    if (headers['If-None-Match'] === '*' && file) return reply(412);
    if (headers['If-Match'] && headers['If-Match'] !== `"${file?.version}"`) return reply(412);
    file = { body: String(init?.body), version: (file?.version ?? 0) + 1 };
    putCount++;
    return reply(201);
  };

  return {
    handler,
    /** Runs `hook` right after the next download is served (before its caller continues). */
    afterNextGet(hook: () => Promise<void>) {
      afterNextGet = hook;
    },
    get putCount() {
      return putCount;
    },
    /** Replaces the remote file as if changed outside the app (null: deletes it). */
    setFile(body: string | null) {
      file = body === null ? null : { body, version: (file?.version ?? 0) + 1 };
    },
    get body() {
      return file?.body ?? null;
    },
  };
}

let deviceCounter = 0;

/** A signed-in NoteStorage with its own notes DB, sync base and conflicts. */
async function device(): Promise<NoteStorage> {
  const userId = `device${++deviceCounter}`;
  const storage = new NoteStorage();
  sessionStorage.setItem(
    'qcnote:deviceSessionToken',
    JSON.stringify({ userId, token: `t-${userId}` }),
  );
  await storage.setCurrentUser(userId);
  expect(storage.notesDbLocked).toBe(false);
  return storage;
}

const conf = (over: Partial<WebDAVConfig> = {}): WebDAVConfig => ({
  url: 'https://dav.test/',
  username: 'u',
  password: 'p',
  remotePath: 'notes.json',
  conflictStrategy: 'manual',
  ...over,
});

const contents = async (s: NoteStorage) =>
  Object.fromEntries((await s.loadNotesAsync()).map((n) => [n.title, n.content]));

describe('WebDAV sync between two devices', () => {
  let server: ReturnType<typeof makeServer>;
  let a: NoteStorage;
  let b: NoteStorage;

  const setUp = async (opts?: { etags?: boolean }) => {
    server = makeServer(opts);
    vi.spyOn(global, 'fetch').mockImplementation(server.handler as typeof fetch);
    a = await device();
    b = await device();
  };

  beforeEach(async () => {
    if (IDB.clearStore) await IDB.clearStore().catch(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('carries notes and edits across in both directions', async () => {
    await setUp();
    const n = await a.addNoteAsync({ title: 'n', content: 'from A' });
    expect(await a.syncWithWebDAVAsync(conf())).toBe(true);
    expect(await b.syncWithWebDAVAsync(conf())).toBe(true);
    expect(await contents(b)).toEqual({ n: 'from A' });

    const bNote = (await b.loadNotesAsync())[0];
    await b.updateNoteAsync(bNote.id, { content: 'edited on B' });
    expect(await b.syncWithWebDAVAsync(conf())).toBe(true);
    expect(await a.syncWithWebDAVAsync(conf())).toBe(true);
    expect((await a.getNoteAsync(n.id))?.content).toBe('edited on B');
  });

  it('merges unrelated edits from both devices without conflicts', async () => {
    await setUp();
    const n1 = await a.addNoteAsync({ title: 'n1', content: 'v1' });
    const n2 = await a.addNoteAsync({ title: 'n2', content: 'v1' });
    await a.syncWithWebDAVAsync(conf());
    await b.syncWithWebDAVAsync(conf());

    await a.updateNoteAsync(n1.id, { content: 'A edit' });
    await b.updateNoteAsync(n2.id, { content: 'B edit' });
    await a.syncWithWebDAVAsync(conf());
    await b.syncWithWebDAVAsync(conf());
    await a.syncWithWebDAVAsync(conf());

    const expected = { n1: 'A edit', n2: 'B edit' };
    expect(await contents(a)).toEqual(expected);
    expect(await contents(b)).toEqual(expected);
    expect(await a.getConflictsAsync()).toEqual([]);
    expect(await b.getConflictsAsync()).toEqual([]);
  });

  it('does not resurrect a permanently deleted note', async () => {
    await setUp();
    const n = await a.addNoteAsync({ title: 'gone' });
    await a.addNoteAsync({ title: 'kept' });
    await a.syncWithWebDAVAsync(conf());
    await b.syncWithWebDAVAsync(conf());

    await a.permanentlyDeleteNoteAsync(n.id);
    await a.syncWithWebDAVAsync(conf());
    await b.syncWithWebDAVAsync(conf());
    await a.syncWithWebDAVAsync(conf());

    expect(Object.keys(await contents(a))).toEqual(['kept']);
    expect(Object.keys(await contents(b))).toEqual(['kept']);
  });

  it('re-uploads instead of deleting local notes when the remote file disappears', async () => {
    await setUp();
    await a.addNoteAsync({ title: 'n1' });
    await a.addNoteAsync({ title: 'n2' });
    expect(await a.syncWithWebDAVAsync(conf())).toBe(true);

    server.setFile(null);
    expect(await a.syncWithWebDAVAsync(conf())).toBe(true);

    expect(Object.keys(await contents(a)).sort()).toEqual(['n1', 'n2']);
    const uploaded = JSON.parse(server.body!) as NoteItem[];
    expect(uploaded.map((n) => n.title).sort()).toEqual(['n1', 'n2']);
  });

  it('merges instead of deleting when the remote is a different file at the same path', async () => {
    await setUp();
    await a.addNoteAsync({ title: 'mine' });
    expect(await a.syncWithWebDAVAsync(conf())).toBe(true);

    // e.g. another account's file under the same path
    server.setFile(JSON.stringify([note('other', { title: 'theirs' })]));
    expect(await a.syncWithWebDAVAsync(conf())).toBe(true);

    expect(Object.keys(await contents(a)).sort()).toEqual(['mine', 'theirs']);
  });

  it('still propagates deleting every note through an empty remote file', async () => {
    await setUp();
    const n = await a.addNoteAsync({ title: 'only' });
    await a.syncWithWebDAVAsync(conf());
    await b.syncWithWebDAVAsync(conf());

    await a.permanentlyDeleteNoteAsync(n.id);
    await a.syncWithWebDAVAsync(conf());
    expect(server.body).toBe('[]');
    await b.syncWithWebDAVAsync(conf());

    expect(await b.loadNotesAsync()).toEqual([]);
  });

  it('turns concurrent edits of one note into a conflict, then syncs the resolution', async () => {
    await setUp();
    const n = await a.addNoteAsync({ title: 'n', content: 'v1' });
    await a.syncWithWebDAVAsync(conf());
    await b.syncWithWebDAVAsync(conf());

    await a.updateNoteAsync(n.id, { content: 'A version' });
    await b.updateNoteAsync(n.id, { content: 'B version' });
    await a.syncWithWebDAVAsync(conf());
    await b.syncWithWebDAVAsync(conf());

    const [conflict] = await b.getConflictsAsync();
    expect([conflict.local.content, conflict.remote.content]).toEqual(['B version', 'A version']);
    // the conflicted note is held back from the remote until it is resolved
    await a.syncWithWebDAVAsync(conf());
    expect((await a.getNoteAsync(n.id))?.content).toBe('A version');

    expect(await b.resolveConflictAsync(n.id, { ...conflict.local, content: 'merged' })).toBe(true);
    await b.syncWithWebDAVAsync(conf());
    await a.syncWithWebDAVAsync(conf());
    expect((await a.getNoteAsync(n.id))?.content).toBe('merged');
    expect(await b.getConflictsAsync()).toEqual([]);
  });

  it('keeps a conflict found by a sync that overlaps resolving another one', async () => {
    await setUp();
    const n1 = await a.addNoteAsync({ title: 'n1', content: 'v1' });
    const n2 = await a.addNoteAsync({ title: 'n2', content: 'v1' });
    await a.syncWithWebDAVAsync(conf());
    await b.syncWithWebDAVAsync(conf());

    // conflict on n1
    await a.updateNoteAsync(n1.id, { content: 'A1' });
    await b.updateNoteAsync(n1.id, { content: 'B1' });
    await a.syncWithWebDAVAsync(conf());
    await b.syncWithWebDAVAsync(conf());
    const [conflict] = await b.getConflictsAsync();
    expect(conflict.id).toBe(n1.id);

    // the next sync finds a conflict on n2; resolve n1 while it is in flight
    await a.updateNoteAsync(n2.id, { content: 'A2' });
    await b.updateNoteAsync(n2.id, { content: 'B2' });
    await a.syncWithWebDAVAsync(conf());
    let resolving: Promise<boolean> | undefined;
    server.afterNextGet(async () => {
      resolving = b.resolveConflictAsync(n1.id, { ...conflict.local, content: 'merged' });
    });
    await b.syncWithWebDAVAsync(conf());
    expect(await resolving).toBe(true);

    expect((await b.getConflictsAsync()).map((c) => c.id)).toEqual([n2.id]);
    expect((await b.getNoteAsync(n1.id))?.content).toBe('merged');
  });

  it('does not lose a conflict found by a sync while another conflict is being added', async () => {
    await setUp();
    const n = await a.addNoteAsync({ title: 'n', content: 'v1' });
    await a.syncWithWebDAVAsync(conf());
    await b.syncWithWebDAVAsync(conf());
    await a.updateNoteAsync(n.id, { content: 'A' });
    await b.updateNoteAsync(n.id, { content: 'B' });
    await a.syncWithWebDAVAsync(conf());

    // addConflictAsync stalls between reading and writing the conflict list,
    // while b's sync records the conflict on n
    const bConflicts = b as unknown as { readConflicts: () => Promise<NoteConflict[]> };
    const read = bConflicts.readConflicts.bind(b);
    vi.spyOn(bConflicts, 'readConflicts').mockImplementationOnce(async () => {
      const conflicts = await read();
      await new Promise((r) => setTimeout(r, 50));
      return conflicts;
    });
    const other = note('other');
    let adding: Promise<boolean> | undefined;
    server.afterNextGet(async () => {
      adding = b.addConflictAsync({
        id: other.id,
        local: other,
        remote: other,
        resolved: false,
        createdAt: 1,
      });
    });
    await b.syncWithWebDAVAsync(conf());
    expect(await adding).toBe(true);

    expect((await b.getConflictsAsync()).map((c) => c.id).sort()).toEqual([n.id, other.id].sort());
  });

  it.each([true, false])(
    'retries instead of overwriting when another device uploads mid-sync (ETag: %s)',
    async (etags) => {
      await setUp({ etags });
      const n1 = await a.addNoteAsync({ title: 'n1', content: 'v1' });
      const n2 = await a.addNoteAsync({ title: 'n2', content: 'v1' });
      await a.syncWithWebDAVAsync(conf());
      await b.syncWithWebDAVAsync(conf());

      await a.updateNoteAsync(n1.id, { content: 'A edit' });
      await b.updateNoteAsync(n2.id, { content: 'B edit' });
      // B syncs right after A has downloaded, so A's upload would clobber it
      server.afterNextGet(async () => {
        expect(await b.syncWithWebDAVAsync(conf())).toBe(true);
      });
      expect(await a.syncWithWebDAVAsync(conf())).toBe(true);
      await b.syncWithWebDAVAsync(conf());

      const expected = { n1: 'A edit', n2: 'B edit' };
      expect(await contents(a)).toEqual(expected);
      expect(await contents(b)).toEqual(expected);
    },
  );

  it('skips the upload when nothing changed', async () => {
    await setUp();
    await a.addNoteAsync({ title: 'n' });
    await a.syncWithWebDAVAsync(conf());
    const puts = server.putCount;
    await a.syncWithWebDAVAsync(conf());
    await a.syncWithWebDAVAsync(conf());
    expect(server.putCount).toBe(puts);
  });

  it('pull merges remote changes without uploading', async () => {
    await setUp();
    await a.addNoteAsync({ title: 'from A' });
    await a.syncWithWebDAVAsync(conf());
    await b.addNoteAsync({ title: 'only on B' });
    const puts = server.putCount;

    expect(await b.pullFromWebDAVAsync(conf())).toBe(true);
    expect(Object.keys(await contents(b)).sort()).toEqual(['from A', 'only on B']);
    expect(server.putCount).toBe(puts);
  });
});

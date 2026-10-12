// What a sync does with a downloaded notes file it can't trust.
import { describe, it, expect } from 'vitest';
import { decryptText, encryptText } from '../lib/storage/crypto';
import { runSync, type SyncHost } from '../lib/storage/syncRunner';
import type { SyncTransport } from '../lib/storage/remoteSync';
import type { SyncBase } from '../lib/storage/syncEngine';
import type { NoteConflict, NoteItem } from '../lib/storage/types';
import { WriteLock } from '../lib/storage/writeLock';

function note(id: string, title = id): NoteItem {
  return {
    id,
    title,
    content: '',
    category: '',
    tags: [],
    color: '',
    createdAt: 1,
    updatedAt: 1,
  };
}

function fakeHost(initial: NoteItem[]) {
  let notes = initial;
  let base: SyncBase | null = null;
  const host: SyncHost = {
    lock: new WriteLock(),
    loadNotes: async () => notes,
    mutateNotesUnlocked: async (mutate) => {
      const next = mutate(notes);
      if (next) notes = next;
      return next;
    },
    readConflicts: async () => [] as NoteConflict[],
    writeConflicts: async () => {},
    readSyncBase: async (_provider, remoteId) => (base?.remoteId === remoteId ? base : null),
    writeSyncBase: async (_provider, next) => {
      base = next;
    },
  };
  return { host, notes: () => notes, base: () => base };
}

function fakeRemote(body: string) {
  const puts: string[] = [];
  const transport: SyncTransport = {
    remoteId: 'test:notes.json',
    get: async () => ({ body, etag: null }),
    put: async (payload) => {
      puts.push(payload);
      return 'ok';
    },
  };
  return { transport, puts };
}

/** A remote whose file a test can replace between syncs. */
function mutableRemote(initial: string | null) {
  let body = initial;
  const transport: SyncTransport = {
    remoteId: 'test:notes.json',
    get: async () => (body === null ? null : { body, etag: null }),
    put: async (payload) => {
      body = payload;
      return 'ok';
    },
  };
  return {
    transport,
    body: () => body,
    replace: (next: string) => {
      body = next;
    },
  };
}

const sync = (host: SyncHost, transport: SyncTransport) =>
  runSync(host, 'webdav', transport, { strategy: 'prefer-local', upload: true });

describe('runSync with a malformed remote file', () => {
  it.each([
    ['a note without an id', [note('a'), { title: 'no id' }]],
    ['a note whose content is not text', [{ ...note('a'), content: 42 }]],
    ['two notes with the same id', [note('a'), note('a', 'twin')]],
    ['tags that are not a list of strings', [{ ...note('a'), tags: 'x,y' }]],
  ])('aborts without touching either side: %s', async (_label, remote) => {
    const { host, notes } = fakeHost([note('local')]);
    const { transport, puts } = fakeRemote(JSON.stringify(remote));

    expect(await sync(host, transport)).toBe(false);
    expect(notes().map((n) => n.id)).toEqual(['local']);
    expect(puts).toEqual([]);
  });

  it('fills in fields older clients left out and keeps unknown ones', async () => {
    const { host, notes } = fakeHost([]);
    const { transport } = fakeRemote(JSON.stringify([{ id: 'old', title: 'T', future: 1 }]));

    expect(await sync(host, transport)).toBe(true);
    expect(notes()).toEqual([
      expect.objectContaining({ id: 'old', title: 'T', content: '', tags: [], future: 1 }),
    ]);
  });

  it('drops only the malformed color ranges of a note', async () => {
    const { host, notes } = fakeHost([]);
    const remote = {
      ...note('a'),
      coloredRanges: [
        { startIndex: 0, endIndex: 2, color: '#f00' },
        { startIndex: 'x', endIndex: 2, color: '#f00' },
        { startIndex: 5, endIndex: 1, color: '#f00' },
      ],
    };
    const { transport } = fakeRemote(JSON.stringify([remote]));

    expect(await sync(host, transport)).toBe(true);
    expect(notes()[0].coloredRanges).toEqual([{ startIndex: 0, endIndex: 2, color: '#f00' }]);
  });

  it('drops only the malformed versions of a note', async () => {
    const { host, notes } = fakeHost([]);
    const good = { versionId: 'v1', title: 'T', content: 'old', updatedAt: 1 };
    const remote = {
      ...note('a'),
      versions: [null, good, { ...good, versionId: 'v2', content: 42 }, { versionId: 'v3' }],
    };
    const { transport } = fakeRemote(JSON.stringify([remote]));

    expect(await sync(host, transport)).toBe(true);
    expect(notes()[0].versions).toEqual([
      { ...good, category: '', tags: [], color: '', coloredRanges: undefined },
    ]);
  });
});

describe('runSync with a sync key', () => {
  const KEY = 'correct horse battery staple';

  const keyedSync = (host: SyncHost, transport: SyncTransport) =>
    runSync(host, 'webdav', transport, { key: KEY, strategy: 'prefer-local', upload: true });

  it('encrypts a plaintext remote even when the merge changes nothing', async () => {
    const { host, base } = fakeHost([note('a')]);
    const remote = mutableRemote(JSON.stringify([note('a')]));

    expect(await keyedSync(host, remote.transport)).toBe(true);
    const uploaded = JSON.parse(await decryptText(remote.body()!, KEY)) as NoteItem[];
    expect(uploaded.map((n) => n.id)).toEqual(['a']);
    expect(base()?.encrypted).toBe(true);
  });

  it('refuses a plaintext remote once it has been encrypted', async () => {
    const { host, notes } = fakeHost([note('a')]);
    const remote = mutableRemote(await encryptText(JSON.stringify([note('a')]), KEY));
    expect(await keyedSync(host, remote.transport)).toBe(true);

    const injected = JSON.stringify([note('a'), note('evil')]);
    remote.replace(injected);

    expect(await keyedSync(host, remote.transport)).toBe(false);
    expect(notes().map((n) => n.id)).toEqual(['a']);
    expect(remote.body()).toBe(injected);
  });

  it('still accepts plaintext without a key, after the key is removed', async () => {
    const { host, notes } = fakeHost([note('a')]);
    const remote = mutableRemote(await encryptText(JSON.stringify([note('a')]), KEY));
    expect(await keyedSync(host, remote.transport)).toBe(true);

    remote.replace(JSON.stringify([note('a'), note('b')]));

    expect(await sync(host, remote.transport)).toBe(true);
    expect(
      notes()
        .map((n) => n.id)
        .sort(),
    ).toEqual(['a', 'b']);
  });
});

describe('runSync after the remote goes back to an earlier file', () => {
  const add = (host: SyncHost, n: NoteItem) => host.mutateNotesUnlocked((notes) => [...notes, n]);
  const edit = (host: SyncHost, id: string, content: string) =>
    host.mutateNotesUnlocked((notes) =>
      notes.map((n) => (n.id === id ? { ...n, content, updatedAt: n.updatedAt + 1 } : n)),
    );
  const remoteIds = (body: string | null) =>
    (JSON.parse(body!) as NoteItem[]).map((n) => n.id).sort();

  it('keeps the notes made since, instead of deleting them', async () => {
    const { host, notes } = fakeHost([note('a')]);
    const remote = mutableRemote(null);
    expect(await sync(host, remote.transport)).toBe(true);
    const old = remote.body()!;

    await add(host, note('b'));
    expect(await sync(host, remote.transport)).toBe(true);
    expect(remoteIds(remote.body())).toEqual(['a', 'b']);

    remote.replace(old); // e.g. an older file version restored on the server
    expect(await sync(host, remote.transport)).toBe(true);
    expect(
      notes()
        .map((n) => n.id)
        .sort(),
    ).toEqual(['a', 'b']);
    expect(remoteIds(remote.body())).toEqual(['a', 'b']);
  });

  it('keeps the newer local content when the older remote wins', async () => {
    const { host, notes } = fakeHost([note('a')]);
    const remote = mutableRemote(null);
    expect(await sync(host, remote.transport)).toBe(true);
    const old = remote.body()!;

    await edit(host, 'a', 'newer');
    expect(await sync(host, remote.transport)).toBe(true);

    remote.replace(old);
    expect(
      await runSync(host, 'webdav', remote.transport, { strategy: 'prefer-remote', upload: true }),
    ).toBe(true);
    const a = notes().find((n) => n.id === 'a')!;
    expect(a.content).toBe('');
    expect(a.versions?.map((v) => v.content)).toContain('newer');
  });

  it('still deletes a note deleted on another device', async () => {
    const { host, notes } = fakeHost([note('a'), note('b')]);
    const remote = mutableRemote(null);
    expect(await sync(host, remote.transport)).toBe(true);

    remote.replace(JSON.stringify([note('a')]));
    expect(await sync(host, remote.transport)).toBe(true);
    expect(notes().map((n) => n.id)).toEqual(['a']);
  });
});

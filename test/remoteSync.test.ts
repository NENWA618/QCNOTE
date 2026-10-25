// Sync transports must never read the remote from the browser's HTTP cache.
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  oneDriveTransport,
  SYNC_REQUEST_TIMEOUT_MS,
  webdavTransport,
} from '../lib/storage/remoteSync';
import type { OneDriveConfig, WebDAVConfig } from '../lib/storage/types';

const webdav = {
  url: 'https://dav.example.com',
  remotePath: 'qcnote/notes.json',
  username: 'u',
  password: 'p',
} as WebDAVConfig;

const onedrive = { accessToken: 't', folderPath: 'qcnote/notes.json' } as OneDriveConfig;

function stubFetch(respond: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return respond(url, init);
    }),
  );
  return calls;
}

describe('sync transports bypass the HTTP cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('WebDAV: GET, HEAD and PUT', async () => {
    const calls = stubFetch(() => new Response('[]', { status: 200, headers: { ETag: 'W/"1"' } }));
    const transport = webdavTransport(webdav);
    const snapshot = await transport.get();
    // weak ETag: the upload is checked with a HEAD first
    expect(await transport.put('[]', snapshot)).toBe('ok');

    expect(calls.map((c) => c.init.method)).toEqual(['GET', 'HEAD', 'PUT']);
    expect(calls.every((c) => c.init.cache === 'no-store')).toBe(true);
  });

  it('OneDrive: metadata, download and upload', async () => {
    const calls = stubFetch((url) =>
      url.includes('$select=eTag')
        ? new Response(JSON.stringify({ eTag: '"e1"' }), { status: 200 })
        : new Response('[]', { status: 200 }),
    );
    const transport = oneDriveTransport(onedrive);
    const snapshot = await transport.get();
    expect(await transport.put('[]', snapshot)).toBe('ok');

    expect(calls.length).toBe(4);
    expect(calls.every((c) => c.init.cache === 'no-store')).toBe(true);
  });
});

describe('OneDrive upload of a new file', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const created = (status: number) =>
    stubFetch((url) =>
      url.includes('$select=eTag')
        ? new Response(null, { status: 404 })
        : new Response('{}', { status }),
    );

  it('asks Graph to fail rather than replace a file created meanwhile', async () => {
    const calls = created(201);
    expect(await oneDriveTransport(onedrive).put('[]', null)).toBe('ok');

    const put = calls.find((c) => c.init.method === 'PUT')!;
    expect(put.url).toMatch(/:\/content\?@microsoft\.graph\.conflictBehavior=fail$/);
  });

  it('reports a 409 as a conflict, so the sync downloads and merges again', async () => {
    created(409);
    expect(await oneDriveTransport(onedrive).put('[]', null)).toBe('conflict');
  });

  it('does not add the query when replacing a known file', async () => {
    const calls = stubFetch((url) =>
      url.includes('$select=eTag')
        ? new Response(JSON.stringify({ eTag: '"e1"' }), { status: 200 })
        : new Response('{}', { status: 200 }),
    );
    await oneDriveTransport(onedrive).put('[]', { body: '[]', etag: '"e1"' });

    const put = calls.find((c) => c.init.method === 'PUT')!;
    expect(put.url).toMatch(/:\/content$/);
    expect((put.init.headers as Record<string, string>)['If-Match']).toBe('"e1"');
  });
});

describe('sync transports give up on a server that never answers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('every request carries a timeout signal', async () => {
    const webdavCalls = stubFetch(
      () => new Response('[]', { status: 200, headers: { ETag: 'W/"1"' } }),
    );
    const dav = webdavTransport(webdav);
    await dav.put('[]', await dav.get());
    expect(webdavCalls.every((c) => c.init.signal instanceof AbortSignal)).toBe(true);

    const oneDriveCalls = stubFetch((url) =>
      url.includes('$select=eTag')
        ? new Response(JSON.stringify({ eTag: '"e1"' }), { status: 200 })
        : new Response('[]', { status: 200 }),
    );
    const od = oneDriveTransport(onedrive);
    await od.put('[]', await od.get());
    expect(oneDriveCalls.every((c) => c.init.signal instanceof AbortSignal)).toBe(true);
  });

  it('a hung download fails once the timeout fires', async () => {
    // AbortSignal.timeout runs on a native timer, out of reach of fake timers
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit = {}) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
          }),
      ),
    );
    const download = webdavTransport(webdav).get();
    expect(timeout).toHaveBeenCalledWith(SYNC_REQUEST_TIMEOUT_MS);
    controller.abort(new DOMException('timed out', 'TimeoutError'));
    await expect(download).rejects.toThrow('timed out');
    timeout.mockRestore();
  });
});

// Transports for WebDAV / OneDrive sync. Everything here is stateless;
// NoteStorage owns reading/writing the local notes and syncEngine.ts owns
// the merge.
import { arrayBufferToBase64 } from './crypto';
import type { OneDriveConfig, WebDAVConfig } from './types';

export function normalizeWebDAVUrl(config: WebDAVConfig): string {
  const base = config.url.trim().replace(/\/+$/, '');
  const path = config.remotePath.trim().replace(/^\/+/, '');
  return `${base}/${path}`;
}

export async function webdavFetch(
  method: string,
  url: string,
  config: WebDAVConfig,
  body?: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    ...extraHeaders,
  };
  if (config.username && config.password) {
    // UTF-8 (RFC 7617): btoa() alone throws on any non-Latin-1 character
    const credentials = new TextEncoder().encode(`${config.username}:${config.password}`);
    headers.Authorization = `Basic ${arrayBufferToBase64(credentials.buffer as ArrayBuffer)}`;
  }
  return fetch(url, { method, headers, body });
}

export function normalizeOneDrivePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

function oneDriveItemUrl(config: OneDriveConfig): string {
  const path = normalizeOneDrivePath(config.folderPath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://graph.microsoft.com/v1.0/me/drive/root:/${path}`;
}

export async function oneDriveFetch(
  method: string,
  config: OneDriveConfig,
  body?: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.accessToken}`,
    'Content-Type': 'application/octet-stream',
    ...extraHeaders,
  };
  return fetch(`${oneDriveItemUrl(config)}:/content`, { method, headers, body });
}

/** The file's current eTag, or null if it doesn't exist; throws on any other failure. */
async function oneDriveETag(config: OneDriveConfig): Promise<string | null> {
  const response = await fetch(`${oneDriveItemUrl(config)}?$select=eTag`, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`OneDrive metadata GET failed (${response.status})`);
  const { eTag } = (await response.json()) as { eTag?: unknown };
  if (typeof eTag !== 'string' || !eTag) throw new Error('OneDrive item has no eTag');
  return eTag;
}

/** A downloaded remote file; `etag` is null when the server doesn't expose one. */
export interface RemoteSnapshot {
  body: string;
  etag: string | null;
}

export interface SyncTransport {
  /** Identifies the remote file, so a sync base is never reused for another one. */
  readonly remoteId: string;
  /** null if the file doesn't exist yet; throws on any other failure. */
  get(): Promise<RemoteSnapshot | null>;
  /**
   * Uploads `body` only if the remote still is `expected` (null: still
   * absent). Returns 'conflict' if someone else changed it in the meantime;
   * throws on any other failure.
   */
  put(body: string, expected: RemoteSnapshot | null): Promise<'ok' | 'conflict'>;
}

/**
 * Fallback when the server gives no ETag: download again right before the
 * upload and compare. Not atomic, but shrinks the race window to one
 * round trip instead of the whole sync.
 */
async function stillMatches(
  get: () => Promise<RemoteSnapshot | null>,
  expected: RemoteSnapshot | null,
): Promise<boolean> {
  const current = await get();
  return expected === null ? current === null : current?.body === expected.body;
}

/** Weak comparison (RFC 7232 §2.3.2): equal opaque-tags, ignoring any W/ prefix. */
function sameETag(a: string, b: string): boolean {
  return a.replace(/^W\//, '') === b.replace(/^W\//, '');
}

export function webdavTransport(config: WebDAVConfig): SyncTransport {
  const url = normalizeWebDAVUrl(config);
  const get = async (): Promise<RemoteSnapshot | null> => {
    const response = await webdavFetch('GET', url, config);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`WebDAV GET failed (${response.status})`);
    return { body: await response.text(), etag: response.headers?.get?.('ETag') ?? null };
  };
  /**
   * Whether the file still is `expected`, for when If-Match can't say so.
   * With a (weak) ETag a HEAD answers it without the body: a weak ETag
   * still changes with the content. Only a server that gives no ETag, or
   * none on HEAD, costs a second full download.
   */
  const unchangedSince = async (expected: RemoteSnapshot): Promise<boolean> => {
    if (expected.etag) {
      const response = await webdavFetch('HEAD', url, config);
      if (response.status === 404) return false;
      const etag = response.ok ? response.headers?.get?.('ETag') : null;
      if (etag) return sameETag(etag, expected.etag);
    }
    return stillMatches(get, expected);
  };
  return {
    remoteId: `webdav:${url}`,
    get,
    async put(body, expected) {
      // Conditional request (RFC 7232): the server rejects the upload with
      // 412 if the file changed since we downloaded it.
      const headers: Record<string, string> = {};
      if (expected === null) {
        headers['If-None-Match'] = '*';
      } else if (expected.etag && !expected.etag.startsWith('W/')) {
        // If-Match compares strongly (RFC 7232 §3.1): a weak ETag never
        // matches, so every upload would fail as a conflict. Fall back below.
        headers['If-Match'] = expected.etag;
      } else if (!(await unchangedSince(expected))) {
        return 'conflict';
      }
      const response = await webdavFetch('PUT', url, config, body, headers);
      if (response.status === 412) return 'conflict';
      if (!response.ok) throw new Error(`WebDAV PUT failed (${response.status})`);
      return 'ok';
    },
  };
}

export function oneDriveTransport(config: OneDriveConfig): SyncTransport {
  const get = async (): Promise<RemoteSnapshot | null> => {
    // /content redirects to a download URL whose ETag isn't the item's, so
    // read the item's eTag first. Taken before the download, it can only be
    // older than the body: a change in between fails the upload as a
    // conflict (and retries), it never lets a stale upload through.
    const etag = await oneDriveETag(config);
    if (etag === null) return null;
    const response = await oneDriveFetch('GET', config);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`OneDrive GET failed (${response.status})`);
    return { body: await response.text(), etag };
  };
  return {
    remoteId: `onedrive:${normalizeOneDrivePath(config.folderPath)}`,
    get,
    async put(body, expected) {
      // Graph documents If-Match for upload sessions but not for this simple
      // upload, so also compare the eTag first: if the header is ignored, the
      // race window is one metadata round trip, as with stillMatches.
      if ((await oneDriveETag(config)) !== (expected?.etag ?? null)) return 'conflict';
      const headers: Record<string, string> = expected?.etag ? { 'If-Match': expected.etag } : {};
      const response = await oneDriveFetch('PUT', config, body, headers);
      if (response.status === 412) return 'conflict';
      if (!response.ok) throw new Error(`OneDrive PUT failed (${response.status})`);
      return 'ok';
    },
  };
}

// Transports for WebDAV / OneDrive sync. Everything here is stateless;
// NoteStorage owns reading/writing the local notes and syncEngine.ts owns
// the merge.
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
    headers.Authorization = `Basic ${btoa(`${config.username}:${config.password}`)}`;
  }
  return fetch(url, { method, headers, body });
}

export function normalizeOneDrivePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

export async function oneDriveFetch(
  method: string,
  config: OneDriveConfig,
  body?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.accessToken}`,
    'Content-Type': 'application/octet-stream',
  };
  const path = normalizeOneDrivePath(config.folderPath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`, {
    method,
    headers,
    body,
  });
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

export function webdavTransport(config: WebDAVConfig): SyncTransport {
  const url = normalizeWebDAVUrl(config);
  const get = async (): Promise<RemoteSnapshot | null> => {
    const response = await webdavFetch('GET', url, config);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`WebDAV GET failed (${response.status})`);
    return { body: await response.text(), etag: response.headers?.get?.('ETag') ?? null };
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
      } else if (expected.etag) {
        headers['If-Match'] = expected.etag;
      } else if (!(await stillMatches(get, expected))) {
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
    const response = await oneDriveFetch('GET', config);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`OneDrive GET failed (${response.status})`);
    // /content redirects to a download URL whose ETag isn't the item's, so
    // rely on the re-download check instead.
    return { body: await response.text(), etag: null };
  };
  return {
    remoteId: `onedrive:${normalizeOneDrivePath(config.folderPath)}`,
    get,
    async put(body, expected) {
      if (!(await stillMatches(get, expected))) return 'conflict';
      const response = await oneDriveFetch('PUT', config, body);
      if (response.status === 412) return 'conflict';
      if (!response.ok) throw new Error(`OneDrive PUT failed (${response.status})`);
      return 'ok';
    },
  };
}

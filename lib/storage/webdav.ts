/**
 * WebDAV Sync Module
 * Handles synchronization with WebDAV servers with parallel batch operations
 */
import logger from '../logger';
import { retryAsync, safeAsync, AppError } from '../errorHandler';
import { mergeNoteLists, resolveConflict } from './conflict';
import type { NoteItem, WebDAVConfig, NoteConflict } from './types';
import { encryptText, decryptText } from './encryption';

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_REQUEST_TIMEOUT = 30000;

/**
 * Validate WebDAV configuration
 */
export function validateWebDAVConfig(config: WebDAVConfig): boolean {
  if (!config.url || !config.remotePath) {
    logger.error('[WebDAV] Invalid config: missing url or remotePath');
    return false;
  }

  try {
    new URL(config.url);
    return true;
  } catch {
    logger.error('[WebDAV] Invalid URL format');
    return false;
  }
}

/**
 * Normalize WebDAV URL
 */
export function normalizeWebDAVUrl(config: WebDAVConfig): string {
  const base = config.url.trim().replace(/\/+$/, '');
  const path = config.remotePath.trim().replace(/^\/+/, '');
  return `${base}/${path}`;
}

/**
 * Create WebDAV request with authentication
 */
export async function createWebDAVRequest(
  method: string,
  url: string,
  config: WebDAVConfig,
  body?: string,
  timeout: number = DEFAULT_REQUEST_TIMEOUT,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
  };

  if (config.username && config.password) {
    const auth = btoa(`${config.username}:${config.password}`);
    headers['Authorization'] = `Basic ${auth}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Push notes to WebDAV in batches
 */
export async function pushNotesToWebDAV(
  notes: NoteItem[],
  config: WebDAVConfig,
  encrypt: boolean = true,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<{ success: boolean; failedNotes: string[] }> {
  if (!validateWebDAVConfig(config)) {
    return { success: false, failedNotes: [] };
  }

  logger.info(`[WebDAV] Pushing ${notes.length} notes in batches of ${batchSize}`);

  const failedNotes: string[] = [];
  const url = normalizeWebDAVUrl(config);

  // Prepare payload
  let payload = JSON.stringify(notes);
  if (encrypt && config.encryptionKey) {
    payload = await safeAsync(
      () => encryptText(payload, config.encryptionKey!),
      payload,
      '[WebDAV] Encryption failed, using plaintext',
    );
  }

  // Push to WebDAV
  try {
    const response = await retryAsync(
      () => createWebDAVRequest('PUT', url, config, payload),
      3,
      1000,
    );

    if (!response.ok) {
      throw new AppError(
        'WEBDAV_PUSH_FAILED',
        response.status,
        `WebDAV push failed: ${response.statusText}`,
      );
    }

    logger.info('[WebDAV] Notes pushed successfully');
    return { success: true, failedNotes: [] };
  } catch (error) {
    logger.error('[WebDAV] Push failed', { error });
    return { success: false, failedNotes: notes.map((n) => n.id) };
  }
}

/**
 * Pull notes from WebDAV
 */
export async function pullNotesFromWebDAV(
  config: WebDAVConfig,
  decrypt: boolean = true,
): Promise<{ notes: NoteItem[]; success: boolean }> {
  if (!validateWebDAVConfig(config)) {
    return { notes: [], success: false };
  }

  logger.info('[WebDAV] Pulling notes');

  const url = normalizeWebDAVUrl(config);

  try {
    const response = await retryAsync(() => createWebDAVRequest('GET', url, config), 3, 1000);

    if (!response.ok) {
      throw new AppError(
        'WEBDAV_PULL_FAILED',
        response.status,
        `WebDAV pull failed: ${response.statusText}`,
      );
    }

    let content = await response.text();

    if (decrypt && config.encryptionKey) {
      content = await safeAsync(
        () => decryptText(content, config.encryptionKey!),
        content,
        '[WebDAV] Decryption failed, using as-is',
      );
    }

    const notes = JSON.parse(content) as NoteItem[];
    if (!Array.isArray(notes)) {
      throw new Error('Invalid data format from WebDAV');
    }

    logger.info(`[WebDAV] Pulled ${notes.length} notes successfully`);
    return { notes, success: true };
  } catch (error) {
    logger.error('[WebDAV] Pull failed', { error });
    return { notes: [], success: false };
  }
}

/**
 * Sync with WebDAV (pull + merge + push)
 */
export async function syncWithWebDAV(
  localNotes: NoteItem[],
  config: WebDAVConfig,
  direction: 'push' | 'pull' | 'both' = 'both',
): Promise<{
  mergedNotes: NoteItem[];
  conflicts: Array<{ local: NoteItem; remote: NoteItem }>;
  success: boolean;
}> {
  logger.info(`[WebDAV] Syncing (direction: ${direction})`);

  let mergedNotes = localNotes;
  const conflicts: Array<{ local: NoteItem; remote: NoteItem }> = [];

  try {
    if (direction === 'pull' || direction === 'both') {
      const { notes: remoteNotes, success } = await pullNotesFromWebDAV(
        config,
        !!config.encryptionKey,
      );

      if (!success) {
        throw new AppError('SYNC_FAILED', 500, 'Failed to pull from WebDAV');
      }

      const strategy = (config.conflictStrategy as any) || 'manual';
      const { merged, conflicts: detected } = mergeNoteLists(localNotes, remoteNotes, strategy);

      mergedNotes = merged;
      conflicts.push(...detected);
    }

    if (direction === 'push' || direction === 'both') {
      const { success } = await pushNotesToWebDAV(mergedNotes, config, !!config.encryptionKey);

      if (!success) {
        throw new AppError('SYNC_FAILED', 500, 'Failed to push to WebDAV');
      }
    }

    logger.info(
      `[WebDAV] Sync completed: ${mergedNotes.length} notes, ${conflicts.length} conflicts`,
    );
    return { mergedNotes, conflicts, success: true };
  } catch (error) {
    logger.error('[WebDAV] Sync failed', { error });
    return { mergedNotes: localNotes, conflicts: [], success: false };
  }
}

const webdavExports = {
  validateWebDAVConfig,
  normalizeWebDAVUrl,
  createWebDAVRequest,
  pushNotesToWebDAV,
  pullNotesFromWebDAV,
  syncWithWebDAV,
};

export default webdavExports;

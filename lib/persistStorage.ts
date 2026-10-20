import logger from './logger';

let requested = false;

/**
 * Ask the browser to treat this origin's storage (IndexedDB / localStorage)
 * as persistent, so it isn't evicted under storage pressure.
 *
 * Best-effort and non-throwing: resolves to true only if storage is persistent
 * afterwards. Browsers decide on their own (Chrome grants silently based on
 * engagement; Firefox may show a permission prompt), so a `false` is normal.
 * Only asks once per page load.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const storage = navigator.storage;
  if (!storage || typeof storage.persist !== 'function') return false;

  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    if (requested) return false;
    requested = true;
    const granted = await storage.persist();
    logger.info(granted ? 'Persistent storage granted' : 'Persistent storage not granted');
    return granted;
  } catch (err) {
    logger.warn('Persistent storage request failed:', err);
    return false;
  }
}

/** Test helper: reset the once-per-session guard. */
export function _resetPersistRequestForTests() {
  requested = false;
}

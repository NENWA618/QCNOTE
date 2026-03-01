// Vitest setup file: provide helpers and polyfills for Node environment
import 'fake-indexeddb/auto';

// stub a simple in-memory localStorage (not full spec but enough for tests)
// if a partial/local version already exists but is missing methods, replace it
if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof (globalThis.localStorage as any).clear !== 'function' ||
  typeof (globalThis.localStorage as any).getItem !== 'function'
) {
  let _store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem(key: string) {
      return _store.hasOwnProperty(key) ? _store[key] : null;
    },
    setItem(key: string, value: string) {
      _store[key] = String(value);
    },
    removeItem(key: string) {
      delete _store[key];
    },
    clear() {
      _store = {};
    },
  } as any;
}

// provide global.fetch if not present (tests may stub it directly anyway)
if (typeof globalThis.fetch === 'undefined') {
  // simple no-op fetch returning ok: true
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) }) as any;
}


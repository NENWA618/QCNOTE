/* Lightweight IndexedDB helper - small wrapper for key/value storage */
const DB_NAME = 'QCNOTE_DB_V1';
const STORE_NAME = 'keyval';

// One shared connection: opening a new one per call (and never closing it)
// piles up connections, and any of them blocks a later version change.
let connection: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (connection) return connection;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    // support both browser (window) and Node.js (globalThis) environments
    const env: any = typeof window !== 'undefined' ? window : globalThis;
    if (!env.indexedDB) return reject('IndexedDB not supported');
    const req = env.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => {
      const db: IDBDatabase = req.result;
      const forget = () => {
        if (connection === opening) connection = null;
      };
      // let another tab upgrade or delete the database; reopen on next use
      db.onversionchange = () => {
        db.close();
        forget();
      };
      db.onclose = forget;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  connection = opening;
  opening.catch(() => {
    if (connection === opening) connection = null;
  });
  return opening;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  cb: (_store: IDBObjectStore) => Promise<T> | T,
) {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const _store = tx.objectStore(STORE_NAME);
    let result: T;
    // Resolve only once the transaction has committed. An abort (e.g. quota
    // exceeded) fires no error event, so without onabort the caller would
    // wait forever.
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    Promise.resolve(cb(_store))
      .then((v) => {
        result = v;
      })
      .catch(reject);
  });
}

export async function getItem<T = unknown>(key: string): Promise<T | undefined> {
  return withStore(
    'readonly',
    (store) =>
      new Promise<T | undefined>((res, rej) => {
        const req = store.get(key);
        req.onsuccess = () => res(req.result as T);
        req.onerror = () => rej(req.error);
      }),
  );
}

export async function setItem<T = unknown>(key: string, value: T): Promise<boolean> {
  return withStore(
    'readwrite',
    (store) =>
      new Promise<boolean>((res, rej) => {
        const req = store.put(value, key);
        req.onsuccess = () => res(true);
        req.onerror = () => rej(req.error);
      }),
  );
}

export async function deleteItem(key: string) {
  return withStore(
    'readwrite',
    (store) =>
      new Promise((res, rej) => {
        const req = store.delete(key);
        req.onsuccess = () => res(true);
        req.onerror = () => rej(req.error);
      }),
  );
}

export async function getAllKeys() {
  return withStore(
    'readonly',
    (store) =>
      new Promise<string[]>((res, rej) => {
        const req = store.getAllKeys();
        req.onsuccess = () => res(req.result as string[]);
        req.onerror = () => rej(req.error);
      }),
  );
}

export async function clearStore() {
  return withStore(
    'readwrite',
    (store) =>
      new Promise((res, rej) => {
        const req = store.clear();
        req.onsuccess = () => res(true);
        req.onerror = () => rej(req.error);
      }),
  );
}

const idb = { openDB, getItem, setItem, deleteItem, getAllKeys, clearStore };

export default idb;

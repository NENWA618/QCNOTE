/* eslint-disable no-undef */
/* Lightweight IndexedDB helper - small wrapper for key/value storage */
const DB_NAME = 'NOTE_DB_V1';
const STORE_NAME = 'keyval';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) return reject('IndexedDB not supported');
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, cb: (_store: IDBObjectStore) => Promise<T> | T) {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const _store = tx.objectStore(STORE_NAME);
    Promise.resolve(cb(_store))
      .then((v) => {
        tx.oncomplete = () => resolve(v);
        tx.onerror = () => reject(tx.error);
      })
      .catch(reject);
  });
}

export async function getItem(key: string) {
  return withStore('readonly', (store) =>
    new Promise((res, rej) => {
      const req = store.get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    }),
  );
}

export async function setItem(key: string, value: any) {
  return withStore('readwrite', (store) =>
    new Promise((res, rej) => {
      const req = store.put(value, key);
      req.onsuccess = () => res(true);
      req.onerror = () => rej(req.error);
    }),
  );
}

export async function deleteItem(key: string) {
  return withStore('readwrite', (store) =>
    new Promise((res, rej) => {
      const req = store.delete(key);
      req.onsuccess = () => res(true);
      req.onerror = () => rej(req.error);
    }),
  );
}

export async function getAllKeys() {
  return withStore('readonly', (store) =>
    new Promise<string[]>((res, rej) => {
      const req = store.getAllKeys();
      req.onsuccess = () => res(req.result as string[]);
      req.onerror = () => rej(req.error);
    }),
  );
}

export async function clearStore() {
  return withStore('readwrite', (store) =>
    new Promise((res, rej) => {
      const req = store.clear();
      req.onsuccess = () => res(true);
      req.onerror = () => rej(req.error);
    }),
  );
}

const idb = { openDB, getItem, setItem, deleteItem, getAllKeys, clearStore };

export default idb;

/**
 * QCNOTE runtime worker
 * Handles IndexedDB operations and AES-GCM encryption inside a Worker sandbox.
 */

import type { QCStoreSchema, QCQueryOpts, QCWhere } from './qcnote-runtime';

const ALGO = 'AES-GCM';
const KEY_LEN = 256;
const IV_LEN = 12;
const TAG_LEN = 128;
const META_DB_SUFFIX = '__qcnote_meta__';
const META_STORE_NAME = 'meta';

function parseTTL(ttl: string): number {
  const n = parseInt(ttl, 10);
  const unit = ttl.slice(String(n).length);
  const units: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  return n * (units[unit] ?? 864e5);
}

function base64Encode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes: Uint8Array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isEncryptedFieldValue(encoded: string): boolean {
  return /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(encoded);
}

export async function deriveKey(
  secret: string,
  salt?: Uint8Array,
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const enc = new TextEncoder();
  salt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const raw = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'PBKDF2' }, false, [
    'deriveKey',
  ]);
  const saltBuffer = salt.buffer.slice(
    salt.byteOffset,
    salt.byteOffset + salt.byteLength,
  ) as ArrayBuffer;
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuffer, iterations: 100_000, hash: 'SHA-256' },
    raw,
    { name: ALGO, length: KEY_LEN },
    false,
    ['encrypt', 'decrypt'],
  );
  return { key, salt };
}

async function encryptField(value: unknown, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: ALGO, iv, tagLength: TAG_LEN }, key, plain);
  return base64Encode(iv) + '.' + base64Encode(cipher);
}

async function decryptField(encoded: string, key: CryptoKey): Promise<unknown> {
  const [ivB64, cipherB64] = encoded.split('.');
  const iv = base64Decode(ivB64);
  const cipher = base64Decode(cipherB64);
  const plain = await crypto.subtle.decrypt(
    { name: ALGO, iv: iv as any, tagLength: TAG_LEN } as AesGcmParams,
    key,
    cipher.buffer as ArrayBuffer,
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function evalWhere(record: Record<string, unknown>, where: QCWhere): boolean {
  if ('and' in where) return where.and.every((w) => evalWhere(record, w));
  if ('or' in where) return where.or.some((w) => evalWhere(record, w));
  if ('not' in where) return !evalWhere(record, where.not);

  const { field, op, value } = where as any;
  const rv = record[field];

  switch (op) {
    case '=':
      return rv === value;
    case '!=':
      return rv !== value;
    case '<':
      return (rv as number) < (value as number);
    case '<=':
      return (rv as number) <= (value as number);
    case '>':
      return (rv as number) > (value as number);
    case '>=':
      return (rv as number) >= (value as number);
    case '~=':
      return typeof rv === 'string' && rv.includes(value as string);
    case 'in':
      return Array.isArray(value) && value.includes(rv as string | number);
    case 'between': {
      const [lo, hi] = value as [number, number];
      return (rv as number) >= lo && (rv as number) <= hi;
    }
    default:
      return false;
  }
}

class QCDb {
  private db: IDBDatabase;
  private schemas: Map<string, QCStoreSchema>;
  private cryptoKey?: CryptoKey;
  private secretFields: Map<string, Set<string>> = new Map();

  constructor(db: IDBDatabase, schemas: QCStoreSchema[], cryptoKey?: CryptoKey) {
    this.db = db;
    this.cryptoKey = cryptoKey;
    this.schemas = new Map(schemas.map((s) => [s.name, s]));

    for (const schema of schemas) {
      const secrets = new Set(schema.fields.filter((f) => f.secret).map((f) => f.name));
      this.secretFields.set(schema.name, secrets);
    }
  }

  private async encryptRecord(
    store: string,
    record: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.cryptoKey) return record;
    const secrets = this.secretFields.get(store) ?? new Set();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      out[k] = secrets.has(k) && typeof v === 'string' ? await encryptField(v, this.cryptoKey) : v;
    }
    return out;
  }

  private async decryptRecord(
    store: string,
    record: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.cryptoKey) return record;
    const secrets = this.secretFields.get(store) ?? new Set();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      if (secrets.has(k) && typeof v === 'string') {
        if (!isEncryptedFieldValue(v)) {
          out[k] = v;
          continue;
        }

        try {
          out[k] = await decryptField(v, this.cryptoKey);
        } catch {
          out[k] = v;
        }
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  private addTTL(store: string, record: Record<string, unknown>): Record<string, unknown> {
    const schema = this.schemas.get(store);
    if (!schema?.ttl) return record;
    return { ...record, _expires: Date.now() + parseTTL(schema.ttl) };
  }

  private isExpired(record: Record<string, unknown>): boolean {
    if (!('_expires' in record)) return false;
    return typeof record._expires === 'number' && Date.now() > record._expires;
  }

  private tx(store: string, mode: IDBTransactionMode): [IDBTransaction, IDBObjectStore] {
    const t = this.db.transaction(store, mode);
    return [t, t.objectStore(store)];
  }

  private wrap<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  async put<T extends object>(store: string, record: T): Promise<IDBValidKey> {
    const enc = await this.encryptRecord(store, record as Record<string, unknown>);
    const withTTL = this.addTTL(store, enc);
    const [, os] = this.tx(store, 'readwrite');
    return this.wrap(os.put(withTTL));
  }

  async getById<T = unknown>(store: string, key: IDBValidKey): Promise<T | null> {
    const [, os] = this.tx(store, 'readonly');
    const raw = await this.wrap(os.get(key));
    if (!raw) return null;
    const rec = raw as Record<string, unknown>;
    if (this.isExpired(rec)) {
      await this.deleteById(store, key);
      return null;
    }
    return this.decryptRecord(store, rec) as Promise<T>;
  }

  async get<T = unknown>(store: string, opts: QCQueryOpts = {}): Promise<T | null> {
    const results = await this.find<T>(store, { ...opts, limit: 1 });
    return results[0] ?? null;
  }

  async find<T = unknown>(store: string, opts: QCQueryOpts = {}): Promise<T[]> {
    const [, os] = this.tx(store, 'readonly');
    const results: Record<string, unknown>[] = [];

    await new Promise<void>((res, rej) => {
      const req = os.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          res();
          return;
        }
        const rec = cursor.value as Record<string, unknown>;
        if (!this.isExpired(rec)) {
          if (!opts.where || evalWhere(rec, opts.where)) {
            results.push(rec);
          }
        }
        cursor.continue();
      };
      req.onerror = () => rej(req.error);
    });

    if (opts.sort) {
      const { field, dir } = opts.sort;
      results.sort((a, b) => {
        const av = a[field] as number | string;
        const bv = b[field] as number | string;
        return dir === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
      });
    }

    const limited = opts.limit !== undefined ? results.slice(0, opts.limit) : results;
    return Promise.all(limited.map((r) => this.decryptRecord(store, r))) as Promise<T[]>;
  }

  async count(store: string, opts: QCQueryOpts = {}): Promise<number> {
    if (!opts.where) {
      const [, os] = this.tx(store, 'readonly');
      return this.wrap(os.count());
    }
    const results = await this.find(store, { where: opts.where });
    return results.length;
  }

  async deleteById(store: string, key: IDBValidKey): Promise<void> {
    const [, os] = this.tx(store, 'readwrite');
    await this.wrap(os.delete(key));
  }

  async delete(store: string, opts: QCQueryOpts = {}): Promise<number> {
    const schema = this.schemas.get(store);
    const keyField = schema?.keyField ?? 'id';
    const found = await this.find(store, { where: opts.where });
    for (const rec of found) {
      const key = (rec as Record<string, unknown>)[keyField] as IDBValidKey;
      await this.deleteById(store, key);
    }
    return found.length;
  }

  async clear(store: string): Promise<void> {
    const [, os] = this.tx(store, 'readwrite');
    await this.wrap(os.clear());
  }

  async purgeExpired(): Promise<number> {
    let purged = 0;
    for (const [storeName, schema] of this.schemas) {
      if (!schema.ttl) continue;
      const [, os] = this.tx(storeName, 'readwrite');
      const expired: IDBValidKey[] = [];
      await new Promise<void>((res, rej) => {
        const req = os.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            res();
            return;
          }
          const rec = cursor.value as Record<string, unknown>;
          if (this.isExpired(rec)) expired.push(cursor.primaryKey);
          cursor.continue();
        };
        req.onerror = () => rej(req.error);
      });
      for (const k of expired) await this.deleteById(storeName, k);
      purged += expired.length;
    }
    return purged;
  }

  close(): void {
    this.db.close();
  }
}

async function openDatabase(
  name: string,
  version: number,
  schemas: QCStoreSchema[],
): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (event) => {
      const idb = (event.target as IDBOpenDBRequest).result;
      for (const schema of schemas) {
        let os: IDBObjectStore;
        if (!idb.objectStoreNames.contains(schema.name)) {
          os = idb.createObjectStore(schema.name, {
            keyPath: schema.keyField,
            autoIncrement: schema.keyAuto,
          });
        } else {
          os = (event.target as IDBOpenDBRequest).transaction!.objectStore(schema.name);
        }

        for (const field of schema.fields) {
          if (field.indexed && !os.indexNames.contains(field.name)) {
            os.createIndex(field.name, field.name, { unique: false });
          }
        }

        if (schema.ttl && !os.indexNames.contains('_expires')) {
          os.createIndex('_expires', '_expires', { unique: false });
        }
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error(`[QCNOTE] Database "${name}" blocked — close other tabs`));
  });
}

async function openMetaStore(name: string): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(`${name}${META_DB_SUFFIX}`, 1);
    req.onupgradeneeded = (event) => {
      const idb = (event.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains(META_STORE_NAME)) {
        idb.createObjectStore(META_STORE_NAME);
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function readMeta<T>(name: string, key: string): Promise<T | null> {
  const db = await openMetaStore(name);
  return new Promise((res, rej) => {
    const tx = db.transaction(META_STORE_NAME, 'readonly');
    const os = tx.objectStore(META_STORE_NAME);
    const req = os.get(key);
    req.onsuccess = () => {
      const value = req.result as T | undefined;
      db.close();
      res(value === undefined ? null : value);
    };
    req.onerror = () => {
      db.close();
      rej(req.error);
    };
  });
}

async function writeMeta(name: string, key: string, value: unknown): Promise<void> {
  const db = await openMetaStore(name);
  return new Promise((res, rej) => {
    const tx = db.transaction(META_STORE_NAME, 'readwrite');
    const os = tx.objectStore(META_STORE_NAME);
    const req = os.put(value, key);
    req.onsuccess = () => {
      db.close();
      res();
    };
    req.onerror = () => {
      db.close();
      rej(req.error);
    };
  });
}

async function loadPersistentCryptoKey(name: string): Promise<CryptoKey | undefined> {
  const key = await readMeta<CryptoKey>(name, 'cryptoKey');
  return key ?? undefined;
}

async function savePersistentCryptoKey(name: string, key: CryptoKey): Promise<void> {
  await writeMeta(name, 'cryptoKey', key);
}

async function getSalt(
  name: string,
  legacySaltB64?: string,
): Promise<{ salt: Uint8Array; migrated: boolean }> {
  let saltB64 = await readMeta<string>(name, 'salt');
  let migrated = false;
  if (!saltB64 && legacySaltB64) {
    saltB64 = legacySaltB64;
    migrated = true;
  }
  if (saltB64) {
    return { salt: base64Decode(saltB64), migrated };
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await writeMeta(name, 'salt', base64Encode(salt));
  return { salt, migrated: false };
}

export class QCRuntime {
  static async open(
    name: string,
    schemas: QCStoreSchema[],
    version = 1,
    secret?: string,
    legacySaltB64?: string,
    sessionToken?: string,
  ): Promise<QCDb> {
    let cryptoKey: CryptoKey | undefined;

    // Always initialize metadata for this runtime, including salt migration.
    // This keeps worker meta consistent even if no secret is provided yet.
    const { salt, migrated } = await getSalt(name, legacySaltB64);
    if (migrated) {
      await writeMeta(name, 'salt', base64Encode(salt));
    }

    const isGuestDb = name.endsWith('_GUEST');
    const hasPersistedKey = !isGuestDb && (await loadPersistentCryptoKey(name)) !== undefined;
    if (!isGuestDb && !sessionToken && (secret || hasPersistedKey)) {
      throw new Error('Device session token required to open encrypted database');
    }

    // If a secret is provided, derive a compatible AES-GCM key and
    // persist it as a worker-managed key for future auto-unlock.
    if (secret) {
      const derived = await deriveKey(secret, salt);
      cryptoKey = derived.key;
      if (!(await loadPersistentCryptoKey(name))) {
        await savePersistentCryptoKey(name, cryptoKey);
      }
    }

    const db = await openDatabase(name, version, schemas);

    // If no secret is passed, try loading a previously stored worker key.
    if (!cryptoKey) {
      cryptoKey = await loadPersistentCryptoKey(name);
      if (!cryptoKey && !isGuestDb) {
        cryptoKey = await crypto.subtle.generateKey({ name: ALGO, length: KEY_LEN }, false, [
          'encrypt',
          'decrypt',
        ]);
        await savePersistentCryptoKey(name, cryptoKey);
      }
    }

    return new QCDb(db, schemas, cryptoKey);
  }

  static async drop(name: string): Promise<void> {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
    const metaDbName = `${name}${META_DB_SUFFIX}`;
    await new Promise<void>((res, rej) => {
      const req = indexedDB.deleteDatabase(metaDbName);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  }
}

const dbInstances = new Map<number, QCDb>();
let nextDbId = 1;

interface WorkerRequest {
  id: number;
  action: 'open' | 'drop' | 'dbMethod' | 'status' | 'migrateLegacySalts';
  args: unknown[];
}

interface WorkerResponse {
  id: number;
  success: boolean;
  result?: unknown;
  error?: string;
}

async function handleOpen(args: unknown[]): Promise<{ dbId: number; migratedSalt: boolean }> {
  const [name, schemas, version, secret, legacySaltB64, sessionToken] = args as [
    string,
    QCStoreSchema[],
    number,
    string | undefined,
    string | undefined,
    string | undefined,
  ];
  const db = await QCRuntime.open(name, schemas, version, secret, legacySaltB64, sessionToken);
  const dbId = nextDbId++;
  dbInstances.set(dbId, db);
  const migratedSalt = Boolean(legacySaltB64);
  return { dbId, migratedSalt };
}

async function handleDbMethod(args: unknown[]): Promise<unknown> {
  const [dbId, method, methodArgs] = args as [number, string, unknown[]];
  const db = dbInstances.get(dbId);
  if (!db) throw new Error(`QCDb instance ${dbId} not found`);
  const result = await (db as any)[method](...methodArgs);
  if (method === 'close') {
    dbInstances.delete(dbId);
  }
  return result;
}

async function handleStatus(args: unknown[]): Promise<{
  hasCryptoKey: boolean;
  hasSalt: boolean;
  isGuestDb: boolean;
}> {
  const [name] = args as [string];
  const cryptoKey = await loadPersistentCryptoKey(name);
  const salt = await readMeta<string>(name, 'salt');
  return {
    hasCryptoKey: Boolean(cryptoKey),
    hasSalt: typeof salt === 'string' && salt.length > 0,
    isGuestDb: name.endsWith('_GUEST'),
  };
}

async function migrateLegacySalts(args: unknown[]): Promise<void> {
  const [entries] = args as [Array<[string, string]>];
  for (const [name, saltB64] of entries) {
    const existing = await readMeta<string>(name, 'salt');
    if (!existing) {
      await writeMeta(name, 'salt', saltB64);
    }
  }
}

async function handleDrop(args: unknown[]): Promise<unknown> {
  const [name] = args as [string];
  await QCRuntime.drop(name);
  return null;
}

export async function handleWorkerRequest(event: WorkerRequest): Promise<WorkerResponse> {
  const { id, action, args } = event;
  const response: WorkerResponse = { id, success: false };
  try {
    if (action === 'open') {
      response.result = await handleOpen(args);
    } else if (action === 'drop') {
      response.result = await handleDrop(args);
    } else if (action === 'dbMethod') {
      response.result = await handleDbMethod(args);
    } else if (action === 'status') {
      response.result = await handleStatus(args);
    } else if (action === 'migrateLegacySalts') {
      response.result = await migrateLegacySalts(args);
    } else {
      throw new Error(`Unknown worker action: ${action}`);
    }
    response.success = true;
  } catch (error) {
    response.error = error instanceof Error ? error.message : String(error);
  }
  return response;
}

const isWorkerThread =
  typeof self !== 'undefined' &&
  typeof (self as any).document === 'undefined' &&
  typeof (self as any).postMessage === 'function';

if (isWorkerThread) {
  self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const response = await handleWorkerRequest(event.data);
    self.postMessage(response);
  };
}

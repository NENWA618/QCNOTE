/**
 * QCNOTE runtime worker
 * Handles IndexedDB operations and AES-GCM encryption inside a Worker sandbox.
 */

import type { QCStoreSchema, QCQueryOpts, QCWhere } from './qcnote-runtime';

const ALGO = 'AES-GCM';
const KEY_LEN = 256;
const IV_LEN = 12;
/** Set on records whose secret fields can't be decrypted. Must match qcnote-runtime.ts. */
export const UNDECRYPTABLE_MARKER = '_undecryptable';
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
  // ArrayBuffer.isView() (unlike `instanceof ArrayBuffer`/`instanceof
  // Uint8Array`) correctly identifies typed arrays/buffers that originate
  // from a different realm than this module's own globals — e.g. an
  // ArrayBuffer returned by crypto.subtle in a Node-hosted test environment
  // vs. this file's jsdom-realm `ArrayBuffer` global. `instanceof` here would
  // silently misclassify it and encode zero bytes.
  const bytes = ArrayBuffer.isView(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Must match qcnote-runtime.ts. Exactly what encryptField() produces: base64(12-byte IV) "." base64(ciphertext
// + 16-byte GCM tag, at least 18 bytes since the plaintext is JSON). Kept
// strict so ordinary text such as "readme.md" is never mistaken for ciphertext.
const ENCRYPTED_FIELD_RE =
  /^[A-Za-z0-9+/]{16}\.(?:[A-Za-z0-9+/]{4}){6,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function isEncryptedFieldValue(encoded: string): boolean {
  return ENCRYPTED_FIELD_RE.test(encoded);
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
    { name: ALGO, iv, tagLength: TAG_LEN },
    key,
    cipher.buffer as ArrayBuffer,
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function evalWhere(record: Record<string, unknown>, where: QCWhere): boolean {
  if ('and' in where) return where.and.every((w) => evalWhere(record, w));
  if ('or' in where) return where.or.some((w) => evalWhere(record, w));
  if ('not' in where) return !evalWhere(record, where.not);

  const { field, op, value } = where;
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
      // Any JSON value (arrays, objects, numbers), not just strings.
      out[k] = secrets.has(k) && v !== undefined ? await encryptField(v, this.cryptoKey) : v;
    }
    return out;
  }

  /**
   * A secret field that is ciphertext but doesn't decrypt with this DB's key
   * (corruption, or a record encrypted under an older key) makes the whole
   * record come back as `{ ...non-secret fields, [UNDECRYPTABLE_MARKER]: true }`
   * with every secret field left out. Returning the ciphertext as if it were
   * the value would let it be shown, synced, and re-encrypted on the next
   * save — burying the original under a second layer of encryption.
   */
  private async decryptRecord(
    store: string,
    record: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.cryptoKey) return record;
    const secrets = this.secretFields.get(store) ?? new Set();
    const out: Record<string, unknown> = {};
    let undecryptable = false;
    for (const [k, v] of Object.entries(record)) {
      if (secrets.has(k) && typeof v === 'string' && isEncryptedFieldValue(v)) {
        try {
          out[k] = await decryptField(v, this.cryptoKey);
        } catch {
          undecryptable = true;
        }
      } else {
        out[k] = v;
      }
    }
    if (!undecryptable) return out;
    for (const k of secrets) delete out[k];
    out[UNDECRYPTABLE_MARKER] = true;
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

  /**
   * Applies all puts and deletes in ONE readwrite transaction, so either every
   * change lands or none does. Encryption happens before the transaction is
   * opened: an IDB transaction auto-commits while a SubtleCrypto call is
   * pending (see encryptPlaintextSecretFields).
   */
  async bulkWrite<T extends object>(
    store: string,
    puts: T[],
    deleteKeys: IDBValidKey[] = [],
  ): Promise<void> {
    const records = await Promise.all(
      puts.map(async (r) =>
        this.addTTL(store, await this.encryptRecord(store, r as Record<string, unknown>)),
      ),
    );
    const [t, os] = this.tx(store, 'readwrite');
    await new Promise<void>((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error ?? new Error('Transaction aborted'));
      for (const key of deleteKeys) os.delete(key);
      for (const rec of records) os.put(rec);
    });
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

  /**
   * Encrypts an arbitrary JSON value with this database's key, for data the
   * app keeps outside the notes store (conflicts, sync state, credentials,
   * caches) that must be no less protected than the notes themselves.
   */
  async seal(value: unknown): Promise<string> {
    if (!this.cryptoKey) throw new Error('QCDb.seal: this database has no encryption key');
    return encryptField(value, this.cryptoKey);
  }

  async unseal(sealed: string): Promise<unknown> {
    if (!this.cryptoKey) throw new Error('QCDb.unseal: this database has no encryption key');
    return decryptField(sealed, this.cryptoKey);
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

// Writes `value` only if `key` is absent, atomically (IDB add() rejects an
// existing key inside the transaction). Returns false if it was already there.
async function addMetaIfAbsent(name: string, key: string, value: unknown): Promise<boolean> {
  const db = await openMetaStore(name);
  return new Promise((res, rej) => {
    const tx = db.transaction(META_STORE_NAME, 'readwrite');
    const req = tx.objectStore(META_STORE_NAME).add(value, key);
    req.onsuccess = () => {
      db.close();
      res(true);
    };
    req.onerror = (event) => {
      db.close();
      if (req.error?.name === 'ConstraintError') {
        event.preventDefault(); // expected outcome, not a failure
        res(false);
      } else {
        rej(req.error);
      }
    };
  });
}

// --- Vault key scheme (server-issued KEK wraps a browser-local DEK) --------

async function importKek(kekBytes: Uint8Array): Promise<CryptoKey> {
  const bytes = kekBytes.buffer.slice(
    kekBytes.byteOffset,
    kekBytes.byteOffset + kekBytes.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.importKey('raw', bytes, { name: ALGO }, false, ['wrapKey', 'unwrapKey']);
}

// Returns the DEK used to encrypt/decrypt note fields for this database.
// If a wrapped DEK already exists in meta, it is unwrapped and reused —
// never regenerated — so previously written records stay decryptable.
async function getOrCreateWrappedDek(name: string, kek: CryptoKey): Promise<CryptoKey> {
  const unwrap = (stored: string): Promise<CryptoKey> => {
    const [ivB64, wrappedB64] = stored.split('.');
    const iv = base64Decode(ivB64);
    const wrapped = base64Decode(wrappedB64);
    return crypto.subtle.unwrapKey(
      'raw',
      wrapped.buffer as ArrayBuffer,
      kek,
      { name: ALGO, iv, tagLength: TAG_LEN },
      { name: ALGO, length: KEY_LEN },
      false,
      ['encrypt', 'decrypt'],
    );
  };

  const existing = await readMeta<string>(name, 'wrappedDEK');
  if (existing) return unwrap(existing);

  const dek = await crypto.subtle.generateKey({ name: ALGO, length: KEY_LEN }, true, [
    'encrypt',
    'decrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, {
    name: ALGO,
    iv,
    tagLength: TAG_LEN,
  } as AesGcmParams);
  // Another open (a second tab, or a concurrent open in this one) may have
  // created a DEK since our read. Overwriting it would leave whatever that
  // open already encrypted undecryptable, so only store ours if none exists
  // and otherwise converge on the stored one.
  const stored = base64Encode(iv) + '.' + base64Encode(wrapped);
  if (await addMetaIfAbsent(name, 'wrappedDEK', stored)) {
    // `dek` had to be extractable to be wrapped; hand out the same key
    // unwrapped as non-extractable, like every later open gets.
    return unwrap(stored);
  }
  const winner = await readMeta<string>(name, 'wrappedDEK');
  if (!winner) throw new Error('[QCNOTE] wrappedDEK vanished while opening the database');
  return unwrap(winner);
}

/**
 * Encrypts secret fields that are still stored in plaintext: records written
 * before a field was marked secret (e.g. note versions, tags, links), or JSON
 * values that older versions never encrypted. Runs once per change to the set
 * of secret fields, recorded in meta, so ordinary opens don't rescan the DB.
 * Runs in three phases: read everything, encrypt with no transaction open,
 * then write back in one transaction. Awaiting SubtleCrypto inside an open
 * IDB transaction would let Chrome auto-commit it (TransactionInactiveError).
 */
async function encryptPlaintextSecretFields(
  name: string,
  db: IDBDatabase,
  schemas: QCStoreSchema[],
  key: CryptoKey,
): Promise<void> {
  const signature = JSON.stringify(
    schemas.map((schema) => [
      schema.name,
      schema.fields
        .filter((f) => f.secret)
        .map((f) => f.name)
        .sort(),
    ]),
  );
  if ((await readMeta<string>(name, 'secretFields')) === signature) return;

  for (const schema of schemas) {
    const secrets = schema.fields.filter((f) => f.secret).map((f) => f.name);
    if (secrets.length === 0) continue;

    const records: Record<string, unknown>[] = await new Promise((res, rej) => {
      const req = db.transaction(schema.name, 'readonly').objectStore(schema.name).getAll();
      req.onsuccess = () => res(req.result as Record<string, unknown>[]);
      req.onerror = () => rej(req.error);
    });

    const updated: Record<string, unknown>[] = [];
    for (const record of records) {
      let changed = false;
      const next = { ...record };
      for (const field of secrets) {
        const value = record[field];
        if (value === undefined) continue;
        if (typeof value === 'string' && isEncryptedFieldValue(value)) continue;
        next[field] = await encryptField(value, key);
        changed = true;
      }
      if (changed) updated.push(next);
    }

    if (updated.length > 0) {
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(schema.name, 'readwrite');
        const os = tx.objectStore(schema.name);
        for (const record of updated) os.put(record);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error ?? new Error('Transaction aborted'));
      });
    }
  }

  await writeMeta(name, 'secretFields', signature);
}

export class QCRuntime {
  static async open(
    name: string,
    schemas: QCStoreSchema[],
    version = 1,
    sessionToken?: string,
    kekBytes?: Uint8Array,
  ): Promise<QCDb> {
    const isGuestDb = name.endsWith('_GUEST');

    // Check the arguments BEFORE touching openDatabase(): a throw after it
    // would leak an unclosed connection that blocks all future
    // open()/deleteDatabase() calls for this db name (IndexedDB's
    // deleteDatabase() hangs on 'blocked' until every connection is closed).
    if (!isGuestDb) {
      if (!sessionToken) {
        throw new Error('Device session token required to open encrypted database');
      }
      if (!kekBytes) {
        throw new Error('QCRuntime.open: a vault key is required to open this database');
      }
    }

    const db = await openDatabase(name, version, schemas);

    if (isGuestDb || !kekBytes) {
      // Guest data is treated as plaintext/unknown by design — no key needed.
      return new QCDb(db, schemas, undefined);
    }

    // A server-issued KEK unwraps (or creates) this database's local DEK.
    // Obtaining kekBytes at all already implies the caller passed real
    // server-side authentication (see lib/storage/deviceSession.ts's
    // fetchVaultKey).
    const kek = await importKek(kekBytes);
    const dek = await getOrCreateWrappedDek(name, kek);
    await encryptPlaintextSecretFields(name, db, schemas, dek);
    return new QCDb(db, schemas, dek);
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
  action: 'open' | 'drop' | 'dbMethod' | 'status';
  args: unknown[];
}

interface WorkerResponse {
  id: number;
  success: boolean;
  result?: unknown;
  error?: string;
}

async function handleOpen(args: unknown[]): Promise<{ dbId: number }> {
  const [name, schemas, version, sessionToken, kekBytes] = args as [
    string,
    QCStoreSchema[],
    number,
    string | undefined,
    Uint8Array | undefined,
  ];
  const db = await QCRuntime.open(name, schemas, version, sessionToken, kekBytes);
  const dbId = nextDbId++;
  dbInstances.set(dbId, db);
  return { dbId };
}

async function handleDbMethod(args: unknown[]): Promise<unknown> {
  const [dbId, method, methodArgs] = args as [number, string, unknown[]];
  const db = dbInstances.get(dbId);
  if (!db) throw new Error(`QCDb instance ${dbId} not found`);
  const fn = (db as unknown as Record<string, unknown>)[method];
  if (typeof fn !== 'function') throw new Error(`QCDb has no method ${method}`);
  const result = await fn.apply(db, methodArgs);
  if (method === 'close') {
    dbInstances.delete(dbId);
  }
  return result;
}

async function handleStatus(args: unknown[]): Promise<{
  hasCryptoKey: boolean;
  isGuestDb: boolean;
}> {
  const [name] = args as [string];
  const wrappedDek = await readMeta<string>(name, 'wrappedDEK');
  return {
    hasCryptoKey: Boolean(wrappedDek),
    isGuestDb: name.endsWith('_GUEST'),
  };
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
  typeof (self as { document?: unknown }).document === 'undefined' &&
  typeof (self as { postMessage?: unknown }).postMessage === 'function';

if (isWorkerThread) {
  self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const response = await handleWorkerRequest(event.data);
    self.postMessage(response);
  };
}

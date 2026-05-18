/**
 * QCNOTE.js — Runtime Engine
 * Handles IndexedDB operations with AES-256-GCM field-level encryption
 *
 * Design goals:
 *  - Zero dependencies (Web Crypto API only)
 *  - Field-level encryption (only @secret fields are encrypted)
 *  - Automatic TTL expiry
 *  - Structured clone safe (no class instances in IDB)
 *  - Tiny footprint (~5KB minified)
 */

// ─── Schema Types ─────────────────────────────────────────────────────────────

export interface QCFieldSchema {
  name: string;
  type: 'str' | 'num' | 'bool' | 'json' | 'bin' | 'date';
  indexed: boolean;
  secret: boolean;
}

export interface QCStoreSchema {
  name: string;
  keyField: string;
  keyAuto: boolean;
  fields: QCFieldSchema[];
  ttl?: string; // e.g. "7d", "1h", "30m"
}

// ─── WHERE clause types ───────────────────────────────────────────────────────

export type QCWhereValue = string | number | boolean | null | (string | number)[];

export interface QCCondition {
  field: string;
  op: '=' | '!=' | '<' | '<=' | '>' | '>=' | '~=' | 'between' | 'in';
  value: QCWhereValue | [QCWhereValue, QCWhereValue];
}

export interface QCAndExpr {
  and: QCWhere[];
}
export interface QCOrExpr {
  or: QCWhere[];
}
export interface QCNotExpr {
  not: QCWhere;
}

export type QCWhere = QCCondition | QCAndExpr | QCOrExpr | QCNotExpr;

export interface QCQueryOpts {
  where?: QCWhere;
  limit?: number;
  sort?: { field: string; dir: 'asc' | 'desc' };
}

// ─── TTL utilities ────────────────────────────────────────────────────────────

function parseTTL(ttl: string): number {
  const n = parseInt(ttl, 10);
  const unit = ttl.slice(String(n).length);
  const units: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  return n * (units[unit] ?? 864e5);
}

// ─── AES-256-GCM Crypto ───────────────────────────────────────────────────────

const ALGO = 'AES-GCM';
const KEY_LEN = 256;
const IV_LEN = 12;
const TAG_LEN = 128;

export async function deriveKey(
  secret: string,
  salt?: Uint8Array,
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
  const enc = new TextEncoder();
  salt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const rawKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const saltSource =
    salt.buffer instanceof ArrayBuffer
      ? salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength)
      : new Uint8Array(salt).buffer;
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltSource, iterations: 100_000, hash: 'SHA-256' },
    rawKey,
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
  // pack: base64(iv) + "." + base64(ciphertext)
  const b64 = (buf: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)));
  return b64(iv) + '.' + b64(cipher);
}

async function decryptField(encoded: string, key: CryptoKey): Promise<unknown> {
  const [ivB64, cipherB64] = encoded.split('.');
  const fromB64 = (s: string) =>
    new Uint8Array(
      atob(s)
        .split('')
        .map((c) => c.charCodeAt(0)),
    );
  const iv = fromB64(ivB64);
  const cipher = fromB64(cipherB64);
  const plain = await crypto.subtle.decrypt({ name: ALGO, iv, tagLength: TAG_LEN }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

// ─── WHERE Evaluator ──────────────────────────────────────────────────────────

function evalWhere(record: Record<string, unknown>, where: QCWhere): boolean {
  if ('and' in where) return where.and.every((w) => evalWhere(record, w));
  if ('or' in where) return where.or.some((w) => evalWhere(record, w));
  if ('not' in where) return !evalWhere(record, where.not);

  const { field, op, value } = where as QCCondition;
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

// ─── QCNOTE Database Handle ───────────────────────────────────────────────────

export class QCDb {
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

  // ── Encrypt/Decrypt record ────────────────────────────────────────────────

  private async encryptRecord(
    store: string,
    record: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.cryptoKey) return record;
    const secrets = this.secretFields.get(store) ?? new Set();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      out[k] = secrets.has(k) ? await encryptField(v, this.cryptoKey) : v;
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
      out[k] = secrets.has(k) && typeof v === 'string' ? await decryptField(v, this.cryptoKey) : v;
    }
    return out;
  }

  // ── TTL helpers ───────────────────────────────────────────────────────────

  private addTTL(store: string, record: Record<string, unknown>): Record<string, unknown> {
    const schema = this.schemas.get(store);
    if (!schema?.ttl) return record;
    return { ...record, _expires: Date.now() + parseTTL(schema.ttl) };
  }

  private isExpired(record: Record<string, unknown>): boolean {
    if (!('_expires' in record)) return false;
    return typeof record._expires === 'number' && Date.now() > record._expires;
  }

  // ── IDB Helpers ───────────────────────────────────────────────────────────

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

  private txCommit(tx: IDBTransaction): Promise<void> {
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(new Error('Transaction aborted'));
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Insert or update a record */
  async put<T extends object>(store: string, record: T): Promise<IDBValidKey> {
    const enc = await this.encryptRecord(store, record as Record<string, unknown>);
    const withTTL = this.addTTL(store, enc);
    const [, os] = this.tx(store, 'readwrite');
    return this.wrap(os.put(withTTL));
  }

  /** Get by primary key */
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

  /** Get first record matching query */
  async get<T = unknown>(store: string, opts: QCQueryOpts = {}): Promise<T | null> {
    const results = await this.find<T>(store, { ...opts, limit: 1 });
    return results[0] ?? null;
  }

  /** Find all records matching query */
  async find<T = unknown>(store: string, opts: QCQueryOpts = {}): Promise<T[]> {
    const schema = this.schemas.get(store);
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

    // Sort
    if (opts.sort) {
      const { field, dir } = opts.sort;
      results.sort((a, b) => {
        const av = a[field] as number | string;
        const bv = b[field] as number | string;
        return dir === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
      });
    }

    // Limit
    const limited = opts.limit !== undefined ? results.slice(0, opts.limit) : results;

    // Decrypt
    return Promise.all(limited.map((r) => this.decryptRecord(store, r))) as Promise<T[]>;
  }

  /** Count records matching query */
  async count(store: string, opts: QCQueryOpts = {}): Promise<number> {
    if (!opts.where) {
      const [, os] = this.tx(store, 'readonly');
      return this.wrap(os.count());
    }
    const results = await this.find(store, { where: opts.where });
    return results.length;
  }

  /** Delete by primary key */
  async deleteById(store: string, key: IDBValidKey): Promise<void> {
    const [, os] = this.tx(store, 'readwrite');
    await this.wrap(os.delete(key));
  }

  /** Delete records matching query */
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

  /** Wipe an entire store */
  async clear(store: string): Promise<void> {
    const [, os] = this.tx(store, 'readwrite');
    await this.wrap(os.clear());
  }

  /** Purge expired records across all stores */
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

  /** Close the database connection */
  close(): void {
    this.db.close();
  }
}

// ─── QCRuntime ────────────────────────────────────────────────────────────────

export class QCRuntime {
  /**
   * Open (or create/upgrade) a QCNOTE database
   * @param name       IDB database name
   * @param schemas    Store schemas from compiled QCNOTE
   * @param version    IDB version (increment to trigger schema migration)
   * @param secret     Optional passphrase for AES-256 field encryption
   */
  static async open(
    name: string,
    schemas: QCStoreSchema[],
    version = 1,
    secret?: string,
  ): Promise<QCDb> {
    let cryptoKey: CryptoKey | undefined;
    if (secret) {
      // Derive or retrieve persistent salt from meta store / localStorage
      let saltB64 = localStorage.getItem(`qcnote:${name}:salt`);
      let salt: Uint8Array;
      if (saltB64) {
        salt = new Uint8Array(
          atob(saltB64)
            .split('')
            .map((c) => c.charCodeAt(0)),
        );
        const { key } = await deriveKey(secret, salt);
        cryptoKey = key;
      } else {
        const derived = await deriveKey(secret);
        salt = derived.salt;
        saltB64 = btoa(String.fromCharCode(...salt));
        localStorage.setItem(`qcnote:${name}:salt`, saltB64);
        cryptoKey = derived.key;
      }
    }

    const db = await new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open(name, version);

      req.onupgradeneeded = (e) => {
        const idb = (e.target as IDBOpenDBRequest).result;
        for (const schema of schemas) {
          // Create store if not exists
          let os: IDBObjectStore;
          if (!idb.objectStoreNames.contains(schema.name)) {
            os = idb.createObjectStore(schema.name, {
              keyPath: schema.keyField,
              autoIncrement: schema.keyAuto,
            });
          } else {
            os = (e.target as IDBOpenDBRequest).transaction!.objectStore(schema.name);
          }

          // Create indexes
          for (const field of schema.fields) {
            if (field.indexed && !os.indexNames.contains(field.name)) {
              os.createIndex(field.name, field.name, { unique: false });
            }
          }

          // TTL index for purge queries
          if (schema.ttl && !os.indexNames.contains('_expires')) {
            os.createIndex('_expires', '_expires', { unique: false });
          }
        }
      };

      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
      req.onblocked = () =>
        rej(new Error(`[QCNOTE] Database "${name}" blocked — close other tabs`));
    });

    return new QCDb(db, schemas, cryptoKey);
  }

  /** Delete an entire QCNOTE database */
  static async drop(name: string): Promise<void> {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
    localStorage.removeItem(`qcnote:${name}:salt`);
  }
}

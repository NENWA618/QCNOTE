/**
 * QCNOTE runtime wrapper - forwards operations into a dedicated Worker sandbox.
 */

// --- Schema Types -----------------------------------------------------------

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

// --- WHERE clause types -----------------------------------------------------

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

export function isEncryptedFieldValue(encoded: string): boolean {
  return /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(encoded);
}

export function getStoredSalt(dbName: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(`qcnote:${dbName}:salt`);
}

const LEGACY_LOCAL_STORAGE_PATTERNS = [
  /^QCNOTE_USER_SECRET_/,
  /^QCNOTE_DEVICE_NAME_USER_/,
  /^QCNOTE_DEVICE_ID_USER_/,
  /^QCNOTE_DEVICE_NAME(?:_|$)/,
  /^QCNOTE_DEVICE_ID(?:_|$)/,
];

function clearLegacyEncryptionStorage(dbName: string): void {
  if (typeof localStorage === 'undefined') return;

  const legacySaltKey = `qcnote:${dbName}:salt`;
  const legacyKeys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (LEGACY_LOCAL_STORAGE_PATTERNS.some((pattern) => pattern.test(key))) {
      legacyKeys.push(key);
    }
  }

  for (const key of [...legacyKeys, legacySaltKey]) {
    localStorage.removeItem(key);
  }
}

export interface QCEncryptionDiagnostics {
  dbName: string;
  isGuestDb: boolean;
  hasWorkerKey: boolean;
  hasMetaSalt: boolean;
  legacySaltInLocalStorage: boolean;
  suspiciousLocalStorageKeys: string[];
  encryptionChannel: 'encrypted' | 'plaintext' | 'unknown';
}

function getLegacySaltEntries(): Array<[string, string]> {
  if (typeof localStorage === 'undefined') return [];
  const entries: Array<[string, string]> = [];
  const saltKeyRegex = /^qcnote:(.+):salt$/;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const match = saltKeyRegex.exec(key);
    if (!match) continue;
    const dbName = match[1];
    const value = localStorage.getItem(key);
    if (value !== null) {
      entries.push([dbName, value]);
    }
  }

  return entries;
}

async function migrateAllLegacySalts(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const entries = getLegacySaltEntries();
  if (entries.length === 0) return;
  await workerRpc('migrateLegacySalts', [entries]);
  for (const [dbName] of entries) {
    localStorage.removeItem(`qcnote:${dbName}:salt`);
  }
}

function listSuspiciousLocalStorageKeys(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (/QCNOTE_USER_SECRET|secret|salt|key/i.test(key)) {
      keys.push(key);
    }
  }
  return keys;
}

export async function inspectEncryptionState(name: string): Promise<QCEncryptionDiagnostics> {
  const response = (await workerRpc('status', [name])) as {
    hasCryptoKey: boolean;
    hasSalt: boolean;
    isGuestDb: boolean;
  };

  const legacySaltInLocalStorage =
    typeof localStorage !== 'undefined' && localStorage.getItem(`qcnote:${name}:salt`) !== null;
  const suspiciousLocalStorageKeys = listSuspiciousLocalStorageKeys();
  const encryptionChannel = response.isGuestDb
    ? 'plaintext'
    : response.hasCryptoKey
      ? 'encrypted'
      : 'unknown';

  return {
    dbName: name,
    isGuestDb: response.isGuestDb,
    hasWorkerKey: response.hasCryptoKey,
    hasMetaSalt: response.hasSalt,
    legacySaltInLocalStorage,
    suspiciousLocalStorageKeys,
    encryptionChannel,
  };
}

// --- Worker RPC -------------------------------------------------------------

type WorkerImplementation = Worker | InProcessWorker;

interface InProcessWorker {
  postMessage(message: {
    id: number;
    action: 'open' | 'drop' | 'dbMethod' | 'status' | 'migrateLegacySalts';
    args: unknown[];
  }): void;
  onmessage?: (event: {
    data: { id: number; success: boolean; result?: unknown; error?: string };
  }) => void;
  terminate?(): void;
}

let worker: WorkerImplementation | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }
>();

async function getWorker(): Promise<WorkerImplementation> {
  if (worker) return worker;
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    const browserWorker = new Worker(new URL('./qcnote-runtime.worker.ts', import.meta.url), {
      type: 'module',
    });
    browserWorker.onmessage = (event: MessageEvent) => {
      const { id, success, result, error } = event.data as {
        id: number;
        success: boolean;
        result?: unknown;
        error?: string;
      };
      const handlers = pendingRequests.get(id);
      if (!handlers) return;
      pendingRequests.delete(id);
      if (success) {
        handlers.resolve(result);
      } else {
        handlers.reject(new Error(error || 'Worker request failed'));
      }
    };
    browserWorker.onerror = (event) => {
      const reason = event.message || 'Worker error';
      pendingRequests.forEach(({ reject }) => reject(new Error(reason)));
      pendingRequests.clear();
    };
    worker = browserWorker;
    return worker;
  }

  if (typeof window !== 'undefined') {
    const workerModule = await import('./qcnote-runtime.worker');
    const inProcess: InProcessWorker = {
      postMessage: async (message) => {
        try {
          const response = await workerModule.handleWorkerRequest(message);
          inProcess.onmessage?.({ data: response });
        } catch (error) {
          inProcess.onmessage?.({
            data: {
              id: message.id,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      },
      terminate: () => {},
    };

    inProcess.onmessage = (event) => {
      const { id, success, result, error } = event.data as {
        id: number;
        success: boolean;
        result?: unknown;
        error?: string;
      };
      const handlers = pendingRequests.get(id);
      if (!handlers) return;
      pendingRequests.delete(id);
      if (success) {
        handlers.resolve(result);
      } else {
        handlers.reject(new Error(error || 'Worker request failed'));
      }
    };

    worker = inProcess;
    return worker;
  }

  throw new Error('Web Worker is unavailable in this environment');
}

async function workerRpc(
  action: 'open' | 'drop' | 'dbMethod' | 'status' | 'migrateLegacySalts',
  args: unknown[],
): Promise<unknown> {
  const w = await getWorker();
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    w.postMessage({ id, action, args });
  });
}

export class QCDb {
  private dbId: number;

  constructor(dbId: number) {
    this.dbId = dbId;
  }

  private call<T>(method: string, args: unknown[]): Promise<T> {
    return workerRpc('dbMethod', [this.dbId, method, args]) as Promise<T>;
  }

  async put<T extends object>(store: string, record: T): Promise<IDBValidKey> {
    return this.call('put', [store, record]);
  }

  async getById<T = unknown>(store: string, key: IDBValidKey): Promise<T | null> {
    return this.call('getById', [store, key]);
  }

  async get<T = unknown>(store: string, opts: QCQueryOpts = {}): Promise<T | null> {
    return this.call('get', [store, opts]);
  }

  async find<T = unknown>(store: string, opts: QCQueryOpts = {}): Promise<T[]> {
    return this.call('find', [store, opts]);
  }

  async count(store: string, opts: QCQueryOpts = {}): Promise<number> {
    return this.call('count', [store, opts]);
  }

  async deleteById(store: string, key: IDBValidKey): Promise<void> {
    return this.call('deleteById', [store, key]);
  }

  async delete(store: string, opts: QCQueryOpts = {}): Promise<number> {
    return this.call('delete', [store, opts]);
  }

  async clear(store: string): Promise<void> {
    return this.call('clear', [store]);
  }

  async purgeExpired(): Promise<number> {
    return this.call('purgeExpired', []);
  }

  async close(): Promise<void> {
    return this.call('close', []);
  }
}

export class QCRuntime {
  static async open(
    name: string,
    schemas: QCStoreSchema[],
    version = 1,
    secret?: string,
  ): Promise<QCDb> {
    const legacySalt = getStoredSalt(name);
    await migrateAllLegacySalts();
    clearLegacyEncryptionStorage(name);
    const response = (await workerRpc('open', [name, schemas, version, secret, legacySalt])) as {
      dbId: number;
      migratedSalt: boolean;
    };
    if (legacySalt && response.migratedSalt && typeof localStorage !== 'undefined') {
      localStorage.removeItem(`qcnote:${name}:salt`);
    }
    return new QCDb(response.dbId);
  }

  static async drop(name: string): Promise<void> {
    await workerRpc('drop', [name]);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`qcnote:${name}:salt`);
    }
  }
}

declare global {
  interface Window {
    QCNOTE_RUNTIME_DEBUG?: {
      inspect: (name: string) => Promise<QCEncryptionDiagnostics>;
      listSuspiciousLocalStorageKeys: () => string[];
      getStoredSalt: typeof getStoredSalt;
      isEncryptedFieldValue: typeof isEncryptedFieldValue;
    };
  }
}

if (typeof window !== 'undefined') {
  window.QCNOTE_RUNTIME_DEBUG = window.QCNOTE_RUNTIME_DEBUG ?? {
    inspect: inspectEncryptionState,
    listSuspiciousLocalStorageKeys,
    getStoredSalt,
    isEncryptedFieldValue,
  };
}

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

/**
 * Set on records returned by find()/getById() whose secret fields can't be
 * decrypted (the secret fields are omitted). Must match the worker's copy.
 */
export const UNDECRYPTABLE_MARKER = '_undecryptable';

// Must match the worker's copy. Exactly what encryptField() produces: base64(12-byte IV) "." base64(ciphertext
// + 16-byte GCM tag, at least 18 bytes since the plaintext is JSON). Kept
// strict so ordinary text such as "readme.md" is never mistaken for ciphertext.
const ENCRYPTED_FIELD_RE =
  /^[A-Za-z0-9+/]{16}\.(?:[A-Za-z0-9+/]{4}){6,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function isEncryptedFieldValue(encoded: string): boolean {
  return ENCRYPTED_FIELD_RE.test(encoded);
}

export interface QCEncryptionDiagnostics {
  dbName: string;
  isGuestDb: boolean;
  hasWorkerKey: boolean;
  suspiciousLocalStorageKeys: string[];
  encryptionChannel: 'encrypted' | 'plaintext' | 'unknown';
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
    isGuestDb: boolean;
  };

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
    suspiciousLocalStorageKeys,
    encryptionChannel,
  };
}

// --- Worker RPC -------------------------------------------------------------

type WorkerImplementation = Worker | InProcessWorker;

interface InProcessWorker {
  postMessage(message: {
    id: number;
    action: 'open' | 'drop' | 'dbMethod' | 'status';
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
  action: 'open' | 'drop' | 'dbMethod' | 'status',
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

  /** Atomically puts `puts` and deletes `deleteKeys` in a single transaction. */
  async bulkWrite<T extends object>(
    store: string,
    puts: T[],
    deleteKeys: IDBValidKey[] = [],
  ): Promise<void> {
    return this.call('bulkWrite', [store, puts, deleteKeys]);
  }

  /** Encrypts any JSON value with this database's key (throws if it has none). */
  async seal(value: unknown): Promise<string> {
    return this.call('seal', [value]);
  }

  async unseal<T = unknown>(sealed: string): Promise<T> {
    return this.call('unseal', [sealed]);
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
    sessionToken?: string,
    kekBytes?: Uint8Array,
  ): Promise<QCDb> {
    const response = (await workerRpc('open', [
      name,
      schemas,
      version,
      sessionToken,
      kekBytes,
    ])) as { dbId: number };
    return new QCDb(response.dbId);
  }

  static async drop(name: string): Promise<void> {
    await workerRpc('drop', [name]);
  }
}

declare global {
  interface Window {
    QCNOTE_RUNTIME_DEBUG?: {
      inspect: (name: string) => Promise<QCEncryptionDiagnostics>;
      listSuspiciousLocalStorageKeys: () => string[];
      isEncryptedFieldValue: typeof isEncryptedFieldValue;
    };
  }
}

if (typeof window !== 'undefined') {
  window.QCNOTE_RUNTIME_DEBUG = window.QCNOTE_RUNTIME_DEBUG ?? {
    inspect: inspectEncryptionState,
    listSuspiciousLocalStorageKeys,
    isEncryptedFieldValue,
  };
}

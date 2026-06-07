import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { QCRuntime, QCDb } from '../qcruntime/qcnote-runtime';
import { NoteStorage } from '../lib/storage';

const SESSION_TOKEN_KEY = 'qcnote:deviceSessionToken';
const BROADCAST_KEY = 'qcnote:deviceSessionTokenBroadcast';
const REQUEST_KEY = 'qcnote:deviceSessionTokenRequest';
const RESPONSE_KEY = 'qcnote:deviceSessionTokenResponse';

const userId = 'user1';
const originalFetch = globalThis.fetch;

const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();

  if (url.includes('/api/device/session/validate')) {
    return {
      ok: true,
      json: async () => ({ success: true }),
    } as Response;
  }

  if (url.includes('/api/device/session/create')) {
    return {
      ok: true,
      json: async () => ({ success: true, token: 'token-created' }),
    } as Response;
  }

  return {
    ok: false,
    json: async () => ({ success: false }),
  } as Response;
});

const mockSession = {
  data: { user: { id: userId }, expires: '9999-01-01T00:00:00.000Z' },
  status: 'authenticated',
};

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => mockSession),
}));

vi.mock('../components/Layout', () => ({ default: () => <div data-testid="layout" /> }));
vi.mock('../components/Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock('../components/NoteList', () => ({ default: () => <div data-testid="note-list" /> }));
vi.mock('../components/NoteEditor', () => ({ default: () => <div data-testid="note-editor" /> }));
vi.mock('../components/ImportExport', () => ({
  default: () => <div data-testid="import-export" />,
}));
vi.mock('../components/Trash', () => ({ Trash: () => <div data-testid="trash" /> }));
vi.mock('../components/Calendar', () => ({ Calendar: () => <div data-testid="calendar" /> }));
vi.mock('../components/Timeline', () => ({ Timeline: () => <div data-testid="timeline" /> }));
vi.mock('../components/KnowledgeGraph', () => ({
  KnowledgeGraph: () => <div data-testid="graph" />,
}));
vi.mock('../components/WebDAVSync', () => ({ default: () => <div data-testid="webdav-sync" /> }));
vi.mock('../components/Conflicts', () => ({ default: () => <div data-testid="conflicts" /> }));
vi.mock('../components/TagManager', () => ({ default: () => <div data-testid="tag-manager" /> }));
vi.mock('../components/OneDriveSync', () => ({
  default: () => <div data-testid="onedrive-sync" />,
}));
vi.mock('../lib/webdavSyncManager', () => ({
  default: class {
    constructor() {}
  },
}));
vi.mock('../lib/storage', async () => {
  const actual = await vi.importActual<typeof import('../lib/storage')>('../lib/storage');
  const mockUserStorage = {
    setCurrentUser: vi.fn(async () => undefined),
    getDataAsync: vi.fn(async () => []),
    getCategoriesAsync: vi.fn(async () => []),
    getStatsAsync: vi.fn(async () => ({
      totalNotes: 0,
      favoriteNotes: 0,
      archivedNotes: 0,
      categories: {},
      totalTags: 0,
      createdToday: 0,
    })),
    getWebDAVConfigAsync: vi.fn(async () => null),
    getOneDriveConfigAsync: vi.fn(async () => null),
    getTrashNotesAsync: vi.fn(async () => []),
    getConflictsAsync: vi.fn(async () => []),
    migrateGuestDataToUser: vi.fn(async () => undefined),
  };

  return {
    ...actual,
    initWindowStorage: vi.fn(() => mockUserStorage),
  };
});

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(`${name}__meta`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe('Device session token and runtime gating', () => {
  const schema = [
    {
      name: 'notes',
      keyField: 'id',
      keyAuto: false,
      fields: [{ name: 'id', type: 'str', indexed: true, secret: false }],
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/device/session/validate')) {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({ success: false }),
      } as Response;
    });
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await Promise.all([
      deleteDatabase('QCNOTE_NOTES_DB_GUEST').catch(() => {}),
      deleteDatabase('QCNOTE_NOTES_DB_TESTUSER').catch(() => {}),
      deleteDatabase('QCNOTE_NOTES_DB_TESTUSER2').catch(() => {}),
    ]).catch(() => {});
  });

  it('allows a guest database to open without a session token', async () => {
    const db = await QCRuntime.open('QCNOTE_NOTES_DB_GUEST', schema, 1);
    expect(db).toBeInstanceOf(QCDb);
    await db.close();
  });

  it('rejects encrypted database open when session token is missing', async () => {
    await expect(
      QCRuntime.open('QCNOTE_NOTES_DB_TESTUSER', schema, 1, 'secret-key'),
    ).rejects.toThrow(/Device session token required/);
  });

  it('opens encrypted database when session token is present', async () => {
    const db = await QCRuntime.open(
      'QCNOTE_NOTES_DB_TESTUSER',
      schema,
      1,
      'secret-key',
      'session-token',
    );
    expect(db).toBeInstanceOf(QCDb);
    await db.close();
  });

  it('stores and retrieves device session tokens scoped to the current user', async () => {
    const storage = new NoteStorage();
    const setter = storage['setDeviceSessionToken'].bind(storage);
    const getter = storage['getDeviceSessionToken'].bind(storage);

    setter('alice', 'token-abc');
    expect(getter('alice')).toBe('token-abc');
    expect(getter('bob')).toBeNull();
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
  });

  it('fails to open the encrypted notes DB through NoteStorage without a device session token', async () => {
    const storage = new NoteStorage();
    await storage.setCurrentUser('alice', 'secret-key');

    const db = await storage['ensureNotesDb']();
    expect(db).toBeNull();
  });

  it('allows NoteStorage to open the encrypted notes DB after setting a device session token', async () => {
    const storage = new NoteStorage();
    storage['setDeviceSessionToken']('alice', 'device-token');
    await storage.setCurrentUser('alice', 'secret-key');

    const db = await storage['ensureNotesDb']();
    expect(db).not.toBeNull();
    await db?.close();
  });
});

describe('Dashboard cross-tab device session consistency', () => {
  let storageListener: ((event: StorageEvent) => void) | null = null;
  let originalAddEventListener: typeof window.addEventListener;
  let originalRemoveEventListener: typeof window.removeEventListener;
  const activeStorageListeners = new Set<(event: StorageEvent) => void>();

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    globalThis.fetch = mockFetch;
    (global as any).fetch = mockFetch;
    vi.stubGlobal('fetch', mockFetch);
    if (typeof window !== 'undefined') {
      window.fetch = mockFetch as any;
    }
    originalAddEventListener = window.addEventListener;
    originalRemoveEventListener = window.removeEventListener;
    storageListener = null;
    activeStorageListeners.clear();

    window.addEventListener = ((type, listener, options) => {
      if (type === 'storage') {
        const listenerFn = listener as (event: StorageEvent) => void;
        storageListener = listenerFn;
        activeStorageListeners.add(listenerFn);
      }
      return originalAddEventListener.call(window, type, listener, options);
    }) as typeof window.addEventListener;

    window.removeEventListener = ((type, listener, options) => {
      if (type === 'storage') {
        activeStorageListeners.delete(listener as (event: StorageEvent) => void);
      }
      return originalRemoveEventListener.call(window, type, listener, options);
    }) as typeof window.removeEventListener;

    if (!window.crypto.randomUUID) {
      (window.crypto as any).randomUUID = vi.fn(() => 'tab-uuid');
    }
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (global as any).fetch = originalFetch;
    window.fetch = originalFetch as any;
    vi.unstubAllGlobals();
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    vi.restoreAllMocks();
  });

  const renderDashboard = async () => {
    const { default: Dashboard } = await import('../pages/dashboard');
    const result = render(<Dashboard />);
    await waitFor(() => expect(result.getByTestId('layout')).toBeInTheDocument());
    await waitFor(() => expect(storageListener).not.toBeNull());
    return result;
  };

  const dispatchStorageEvent = async (key: string, newValue: string) => {
    const listener = storageListener || activeStorageListeners.values().next().value;
    if (!listener) {
      throw new Error('Storage listener not attached');
    }
    await act(async () => {
      const event = {
        key,
        newValue,
        oldValue: null,
        storageArea: window.localStorage,
      } as unknown as StorageEvent;
      listener.call(window, event);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  it('accepts a session token broadcast from another tab and stores it in sessionStorage', async () => {
    await renderDashboard();

    const payload = JSON.stringify({
      sourceId: 'other-tab',
      userId,
      action: 'set',
      token: 'token-broadcast',
      timestamp: Date.now(),
    });

    await dispatchStorageEvent(BROADCAST_KEY, payload);

    const stored = JSON.parse(sessionStorage.getItem(SESSION_TOKEN_KEY) as string);
    expect(stored.token).toBe('token-broadcast');
    expect(stored.userId).toBe(userId);
  });

  it('responds to a session token request from another tab when the current tab already has the token', async () => {
    sessionStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify({ userId, token: 'current-token' }));
    await renderDashboard();

    const requestPayload = JSON.stringify({
      sourceId: 'other-tab',
      requestId: 'request-1',
      userId,
      timestamp: Date.now(),
    });

    await dispatchStorageEvent(REQUEST_KEY, requestPayload);

    const response = localStorage.getItem(RESPONSE_KEY);
    expect(response).not.toBeNull();
    const parsed = JSON.parse(response as string);
    expect(parsed.requestId).toBe('request-1');
    expect(parsed.userId).toBe(userId);
    expect(parsed.token).toBe('current-token');
  });
});

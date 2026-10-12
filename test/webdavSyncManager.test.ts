import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebDAVSyncManager from '../lib/webdavSyncManager';
import type { NoteItem, NoteStorage, WebDAVConfig } from '../lib/storage';

// A stand-in for NoteStorage with just what the manager uses. Its
// userGeneration bumps on setCurrentUser, like the real one.
const makeStorage = () => {
  let generation = 0;
  const storage = {
    get userGeneration() {
      return generation;
    },
    setCurrentUser: async () => {
      generation++;
    },
    syncWithWebDAVAsync: vi.fn(async () => true),
    pushToWebDAVAsync: vi.fn(async () => true),
    pullFromWebDAVAsync: vi.fn(async () => true),
    getConflictsAsync: vi.fn(async () => []),
    resolveConflictAsync: vi.fn(async () => true),
    dismissConflictAsync: vi.fn(async () => true),
    savedConfig: null as WebDAVConfig | null,
    getWebDAVConfigAsync: vi.fn(async (): Promise<WebDAVConfig | null> => storage.savedConfig),
    setWebDAVConfigAsync: vi.fn(async (config: WebDAVConfig) => {
      storage.savedConfig = config;
      return true;
    }),
    runIfSameUser: async (g: number, task: () => Promise<unknown>) => {
      if (g !== generation) return false;
      await task();
      return true;
    },
  };
  return storage;
};

const conf = (over: Partial<WebDAVConfig> = {}): WebDAVConfig => ({
  url: 'https://dav.example.com/',
  username: 'alice',
  password: 'alice-password',
  remotePath: '/notes.json',
  autoSyncEnabled: true,
  syncInterval: 1000,
  ...over,
});

describe('WebDAVSyncManager across user switches', () => {
  let storage: ReturnType<typeof makeStorage>;
  let manager: WebDAVSyncManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    storage = makeStorage();
    manager = new WebDAVSyncManager(storage as unknown as NoteStorage);
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps syncing on its interval while the user is unchanged', async () => {
    await manager.start(conf());
    expect(storage.syncWithWebDAVAsync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(storage.syncWithWebDAVAsync).toHaveBeenCalledTimes(3);
    expect(manager.getStatus().isRunning).toBe(true);
  });

  it('stops auto-sync instead of syncing with the old config after a user switch', async () => {
    await manager.start(conf());
    await storage.setCurrentUser();

    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.syncWithWebDAVAsync).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().isRunning).toBe(false);
  });

  it('does not schedule auto-sync if the user switched during the first sync', async () => {
    storage.syncWithWebDAVAsync.mockImplementationOnce(async () => {
      await storage.setCurrentUser();
      return false;
    });
    await manager.start(conf());

    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.syncWithWebDAVAsync).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().isRunning).toBe(false);
  });

  it('never saves the old user’s config (with credentials) under the new user', async () => {
    // fails because the storage aborted on the switch, like the real one does
    storage.syncWithWebDAVAsync.mockImplementationOnce(async () => {
      await storage.setCurrentUser();
      return false;
    });
    await manager.syncNow(conf());
    expect(storage.setWebDAVConfigAsync).not.toHaveBeenCalled();

    storage.syncWithWebDAVAsync.mockImplementationOnce(async () => {
      await storage.setCurrentUser();
      return true;
    });
    await manager.syncNow(conf({ conflictStrategy: 'prefer-remote' }));
    expect(storage.setWebDAVConfigAsync).not.toHaveBeenCalled();
    expect(storage.getConflictsAsync).not.toHaveBeenCalled();
  });

  it('still records sync status for the same user', async () => {
    storage.savedConfig = conf();
    await manager.syncNow(conf());
    expect(storage.setWebDAVConfigAsync).toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncStatus: 'success' }),
    );
  });
});

describe('WebDAVSyncManager config handling', () => {
  let storage: ReturnType<typeof makeStorage>;
  let manager: WebDAVSyncManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    storage = makeStorage();
    manager = new WebDAVSyncManager(storage as unknown as NoteStorage);
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('records only the sync status, never the config the sync ran with', async () => {
    storage.savedConfig = conf({ password: 'saved-password' });
    await manager.syncNow(conf({ password: 'unsaved-form-password' }));
    expect(storage.savedConfig).toEqual(
      expect.objectContaining({ password: 'saved-password', lastSyncStatus: 'success' }),
    );
  });

  it('does not recreate a config that was cleared during the sync', async () => {
    await manager.syncNow(conf());
    expect(storage.setWebDAVConfigAsync).not.toHaveBeenCalled();
  });

  it('restarts auto-sync with the new config when it is saved while running', async () => {
    const oldConf = conf({ password: 'old-password' });
    const newConf = conf({ password: 'new-password' });
    await manager.start(oldConf);
    await manager.updateConfig(newConf);
    storage.syncWithWebDAVAsync.mockClear();

    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.syncWithWebDAVAsync).toHaveBeenCalledTimes(1);
    expect(storage.syncWithWebDAVAsync).toHaveBeenCalledWith(newConf, false);
  });

  it('keeps a single interval when restarted during the first sync', async () => {
    const first = manager.start(conf());
    const second = manager.updateConfig(conf({ password: 'new-password' }));
    await Promise.all([first, second]);
    storage.syncWithWebDAVAsync.mockClear();

    await vi.advanceTimersByTimeAsync(1000);
    expect(storage.syncWithWebDAVAsync).toHaveBeenCalledTimes(1);
  });

  it('does not schedule an interval when stopped during the first sync', async () => {
    const started = manager.start(conf());
    manager.stop();
    await started;

    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.syncWithWebDAVAsync).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().isRunning).toBe(false);
  });

  it('Sync Now waits for a running sync and then syncs again instead of failing', async () => {
    let finishFirst!: () => void;
    storage.syncWithWebDAVAsync.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finishFirst = () => resolve(true))),
    );
    const running = manager.start(conf());
    const manual = manager.syncNow(conf());

    finishFirst();
    await running;
    expect(await manual).toBe(true);
    expect(storage.syncWithWebDAVAsync).toHaveBeenCalledTimes(2);
  });

  it('resolves prefer-local conflicts by keeping the current note, not the snapshot', async () => {
    const snapshot = { id: 'n1', title: 'stale', content: '' } as unknown as NoteItem;
    storage.getConflictsAsync.mockResolvedValueOnce([
      { id: 'n1', local: snapshot, remote: snapshot, resolved: false, createdAt: 0 },
    ] as never);
    await manager.syncNow(conf({ conflictStrategy: 'prefer-local' }));
    expect(storage.dismissConflictAsync).toHaveBeenCalledWith('n1');
    expect(storage.resolveConflictAsync).not.toHaveBeenCalled();
  });
});

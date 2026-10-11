import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebDAVSyncManager from '../lib/webdavSyncManager';
import type { NoteStorage, WebDAVConfig } from '../lib/storage';

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
    setWebDAVConfigAsync: vi.fn(async () => true),
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
    await manager.syncNow(conf());
    expect(storage.setWebDAVConfigAsync).toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncStatus: 'success' }),
    );
  });
});

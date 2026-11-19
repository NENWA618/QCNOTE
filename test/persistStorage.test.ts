import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage, _resetPersistRequestForTests } from '../lib/persistStorage';

function stubStorage(storage: unknown) {
  vi.stubGlobal('navigator', { storage });
}

describe('requestPersistentStorage', () => {
  beforeEach(() => _resetPersistRequestForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('returns false when the API is unavailable', async () => {
    stubStorage(undefined);
    expect(await requestPersistentStorage()).toBe(false);
  });

  it('skips the request if already persisted', async () => {
    const persist = vi.fn();
    stubStorage({ persisted: vi.fn().mockResolvedValue(true), persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence once and reports the result', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    stubStorage({ persisted: vi.fn().mockResolvedValue(false), persist });
    expect(await requestPersistentStorage()).toBe(true);
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('returns false when the browser denies', async () => {
    stubStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    });
    expect(await requestPersistentStorage()).toBe(false);
  });

  it('never throws', async () => {
    stubStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockRejectedValue(new Error('boom')),
    });
    expect(await requestPersistentStorage()).toBe(false);
  });
});

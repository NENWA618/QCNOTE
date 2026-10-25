// Unlock requests run inside the cross-tab notes lock, so they must give up.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UNLOCK_REQUEST_TIMEOUT_MS,
  fetchVaultKey,
  validateDeviceSessionToken,
} from '../lib/storage/deviceSession';

/** A fetch that only settles when its signal aborts, like a hung connection. */
function hangingFetch() {
  return vi.fn(
    (_url: string, init: RequestInit = {}) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      }),
  );
}

describe('unlock request timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['fetchVaultKey', () => fetchVaultKey('token'), null],
    ['validateDeviceSessionToken', () => validateDeviceSessionToken('token'), false],
  ])('%s fails once the timeout fires', async (_name, request, failed) => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    vi.stubGlobal('fetch', hangingFetch());

    const result = request();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    controller.abort(new DOMException('timed out', 'TimeoutError'));

    expect(await result).toBe(failed);
    expect(timeout).toHaveBeenCalledWith(UNLOCK_REQUEST_TIMEOUT_MS);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncPushSubscription } from '../lib/pushNotification';

const subscriptionJSON = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'p', auth: 'a' },
};

function stubBrowser(permission: NotificationPermission, subscribed: boolean) {
  const getSubscription = vi
    .fn()
    .mockResolvedValue(subscribed ? { toJSON: () => subscriptionJSON } : null);
  vi.stubGlobal('Notification', { permission });
  vi.stubGlobal('PushManager', function PushManager() {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { getSubscription } }) },
  });
}

describe('syncPushSubscription', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC', 'public-key');
    fetchMock.mockReset().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it("re-sends this browser's subscription so the server's record stays current", async () => {
    stubBrowser('granted', true);
    await syncPushSubscription();
    expect(fetchMock).toHaveBeenCalledWith('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscriptionJSON),
    });
  });

  it('does nothing when the browser has no subscription', async () => {
    stubBrowser('granted', false);
    await syncPushSubscription();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing without notification permission', async () => {
    stubBrowser('default', true);
    await syncPushSubscription();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

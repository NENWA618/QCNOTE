import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PushService, isGoneSubscriptionError } from '../server/push-service';

const { dbQuery, sendNotification } = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock('../server/postgres-client', () => ({
  getPostgresClient: () => ({ query: dbQuery }),
}));
// web-push 只装在 server/ 下，按 push-service 实际解析到的路径来 mock
vi.mock('../server/node_modules/web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
}));

// Shaped like web-push's WebPushError: the status is only in `statusCode`.
function webPushError(statusCode: number) {
  return Object.assign(new Error('Received unexpected response code'), { statusCode });
}

describe('isGoneSubscriptionError', () => {
  it('treats 404 and 410 from the push service as a dead subscription', () => {
    expect(isGoneSubscriptionError(webPushError(410))).toBe(true);
    expect(isGoneSubscriptionError(webPushError(404))).toBe(true);
  });

  it('keeps subscriptions on transient or other failures', () => {
    expect(isGoneSubscriptionError(webPushError(429))).toBe(false);
    expect(isGoneSubscriptionError(webPushError(500))).toBe(false);
    expect(isGoneSubscriptionError(webPushError(413))).toBe(false);
    expect(isGoneSubscriptionError(new Error('getaddrinfo ENOTFOUND'))).toBe(false);
    expect(isGoneSubscriptionError(null)).toBe(false);
  });
});

describe('PushService.getAllSubscriptions', () => {
  beforeEach(() => {
    dbQuery.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('throws when the database read fails instead of reporting no subscriptions', async () => {
    dbQuery.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(new PushService().getAllSubscriptions()).rejects.toThrow('connection terminated');
  });

  it('returns the stored subscriptions on allowed push hosts', async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } },
        { endpoint: 'https://evil.example.com/push', keys: { p256dh: 'p', auth: 'a' } },
      ],
    });
    const subscriptions = await new PushService().getAllSubscriptions();
    expect(subscriptions.map((s) => s.endpoint)).toEqual([
      'https://fcm.googleapis.com/fcm/send/abc',
    ]);
  });
});

describe('PushService.subscribe', () => {
  beforeEach(() => {
    dbQuery.mockReset().mockResolvedValue({ rows: [] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('replaces the stored keys when an endpoint subscribes again', async () => {
    await new PushService().subscribe(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p2', auth: 'a2' } },
      'user-1',
    );
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(endpoint\) DO UPDATE\s+SET keys = EXCLUDED\.keys/);
    expect(params).toEqual([
      'https://fcm.googleapis.com/fcm/send/abc',
      JSON.stringify({ p256dh: 'p2', auth: 'a2' }),
      'user-1',
    ]);
  });
});

describe('PushService.broadcastNotification', () => {
  const endpoint = (i: number) => `https://fcm.googleapis.com/fcm/send/${i}`;

  beforeEach(() => {
    vi.stubEnv('VAPID_PUBLIC', 'public');
    vi.stubEnv('VAPID_PRIVATE', 'private');
    dbQuery.mockReset();
    sendNotification.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function storeSubscriptions(count: number) {
    dbQuery.mockResolvedValueOnce({
      rows: Array.from({ length: count }, (_, i) => ({
        endpoint: endpoint(i),
        keys: { p256dh: 'p', auth: 'a' },
      })),
    });
    dbQuery.mockResolvedValue({ rows: [] });
  }

  it('sends to every subscriber with a bounded number in flight', async () => {
    storeSubscriptions(25);
    let inFlight = 0;
    let maxInFlight = 0;
    sendNotification.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    });

    const result = await new PushService().broadcastNotification('hi');

    expect(result).toMatchObject({ success: 25, failed: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(25);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(10);
  });

  it('counts failures and deletes only subscriptions the push service reports gone', async () => {
    storeSubscriptions(3);
    sendNotification.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint === endpoint(1)) throw webPushError(410);
      if (subscription.endpoint === endpoint(2)) throw webPushError(500);
    });

    const result = await new PushService().broadcastNotification('hi');

    expect(result.success).toBe(1);
    expect(result.failed).toBe(2);
    const deletes = dbQuery.mock.calls.filter(([sql]) => String(sql).startsWith('DELETE'));
    expect(deletes).toEqual([
      ['DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint(1)]],
    ]);
  });
});

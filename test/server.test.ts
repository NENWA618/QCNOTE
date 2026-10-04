import { describe, it, expect } from 'vitest';
import vector from '../lib/vector';

describe('Server Vector Search and Index', () => {
  it('computeVector returns a vector object', () => {
    const text = 'hello world test';
    const vec = vector.computeVector(text);
    expect(vec).toBeDefined();
    expect(typeof vec === 'object').toBe(true);
    expect(vec['hello']).toBeGreaterThan(0);
    expect(vec['world']).toBeGreaterThan(0);
  });

  it('cosine similarity works correctly', () => {
    const vec1 = { hello: 1, world: 0 };
    const vec2 = { hello: 1, world: 0 };
    const sim = vector.cosine(vec1, vec2);
    expect(sim).toBeGreaterThan(0);
  });

  it('cosine returns 0 for completely different vectors', () => {
    const vec1 = { hello: 1 };
    const vec2 = { world: 1 };
    const sim = vector.cosine(vec1, vec2);
    expect(sim).toBe(0);
  });

  it('normalized vectors have magnitude ~1', () => {
    const text = 'test word example';
    const vec = vector.computeVector(text);
    let magnitude = 0;
    for (const k in vec) {
      magnitude += vec[k] * vec[k];
    }
    magnitude = Math.sqrt(magnitude);
    // should be close to 1
    expect(magnitude).toBeCloseTo(1, 1);
  });
});

// route tests
import { buildFastify } from '../server/index';

describe('Server routes', () => {
  let app;

  beforeEach(() => {
    app = buildFastify();
    // register routes freshly
    if (app && typeof app.register === 'function') {
      // plugin registration has already been done in buildFastify
    }
  });

  it('GET /stats returns default stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('totalNotes');
    expect(body.totalNotes).toBe(0);
    expect(body).toHaveProperty('indexReady');
  });

  it('POST /syncNote rejects anonymous callers', async () => {
    const note = { id: 'test1', title: 'hi' };
    const res = await app.inject({ method: 'POST', url: '/syncNote', payload: note });
    expect(res.statusCode).toBe(401);
  });

  it('PUT /api/admin/roles rejects anonymous callers', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/roles',
      payload: { userId: 'x', role: 'admin' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/admin/roles rejects anonymous callers', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/roles?email=a@b.c' });
    expect(res.statusCode).toBe(401);
  });

  it('user profile routes reject anonymous callers', async () => {
    const get = await app.inject({ method: 'GET', url: '/api/ugc/user/github:1' });
    expect(get.statusCode).toBe(401);
    const put = await app.inject({
      method: 'PUT',
      url: '/api/ugc/user/github:1',
      payload: { username: 'x' },
    });
    expect(put.statusCode).toBe(401);
  });

  it('POST /api/ugc/user/init requires the internal token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ugc/user/init',
      payload: { userId: 'github:1', email: 'a@b.c', username: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('push subscribe/unsubscribe reject anonymous callers', async () => {
    const sub = await app.inject({
      method: 'POST',
      url: '/api/push/subscribe',
      payload: { endpoint: 'http://169.254.169.254/', keys: { p256dh: 'a', auth: 'b' } },
    });
    expect(sub.statusCode).toBe(401);
    const unsub = await app.inject({
      method: 'POST',
      url: '/api/push/unsubscribe',
      payload: { endpoint: 'https://fcm.googleapis.com/x' },
    });
    expect(unsub.statusCode).toBe(401);
  });

  it('GET /api/health returns healthy status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('status', 'healthy');
    expect(body).toHaveProperty('notes');
  });

  it('Unknown route returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

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

  it('POST /syncNote adds a note', async () => {
    const note = { id: 'test1', title: 'hi' };
    const res = await app.inject({ method: 'POST', url: '/syncNote', payload: note });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it('POST /syncNote rejects invalid payload', async () => {
    const res = await app.inject({ method: 'POST', url: '/syncNote', payload: { foo: 'bar' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  it('POST /reply returns a reply object', async () => {
    const res = await app.inject({ method: 'POST', url: '/reply', payload: { message: 'hello' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('reply');
    expect(body).toHaveProperty('mood');
  });

  it('POST /reply with empty body still responds', async () => {
    const res = await app.inject({ method: 'POST', url: '/reply', payload: {} });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('reply');
  });

  it('Unknown route returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

describe('Rate Limiting Middleware', () => {
  it('should include rate limit headers in response', async () => {
    const app = buildFastify();
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generateTags',
      payload: { content: 'test' },
    });

    expect(res.headers['x-ratelimit-limit']).toBe('30');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('should not rate limit non-AI endpoints', async () => {
    const app = buildFastify();
    const res = await app.inject({
      method: 'GET',
      url: '/stats',
    });

    expect(res.statusCode).toBe(200);
    // Non-AI endpoints should not have rate limit headers
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });
});

describe('Error Handling', () => {
  it('should return 400 for missing content in generateTags', async () => {
    const app = buildFastify();
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generateTags',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('content is required');
  });

  it('should return 400 for missing content in generateSummary', async () => {
    const app = buildFastify();
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generateSummary',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('content is required');
  });

  it('should handle malformed JSON gracefully', async () => {
    const app = buildFastify();
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generateTags',
      payload: null,
    });

    // Should handle gracefully (400 or 500 but not crash)
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

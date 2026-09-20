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

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

import { describe, it, expect, beforeEach } from 'vitest';
import progression from '../lib/progression';

describe('progression module', () => {
  beforeEach(async () => {
    // clear storage
    const IDB = (await import('../lib/idb')).default;
    if (IDB.clearStore) await IDB.clearStore();
  });

  it('initial state is level1 xp0', async () => {
    const s = await progression.loadProgress();
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
    expect(s.affection).toBeGreaterThanOrEqual(0);
  });

  it('adding xp increments level when threshold crossed', async () => {
    let s = await progression.addXp(50);
    expect(s.level).toBe(1);
    expect(s.xp).toBe(50);
    s = await progression.addXp(100);
    expect(s.level).toBe(2);
    expect(s.xp).toBe(50); // 150-100
  });

  it('affection decays over days', async () => {
    const state = await progression.addAffection(20);
    expect(state.affection).toBeGreaterThanOrEqual(50);
    // fake lastDecay old
    const s2 = await progression.loadProgress();
    s2.lastDecay = s2.lastDecay - 2 * 24 * 3600 * 1000;
    await progression.saveProgress(s2);
    const dec = await progression.decayAffection();
    expect(dec.affection).toBeLessThan(state.affection);
  });
});
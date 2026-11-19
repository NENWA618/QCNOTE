// @vitest-environment node
// The daily maze is the same for everyone on a given day, and a run token is
// bound to the day it was started on.
import { describe, it, expect, beforeAll } from 'vitest';
import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import { UGCService } from '../server/ugc-service';

beforeAll(() => {
  process.env.DEVICE_SESSION_SECRET = 'test-secret-for-maze-daily';
});

const service = () =>
  new UGCService({} as unknown as RedisClientType, { query: async () => ({}) } as unknown as Pool);

describe('daily maze seed', () => {
  it('is stable within a day and differs between days', () => {
    const s = service();
    expect(s.dailyMazeSeed('2026-10-30')).toBe(s.dailyMazeSeed('2026-10-30'));
    expect(s.dailyMazeSeed('2026-10-30')).not.toBe(s.dailyMazeSeed('2026-10-31'));
  });

  it('is not derivable without the server secret', () => {
    const a = service().dailyMazeSeed('2026-10-30');
    process.env.DEVICE_SESSION_SECRET = 'another-secret';
    const b = service().dailyMazeSeed('2026-10-30');
    process.env.DEVICE_SESSION_SECRET = 'test-secret-for-maze-daily';
    expect(a).not.toBe(b);
  });
});

describe('run token', () => {
  it('carries the day and the daily seed, and belongs to one user', async () => {
    const s = service();
    const { token, seed } = await s.createMazeRunToken('u1', '2026-10-30');
    expect(seed).toBe(s.dailyMazeSeed('2026-10-30'));
    const run = await s.verifyMazeRunToken('u1', token);
    expect(run).toMatchObject({ seed, day: '2026-10-30' });
    expect(await s.verifyMazeRunToken('someone-else', token)).toBeNull();
  });
});

// A day's best maze run must be stored as one run, never as the fewest
// steps of one run paired with the shortest time of another.
import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import { UGCService } from '../server/ugc-service';

const KEY = 'leaderboard:maze:2026-10-12';

function setup(zAddResult: number) {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  const redis = {
    zAdd: vi.fn().mockResolvedValue(zAddResult),
    set: vi.fn().mockResolvedValue('OK'),
  };
  const service = new UGCService(redis as unknown as RedisClientType, { query } as unknown as Pool);
  return { service, query, redis };
}

describe('maze submission storage', () => {
  it('replaces steps, time and timestamp together, only for a better run', async () => {
    const { service, query } = setup(1);
    await service.addGameSubmission(KEY, 'u1', 30, 20000, 'name', '');

    const upsert = query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('INSERT INTO maze_submissions'))!
      .replace(/\s+/g, ' ');
    const better =
      '(EXCLUDED.steps, EXCLUDED.time_ms) < (maze_submissions.steps, maze_submissions.time_ms)';
    for (const column of ['steps', 'time_ms', 'created_at']) {
      expect(upsert).toContain(`${column} = CASE WHEN ${better}`);
    }
    // the old per-column minimum is gone
    expect(upsert).not.toContain('EXCLUDED.steps < maze_submissions.steps');
  });

  it('only lets a better score replace the Redis entry', async () => {
    const { service, redis } = setup(0);
    await service.addGameSubmission(KEY, 'u1', 30, 20000, 'name', '');

    expect(redis.zAdd).toHaveBeenCalledWith(KEY, expect.any(Object), {
      comparison: 'GT',
      CH: true,
    });
    // not improved: the stored run details stay as they were
    const keys = redis.set.mock.calls.map(([key]) => key);
    expect(keys).not.toContain(`${KEY}:user:u1`);
  });

  it('records the run details when the score improves', async () => {
    const { service, redis } = setup(1);
    await service.addGameSubmission(KEY, 'u1', 30, 20000, 'name', '');
    const keys = redis.set.mock.calls.map(([key]) => key);
    expect(keys).toContain(`${KEY}:user:u1`);
  });
});

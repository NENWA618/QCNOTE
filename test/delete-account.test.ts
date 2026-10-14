import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import { UGCService } from '../server/ugc-service';

function makeService(scanBatches: string[][], zsetMembers: Record<string, string[]> = {}) {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  const redis = {
    del: vi.fn().mockResolvedValue(1),
    zRem: vi.fn(async (key: string, member: string) =>
      zsetMembers[key]?.includes(member) ? 1 : 0,
    ),
    scanIterator: vi.fn(async function* () {
      yield* scanBatches;
    }),
  };
  const service = new UGCService(redis as unknown as RedisClientType, { query } as unknown as Pool);
  return { service, query, redis };
}

describe('UGCService.deleteUserAccount', () => {
  it('用一条语句删除用户行、推送订阅和迷宫成绩，并写入注销记录', async () => {
    const { service, query } = makeService([]);
    const before = Date.now();
    const deletedAt = await service.deleteUserAccount('github:42');
    expect(deletedAt).toBeGreaterThanOrEqual(before);

    const deleteCall = query.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM users'));
    expect(deleteCall).toBeDefined();
    const [sql, params] = deleteCall!;
    expect(sql).toContain('DELETE FROM push_subscriptions WHERE user_id = $1');
    expect(sql).toContain('DELETE FROM maze_submissions WHERE user_id = $1');
    expect(sql).toContain('INSERT INTO account_deletions (user_id, deleted_at) VALUES ($1, $2)');
    expect(params).toEqual(['github:42', deletedAt]);
  });

  it('清除资料缓存，并从该用户所在的每个排行榜移除', async () => {
    const { service, redis } = makeService(
      [
        [
          'leaderboard:leaderboard:maze:2026-10-14:github:42:info',
          // 用户 x:github:42 的信息键也会被匹配到
          'leaderboard:leaderboard:maze:2026-10-14:x:github:42:info',
        ],
        ['leaderboard:leaderboard:notes:github:42:info'],
      ],
      {
        'leaderboard:maze:2026-10-14': ['github:42', 'x:github:42'],
        'leaderboard:notes': ['github:42'],
      },
    );
    await service.deleteUserAccount('github:42');

    expect(redis.del).toHaveBeenCalledWith(['user:github:42:profile', 'user:github:42:heatmap']);
    expect(redis.scanIterator).toHaveBeenCalledWith(
      expect.objectContaining({ MATCH: 'leaderboard:*:github:42:info' }),
    );
    expect(redis.del.mock.calls.slice(1)).toEqual([
      [
        [
          'leaderboard:leaderboard:maze:2026-10-14:github:42:info',
          'leaderboard:maze:2026-10-14:user:github:42',
        ],
      ],
      [['leaderboard:leaderboard:notes:github:42:info', 'leaderboard:notes:user:github:42']],
    ]);
  });

  it('不删除 id 以该用户 id 结尾的其他用户的排行榜信息', async () => {
    const { service, redis } = makeService(
      [['leaderboard:leaderboard:maze:2026-10-14:x:github:42:info']],
      { 'leaderboard:maze:2026-10-14': ['x:github:42'] },
    );
    await service.deleteUserAccount('github:42');
    // 只有资料缓存那一次 del
    expect(redis.del).toHaveBeenCalledTimes(1);
  });

  it('转义用户 id 中的通配符', async () => {
    const { service, redis } = makeService([]);
    await service.deleteUserAccount('dev-user:a*b?[c]');
    expect(redis.scanIterator).toHaveBeenCalledWith(
      expect.objectContaining({ MATCH: 'leaderboard:*:dev-user:a\\*b\\?\\[c\\]:info' }),
    );
  });
});

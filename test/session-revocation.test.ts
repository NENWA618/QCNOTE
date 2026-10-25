// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
// 后端用的是 server/node_modules 里那份 next-auth，用它签出真实的会话 cookie
import { encode } from '../server/node_modules/next-auth/jwt';
import { SESSION_COOKIE_NAME } from '../lib/authCookies';
import { buildFastify } from '../server/app';
import { getSessionIdentity, rememberAccountDeletion } from '../server/session';
import { INTERNAL_TOKEN_HEADER, getInternalApiToken } from '../lib/internalAuth';

// 注销记录表：user_id -> deleted_at
const { deletions, dbQuery } = vi.hoisted(() => {
  const deletions = new Map<string, number>();
  const dbQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM account_deletions')) {
      const deletedAt = deletions.get(params[0] as string);
      return { rows: deletedAt === undefined ? [] : [{ deleted_at: String(deletedAt) }] };
    }
    return { rows: [] };
  });
  return { deletions, dbQuery };
});
vi.mock('../server/postgres-client', () => ({
  initPostgresClient: async () => ({ query: dbQuery }),
}));
vi.mock('../server/redis-client', () => ({
  initRedisClient: async () => ({}),
  closeRedisClient: async () => {},
}));

const SECRET = 'test-secret';
let request: never;

async function tokenFor(id: string, signedInAt?: number) {
  const token = await encode({
    token: { id, ...(signedInAt !== undefined && { signedInAt }) },
    secret: SECRET,
  });
  request = { raw: { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } } } as never;
}

describe('会话因注销账号失效', () => {
  beforeEach(() => {
    vi.stubEnv('NEXTAUTH_SECRET', SECRET);
    dbQuery.mockClear();
  });

  it('没有注销记录时会话有效', async () => {
    await tokenFor('github:1', 1000);
    expect(await getSessionIdentity(request)).toEqual({
      userId: 'github:1',
      email: null,
      sessionId: null,
    });
  });

  it('注销前登录的会话失效，注销后重新登录的会话有效', async () => {
    deletions.set('github:2', 5000);
    await tokenFor('github:2', 4000);
    expect(await getSessionIdentity(request)).toBeNull();
    await tokenFor('github:2', 6000);
    expect(await getSessionIdentity(request)).toEqual({
      userId: 'github:2',
      email: null,
      sessionId: null,
    });
  });

  it('没有 signedInAt 的旧令牌视为注销前登录', async () => {
    deletions.set('github:3', 5000);
    await tokenFor('github:3');
    expect(await getSessionIdentity(request)).toBeNull();
  });

  it('本进程注销后立即生效，不等缓存过期', async () => {
    await tokenFor('github:4', 1000);
    expect(await getSessionIdentity(request)).not.toBeNull();
    rememberAccountDeletion('github:4', 2000);
    expect(await getSessionIdentity(request)).toBeNull();
  });

  it('查询结果会缓存', async () => {
    await tokenFor('github:5', 1000);
    await getSessionIdentity(request);
    await getSessionIdentity(request);
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });

  it('查询失败时放行', async () => {
    dbQuery.mockRejectedValueOnce(new Error('connection refused'));
    await tokenFor('github:6', 1000);
    expect(await getSessionIdentity(request, { quiet: true })).not.toBeNull();
  });
});

describe('POST /api/ugc/session/status', () => {
  beforeEach(() => {
    vi.stubEnv('NEXTAUTH_SECRET', SECRET);
  });

  it('需要服务间令牌', async () => {
    const res = await buildFastify().inject({
      method: 'POST',
      url: '/api/ugc/session/status',
      payload: { userId: 'github:7', signedInAt: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('返回会话是否已失效', async () => {
    deletions.set('github:7', 5000);
    const app = buildFastify();
    const check = (signedInAt: number) =>
      app.inject({
        method: 'POST',
        url: '/api/ugc/session/status',
        headers: { [INTERNAL_TOKEN_HEADER]: getInternalApiToken(SECRET)! },
        payload: { userId: 'github:7', signedInAt },
      });
    expect(JSON.parse((await check(4000)).body)).toMatchObject({ revoked: true });
    expect(JSON.parse((await check(6000)).body)).toMatchObject({ revoked: false });
  });
});

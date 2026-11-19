// @vitest-environment node
// 一个账号同一时间只有一个有效的登录会话：登录时登记新的会话 ID（sid），
// 令牌里的 sid 不是登记的那个，这个会话就作废；设备会话令牌绑定在登录会话上，不再校验浏览器指纹。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';
// 后端用的是 server/node_modules 里那份 next-auth，用它签出真实的会话 cookie
import { encode } from '../server/node_modules/next-auth/jwt';
import { SESSION_COOKIE_NAME } from '../lib/authCookies';
import { INTERNAL_TOKEN_HEADER, getInternalApiToken } from '../lib/internalAuth';

// 账号状态：user_id -> 当前有效会话 ID（对应 users.active_session_id）
const { activeSessions, dbQuery, service } = vi.hoisted(() => {
  const activeSessions = new Map<string, string | null>();
  const dbQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('active_session_id')) {
      return {
        rows: [
          { deleted_at: null, active_session_id: activeSessions.get(params[0] as string) ?? null },
        ],
      };
    }
    return { rows: [] };
  });
  return { activeSessions, dbQuery, service: { setActiveSession: vi.fn() } };
});
vi.mock('../server/postgres-client', () => ({
  initPostgresClient: async () => ({ query: dbQuery }),
}));
vi.mock('../server/redis-client', () => ({
  initRedisClient: async () => ({}),
  closeRedisClient: async () => {},
}));
vi.mock('../server/context', () => ({ getUgcService: () => service }));

import { buildFastify } from '../server/app';
import { forgetSessionState, getSessionIdentity, isSessionRevoked } from '../server/session';
import { UGCService } from '../server/ugc-service';

const SECRET = 'test-secret';

async function requestWith(id: string, sid?: string) {
  const token = await encode({
    token: { id, signedInAt: 1000, ...(sid !== undefined && { sid }) },
    secret: SECRET,
  });
  return { raw: { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } } } as never;
}

beforeEach(() => {
  vi.stubEnv('NEXTAUTH_SECRET', SECRET);
  activeSessions.clear();
  dbQuery.mockClear();
  service.setActiveSession.mockReset();
});

describe('会话因在别处登录而失效', () => {
  it('账号还没登记过会话时，没有 sid 的旧令牌不拦截', async () => {
    const identity = await getSessionIdentity(await requestWith('github:10'));
    expect(identity).toEqual({ userId: 'github:10', email: null, sessionId: null });
  });

  it('只有登记的那个会话有效，之前的会话作废', async () => {
    activeSessions.set('github:11', 'sid-new');
    expect(
      await getSessionIdentity(await requestWith('github:11', 'sid-old'), { quiet: true }),
    ).toBeNull();
    expect(await getSessionIdentity(await requestWith('github:11', 'sid-new'))).toEqual({
      userId: 'github:11',
      email: null,
      sessionId: 'sid-new',
    });
  });

  it('账号登记过会话之后，没有 sid 的旧令牌也失效', async () => {
    activeSessions.set('github:12', 'sid-new');
    expect(await getSessionIdentity(await requestWith('github:12'), { quiet: true })).toBeNull();
  });

  it('登记新会话后丢弃本进程缓存，旧会话下一个请求就被拒绝', async () => {
    activeSessions.set('github:13', 'sid-a');
    expect(await getSessionIdentity(await requestWith('github:13', 'sid-a'))).not.toBeNull();

    activeSessions.set('github:13', 'sid-b');
    // 缓存还没过期，仍按旧状态放行
    expect(await getSessionIdentity(await requestWith('github:13', 'sid-a'))).not.toBeNull();

    forgetSessionState('github:13');
    expect(
      await getSessionIdentity(await requestWith('github:13', 'sid-a'), { quiet: true }),
    ).toBeNull();
    expect(await getSessionIdentity(await requestWith('github:13', 'sid-b'))).not.toBeNull();
  });

  it('查询失败时放行', async () => {
    dbQuery.mockRejectedValueOnce(new Error('connection refused'));
    expect(await isSessionRevoked('github:14', 1000, 'sid-a')).toBe(false);
  });
});

describe('POST /api/ugc/session/register', () => {
  const post = (payload: unknown, internal = true) =>
    buildFastify().inject({
      method: 'POST',
      url: '/api/ugc/session/register',
      headers: internal ? { [INTERNAL_TOKEN_HEADER]: getInternalApiToken(SECRET)! } : {},
      payload: payload as object,
    });

  it('需要服务间令牌', async () => {
    const res = await post({ userId: 'github:20', sessionId: 'sid-a' }, false);
    expect(res.statusCode).toBe(401);
    expect(service.setActiveSession).not.toHaveBeenCalled();
  });

  it('参数不合法时返回 400', async () => {
    expect((await post({ userId: 'github:20' })).statusCode).toBe(400);
    expect((await post({ userId: 'github:20', sessionId: 'x'.repeat(129) })).statusCode).toBe(400);
    expect(service.setActiveSession).not.toHaveBeenCalled();
  });

  it('登记会话，之前的会话随即作废', async () => {
    service.setActiveSession.mockImplementation(async (userId: string, sessionId: string) => {
      activeSessions.set(userId, sessionId);
      return true;
    });
    activeSessions.set('github:21', 'sid-old');
    // 先让旧会话进入缓存
    expect(await getSessionIdentity(await requestWith('github:21', 'sid-old'))).not.toBeNull();

    const res = await post({ userId: 'github:21', sessionId: 'sid-new' });
    expect(res.statusCode).toBe(200);
    expect(service.setActiveSession).toHaveBeenCalledWith('github:21', 'sid-new');

    expect(
      await getSessionIdentity(await requestWith('github:21', 'sid-old'), { quiet: true }),
    ).toBeNull();
    expect(await getSessionIdentity(await requestWith('github:21', 'sid-new'))).not.toBeNull();
  });

  it('用户不存在时返回 404', async () => {
    service.setActiveSession.mockResolvedValue(false);
    expect((await post({ userId: 'github:22', sessionId: 'sid-a' })).statusCode).toBe(404);
  });
});

describe('POST /api/ugc/session/status 带会话 ID', () => {
  it('被新会话顶掉的会话返回 revoked', async () => {
    activeSessions.set('github:30', 'sid-new');
    const check = (sessionId?: string) =>
      buildFastify().inject({
        method: 'POST',
        url: '/api/ugc/session/status',
        headers: { [INTERNAL_TOKEN_HEADER]: getInternalApiToken(SECRET)! },
        payload: { userId: 'github:30', signedInAt: 1000, sessionId },
      });
    expect(JSON.parse((await check('sid-old')).body)).toMatchObject({ revoked: true });
    expect(JSON.parse((await check('sid-new')).body)).toMatchObject({ revoked: false });
  });
});

describe('设备会话令牌绑定登录会话', () => {
  function makeService() {
    return new UGCService({} as unknown as RedisClientType, { query: vi.fn() } as unknown as Pool);
  }

  it('只在签发它的登录会话里有效', async () => {
    const ugc = makeService();
    const token = await ugc.createDeviceSessionToken('u1', 'sid-a');
    await expect(ugc.verifyDeviceSessionToken('u1', token, 'sid-a')).resolves.toBe(true);
    await expect(ugc.verifyDeviceSessionToken('u1', token, 'sid-b')).resolves.toBe(false);
    await expect(ugc.verifyDeviceSessionToken('u1', token, null)).resolves.toBe(false);
  });

  it('只绑定签发给的用户', async () => {
    const ugc = makeService();
    const token = await ugc.createDeviceSessionToken('u1', 'sid-a');
    await expect(ugc.verifyDeviceSessionToken('u2', token, 'sid-a')).resolves.toBe(false);
  });

  it('还没带 sid 的旧登录令牌签发的设备令牌，只在同样没有 sid 时有效', async () => {
    const ugc = makeService();
    const token = await ugc.createDeviceSessionToken('u1', null);
    await expect(ugc.verifyDeviceSessionToken('u1', token, null)).resolves.toBe(true);
    await expect(ugc.verifyDeviceSessionToken('u1', token, 'sid-a')).resolves.toBe(false);
  });
});

describe('UGCService.setActiveSession', () => {
  it('无条件写入新的会话 ID，用户不存在时返回 false', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({
      rowCount: 0,
    });
    const ugc = new UGCService({} as unknown as RedisClientType, { query } as unknown as Pool);

    await expect(ugc.setActiveSession('u1', 'sid-a')).resolves.toBe(true);
    await expect(ugc.setActiveSession('missing', 'sid-a')).resolves.toBe(false);
    expect(String(query.mock.calls[0][0]).replace(/\s+/g, ' ')).toBe(
      'UPDATE users SET active_session_id = $2 WHERE id = $1',
    );
    expect(query.mock.calls[0][1]).toEqual(['u1', 'sid-a']);
  });
});

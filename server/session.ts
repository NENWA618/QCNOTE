import type { FastifyReply, FastifyRequest } from 'fastify';
import type { NextApiRequest } from 'next';
import { getToken } from 'next-auth/jwt';
import { initPostgresClient } from './postgres-client';
import { SESSION_COOKIE_NAME, USE_SECURE_COOKIES } from '../lib/authCookies';
import logger from '../lib/logger';
import type { BackendRequest } from './types';

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, pair) => {
    const [name, ...valueParts] = pair.split('=');
    const nameTrimmed = name?.trim();
    if (!nameTrimmed) return cookies;
    cookies[nameTrimmed] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {});
}

export type RequestWithRaw = Pick<FastifyRequest, 'raw'>;

// 会话是无状态的 JWT，所以每次还要查两件事：账号是否注销过（注销前登录的会话失效），
// 以及该账号当前唯一有效的登录会话是哪一个（一个账号同一时间只允许一个会话，
// 新登录会让旧会话失效）。两者一条查询取回。
// 每个请求会解析两次会话（限流 + 鉴权），结果在本进程缓存一小段时间；多实例部署时
// 其它实例最多晚这么久才拒绝旧会话。
const SESSION_STATE_CACHE_TTL_MS = 30_000;
const SESSION_STATE_CACHE_MAX = 10_000;

interface SessionState {
  deletedAt: number | null;
  /** NULL：该账号还没有按“单会话”方式登录过，旧令牌（没有 sid）暂不拦截。 */
  activeSessionId: string | null;
}

const sessionStateCache = new Map<string, { state: SessionState; expires: number }>();

function cacheSessionState(userId: string, state: SessionState) {
  if (sessionStateCache.size >= SESSION_STATE_CACHE_MAX) sessionStateCache.clear();
  sessionStateCache.set(userId, { state, expires: Date.now() + SESSION_STATE_CACHE_TTL_MS });
}

/** 注销账号后立即让本进程拒绝该用户的旧会话，不等缓存过期。 */
export function rememberAccountDeletion(userId: string, deletedAt: number) {
  const previous = sessionStateCache.get(userId)?.state;
  cacheSessionState(userId, { deletedAt, activeSessionId: previous?.activeSessionId ?? null });
}

/** 该账号换了新的登录会话后，丢弃本进程里缓存的旧状态，让下一个请求立刻读到新会话。 */
export function forgetSessionState(userId: string) {
  sessionStateCache.delete(userId);
}

async function getSessionState(userId: string): Promise<SessionState> {
  const cached = sessionStateCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.state;

  const pool = await initPostgresClient();
  const result = await pool.query(
    `SELECT (SELECT deleted_at FROM account_deletions WHERE user_id = $1) AS deleted_at,
            (SELECT active_session_id FROM users WHERE id = $1) AS active_session_id`,
    [userId],
  );
  const row = result.rows[0];
  const state: SessionState = {
    deletedAt: row?.deleted_at != null ? Number(row.deleted_at) : null,
    activeSessionId: typeof row?.active_session_id === 'string' ? row.active_session_id : null,
  };
  cacheSessionState(userId, state);
  return state;
}

/**
 * 会话失效的两种情况：
 * 1. 该账号注销过、且这个会话是在注销之前登录的。没有 signedInAt 的旧令牌一律视为注销前登录。
 * 2. 该账号已有登记的有效会话，而这个会话不是它（被后来的登录顶掉了）。
 *    没有 sid 的旧令牌在账号登记过会话之后同样失效。
 * 查询失败时放行（不因数据库抖动把所有人踢下线）。
 */
export async function isSessionRevoked(
  userId: string,
  signedInAt: number | undefined,
  sessionId?: string,
): Promise<boolean> {
  try {
    const { deletedAt, activeSessionId } = await getSessionState(userId);
    if (deletedAt !== null && (signedInAt === undefined || signedInAt <= deletedAt)) return true;
    return activeSessionId !== null && sessionId !== activeSessionId;
  } catch (error) {
    logger.error('Failed to check session state:', error);
    return false;
  }
}

export interface SessionIdentity {
  userId: string;
  email: string | null;
  /** 登录令牌里的会话 ID（sid）；还没带 sid 的旧令牌为 null。 */
  sessionId: string | null;
}

export async function getSessionIdentity(
  request: RequestWithRaw,
  { quiet = false }: { quiet?: boolean } = {},
): Promise<SessionIdentity | null> {
  try {
    const token = await getToken({
      req: {
        ...request.raw,
        cookies: parseCookieHeader(request.raw.headers.cookie as string | undefined),
      } as unknown as NextApiRequest,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: USE_SECURE_COOKIES,
      cookieName: SESSION_COOKIE_NAME,
    });

    if (!token || typeof token !== 'object') {
      // 不要记录 cookie 内容：其中包含会话令牌
      if (!quiet) {
        logger.warn('Session token missing or invalid', {
          hasCookie: Boolean(request.raw.headers.cookie),
        });
      }
      return null;
    }

    const userId = (token.id as string) || (token.sub as string) || null;
    if (!userId) {
      if (!quiet) logger.warn('Decoded token has no user id/sub');
      return null;
    }

    const signedInAt = typeof token.signedInAt === 'number' ? token.signedInAt : undefined;
    const sessionId = typeof token.sid === 'string' && token.sid ? token.sid : undefined;
    if (await isSessionRevoked(userId, signedInAt, sessionId)) {
      if (!quiet)
        logger.warn('Session was revoked (account deleted or signed in elsewhere)', { userId });
      return null;
    }

    return {
      userId,
      email: typeof token.email === 'string' ? token.email : null,
      sessionId: sessionId ?? null,
    };
  } catch (error) {
    if (!quiet) {
      logger.error('Failed to decode session token:', error, {
        hasCookie: Boolean(request.raw.headers.cookie),
        hasNextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
      });
    }
    return null;
  }
}

export async function getSessionUserId(request: RequestWithRaw): Promise<string | null> {
  return (await getSessionIdentity(request))?.userId ?? null;
}

export async function requireUser(
  request: RequestWithRaw,
  reply: FastifyReply,
): Promise<SessionIdentity | null> {
  const identity = await getSessionIdentity(request);
  if (!identity) {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
    return null;
  }
  return identity;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const pool = await initPostgresClient();
  const result = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return result.rows[0]?.role === 'admin';
}

export async function requireAdmin(
  request: BackendRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const userId = await getSessionUserId(request);
  if (!userId) {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
    return null;
  }

  if (!(await isAdminUser(userId))) {
    reply.status(403).send({ success: false, error: 'Forbidden' });
    return null;
  }

  return userId;
}

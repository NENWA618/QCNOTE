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

// 会话是无状态的 JWT，注销账号后其它设备上的令牌仍能解出来，所以每次还要查注销记录。
// 每个请求会解析两次会话（限流 + 鉴权），结果在本进程缓存一小段时间；多实例部署时
// 其它实例最多晚这么久才拒绝旧会话。
const DELETION_CACHE_TTL_MS = 30_000;
const DELETION_CACHE_MAX = 10_000;
const deletionCache = new Map<string, { deletedAt: number | null; expires: number }>();

function cacheDeletion(userId: string, deletedAt: number | null) {
  if (deletionCache.size >= DELETION_CACHE_MAX) deletionCache.clear();
  deletionCache.set(userId, { deletedAt, expires: Date.now() + DELETION_CACHE_TTL_MS });
}

/** 注销账号后立即让本进程拒绝该用户的旧会话，不等缓存过期。 */
export function rememberAccountDeletion(userId: string, deletedAt: number) {
  cacheDeletion(userId, deletedAt);
}

async function getAccountDeletedAt(userId: string): Promise<number | null> {
  const cached = deletionCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.deletedAt;

  const pool = await initPostgresClient();
  const result = await pool.query('SELECT deleted_at FROM account_deletions WHERE user_id = $1', [
    userId,
  ]);
  const deletedAt = result.rows[0] ? Number(result.rows[0].deleted_at) : null;
  cacheDeletion(userId, deletedAt);
  return deletedAt;
}

/**
 * 该账号注销过、且这个会话是在注销之前登录的，就算失效。没有 signedInAt 的旧令牌
 * 一律视为注销前登录。查询失败时放行（不因数据库抖动把所有人踢下线）。
 */
export async function isSessionRevoked(
  userId: string,
  signedInAt: number | undefined,
): Promise<boolean> {
  try {
    const deletedAt = await getAccountDeletedAt(userId);
    return deletedAt !== null && (signedInAt === undefined || signedInAt <= deletedAt);
  } catch (error) {
    logger.error('Failed to check account deletion:', error);
    return false;
  }
}

export interface SessionIdentity {
  userId: string;
  email: string | null;
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
    if (await isSessionRevoked(userId, signedInAt)) {
      if (!quiet) logger.warn('Session belongs to a deleted account', { userId });
      return null;
    }

    return { userId, email: typeof token.email === 'string' ? token.email : null };
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

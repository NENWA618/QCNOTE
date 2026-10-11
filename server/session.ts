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

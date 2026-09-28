import crypto from 'crypto';

/**
 * 前端（NextAuth 登录回调）→ 后端的服务间调用凭证。
 *
 * 登录回调发生在用户还没有会话的时候，无法用 session cookie 鉴权，所以用
 * NEXTAUTH_SECRET 派生一个只有两端服务器知道的令牌。浏览器拿不到它，
 * 代理路由也不会转发它。
 */
export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

export function getInternalApiToken(secret: string | undefined): string | null {
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('qcnote:internal-api:v1').digest('hex');
}

export function isValidInternalApiToken(candidate: unknown, secret: string | undefined): boolean {
  const expected = getInternalApiToken(secret);
  if (!expected || typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

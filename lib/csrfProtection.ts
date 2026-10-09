/**
 * CSRF Protection Utilities
 *
 * 两层防护：
 * 1. `isSameOriginRequest` / `withCsrfProtection`：所有会修改状态的 Next API 路由都经过它。
 *    浏览器发起的跨站请求会被 `Sec-Fetch-Site` / `Origin` 头识别并拒绝，前端不需要任何改动。
 *    没有这些头的请求（curl、服务端调用）不是 CSRF 的攻击面，放行。
 * 2. `generateCSRFToken` / `validateCSRFToken`：与会话绑定的无状态 HMAC 令牌，
 *    不依赖进程内存，多实例 / serverless 下也能校验。需要更强保证的接口可以再叠加使用。
 */
import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { env } from './env-config';

const TOKEN_EXPIRY_MS = 3600000; // 1 hour
const TOKEN_NONCE_BYTES = 16;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sign(sessionId: string, nonce: string, expiresAt: string): string {
  return crypto
    .createHmac('sha256', env.NEXTAUTH_SECRET)
    .update(`qcnote:csrf:v1|${sessionId}|${nonce}|${expiresAt}`)
    .digest('hex');
}

/**
 * Generate a CSRF token bound to a session. Format: `nonce.expiresAt.signature`
 */
export function generateCSRFToken(sessionId: string): string {
  const nonce = crypto.randomBytes(TOKEN_NONCE_BYTES).toString('hex');
  const expiresAt = String(Date.now() + TOKEN_EXPIRY_MS);
  return `${nonce}.${expiresAt}.${sign(sessionId, nonce, expiresAt)}`;
}

/**
 * Validate a CSRF token for a session (stateless: signature + expiry)
 */
export function validateCSRFToken(sessionId: string, token: string): boolean {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [nonce, expiresAt, signature] = parts;

  const expiresAtMs = Number(expiresAt);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false;

  const expected = Buffer.from(sign(sessionId, nonce, expiresAt));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',')[0]?.trim() || undefined;
}

function allowedHosts(req: Pick<NextApiRequest, 'headers'>): Set<string> {
  const hosts = new Set<string>();
  const host = firstHeader(req.headers.host);
  const forwardedHost = firstHeader(req.headers['x-forwarded-host']);
  if (host) hosts.add(host.toLowerCase());
  if (forwardedHost) hosts.add(forwardedHost.toLowerCase());
  try {
    hosts.add(new URL(env.NEXTAUTH_URL).host.toLowerCase());
  } catch {
    // NEXTAUTH_URL 已由 env-config 校验为合法 URL
  }
  return hosts;
}

/**
 * 判断请求是否可信（同源或非浏览器发起）。安全方法（GET/HEAD/OPTIONS）恒为 true。
 */
export function isSameOriginRequest(req: Pick<NextApiRequest, 'method' | 'headers'>): boolean {
  if (SAFE_METHODS.has((req.method || 'GET').toUpperCase())) return true;

  // 现代浏览器对每个请求都带 Sec-Fetch-Site，且页面脚本无法伪造
  const fetchSite = firstHeader(req.headers['sec-fetch-site']);
  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'none';

  // 旧浏览器：退回到 Origin / Referer 的主机比对
  const originHeader = firstHeader(req.headers.origin) ?? firstHeader(req.headers.referer);
  if (!originHeader) return true; // 非浏览器客户端，不构成 CSRF
  if (originHeader === 'null') return false;

  try {
    return allowedHosts(req).has(new URL(originHeader).host.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * 包装 Next API 处理函数：拒绝跨站发起的状态修改请求
 */
export function withCsrfProtection<T>(
  handler: (req: NextApiRequest, res: NextApiResponse) => T | Promise<T>,
) {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<T | void> => {
    if (!isSameOriginRequest(req)) {
      res.status(403).json({
        success: false,
        error: { message: 'Cross-site request blocked', code: 'CSRF_BLOCKED' },
      });
      return;
    }
    return handler(req, res);
  };
}

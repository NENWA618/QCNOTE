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

/**
 * 前端代理 → 后端：为转发的客户端 IP 签名，供后端按 IP 限流时采信。
 *
 * 与上面的内部令牌刻意分开：代理会给每个浏览器请求都带上它，所以它只能证明
 * “这个 IP 是前端看到的”，不能授权任何服务间接口；签名绑定 IP 本身，泄露一个
 * 也无法冒充别的 IP。
 */
export const CLIENT_IP_HEADER = 'x-qcnote-client-ip';
export const CLIENT_IP_SIGNATURE_HEADER = 'x-qcnote-client-ip-sig';

export function signClientIp(ip: string, secret: string | undefined): string | null {
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(`qcnote:client-ip:v1|${ip}`).digest('hex');
}

export function isValidClientIpSignature(
  ip: unknown,
  signature: unknown,
  secret: string | undefined,
): boolean {
  if (typeof ip !== 'string' || typeof signature !== 'string') return false;
  const expected = signClientIp(ip, secret);
  if (!expected) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

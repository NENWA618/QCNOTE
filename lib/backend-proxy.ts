import { NextApiRequest, NextApiResponse } from 'next';
import { createErrorResponse } from './api-utils';
import { CLIENT_IP_HEADER, CLIENT_IP_SIGNATURE_HEADER, signClientIp } from './internalAuth';

/**
 * 前端前面有几层反向代理，与后端的 TRUST_PROXY_HOPS 同义，但描述的是前端自己的部署。
 * 未设置时：在 Vercel 上为 1（Vercel 会用真实客户端地址覆盖 X-Forwarded-For，不保留调用方
 * 自带的值），其他环境为 0，只认直连地址。宁少勿多：设多了会采信调用方伪造的 IP。
 */
function frontendTrustProxyHops(): number {
  const configured = process.env.FRONTEND_TRUST_PROXY_HOPS;
  if (configured !== undefined && configured !== '') {
    const hops = Number(configured);
    return Number.isInteger(hops) && hops >= 0 ? hops : 0;
  }
  return process.env.VERCEL ? 1 : 0;
}

/**
 * 客户端 IP：从直连地址开始，沿 X-Forwarded-For 从右往左，跳过受信任的代理。
 * 右边的条目是我们自己的代理追加的，最左边的是调用方自己写的，不能直接采信。
 * 与后端 Fastify 的 trustProxy（hop < TRUST_PROXY_HOPS）取到的是同一个地址。
 */
export function clientIpFor(req: Pick<NextApiRequest, 'headers' | 'socket'>): string | undefined {
  const forwardedFor = req.headers['x-forwarded-for'];
  const entries = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? ''))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  // 离前端最近的在前：直连地址，然后是 X-Forwarded-For 从右往左
  const chain = [req.socket?.remoteAddress, ...entries.reverse()];
  const hops = Math.min(frontendTrustProxyHops(), chain.length - 1);
  return chain[hops] || undefined;
}

/**
 * 转发给后端的通用请求头：会话凭证 + 客户端 IP。
 *
 * 后端看到的连接方永远是这台前端服务器，不带客户端 IP 的话按 IP 的限流会把所有用户
 * 算成同一个。只转发一个值（见 clientIpFor），不把调用方自带的整条 X-Forwarded-For
 * 链原样透传。
 *
 * 客户端 IP 放在单独的请求头里并附上签名：后端只在签名有效时采信它。否则任何人
 * 直接访问后端、自带一个 X-Forwarded-For，就能冒充任意 IP 绕过限流。
 */
export function forwardedHeaders(
  req: Pick<NextApiRequest, 'headers' | 'socket'>,
): Record<string, string> {
  const clientIp = clientIpFor(req);
  const signature = clientIp ? signClientIp(clientIp, process.env.NEXTAUTH_SECRET) : null;
  return {
    ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
    ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
    ...(clientIp && signature
      ? { [CLIENT_IP_HEADER]: clientIp, [CLIENT_IP_SIGNATURE_HEADER]: signature }
      : {}),
  };
}

interface ProxyOptions {
  extraHeaders?: Record<string, string>;
  preserveQuery?: boolean;
  /** Sent instead of req.body, so a route can forward only the fields it validated. */
  body?: unknown;
}

/** BACKEND_URL joined with `backendPath`, or null when no backend is configured. */
export function backendUrlFor(backendPath: string): URL | null {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) return null;
  return new URL(`${backendUrl.replace(/\/+$/, '')}${backendPath}`);
}

const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'cache-control',
  'etag',
  'x-request-id',
];

/**
 * Sends the request to `targetUrl` and relays the backend's status, selected
 * headers and body. Throws if the backend can't be reached.
 */
export async function relayToBackend(
  req: NextApiRequest,
  res: NextApiResponse,
  targetUrl: URL,
  options: ProxyOptions = {},
) {
  if (options.preserveQuery !== false && req.url?.includes('?')) {
    targetUrl.search = req.url.substring(req.url.indexOf('?') + 1);
  }

  const fetchOptions: RequestInit = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      ...forwardedHeaders(req),
      ...options.extraHeaders,
    },
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = 'body' in options ? options.body : req.body;
    if (body !== undefined && body !== null) {
      fetchOptions.body = JSON.stringify(body);
    }
  }

  const response = await fetch(targetUrl.toString(), fetchOptions);
  const responseData = await response.text();

  FORWARDED_RESPONSE_HEADERS.forEach((header) => {
    const value = response.headers.get(header);
    if (value) {
      res.setHeader(header, value);
    }
  });

  res.status(response.status);

  try {
    const jsonData = JSON.parse(responseData);
    return res.json(jsonData);
  } catch {
    return res.send(responseData);
  }
}

export async function proxyToBackend(
  req: NextApiRequest,
  res: NextApiResponse,
  backendPath: string,
  options: ProxyOptions = {},
) {
  const targetUrl = backendUrlFor(backendPath);
  if (!targetUrl) {
    return res.status(503).json(
      createErrorResponse('Backend service unavailable', 'BACKEND_URL_NOT_CONFIGURED', {
        message: 'BACKEND_URL environment variable is not set',
      }),
    );
  }

  try {
    return await relayToBackend(req, res, targetUrl, options);
  } catch (error) {
    // 错误详情只进服务端日志：里面可能带有内部后端地址
    console.error('[Backend Proxy] Error:', error);
    return res.status(502).json(createErrorResponse('Bad Gateway', 'BACKEND_PROXY_ERROR'));
  }
}

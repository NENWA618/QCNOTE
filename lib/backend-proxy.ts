import { NextApiRequest, NextApiResponse } from 'next';
import { createErrorResponse } from './api-utils';
import { CLIENT_IP_HEADER, CLIENT_IP_SIGNATURE_HEADER, signClientIp } from './internalAuth';

/**
 * 转发给后端的通用请求头：会话凭证 + 客户端 IP。
 *
 * 后端看到的连接方永远是这台前端服务器，不带客户端 IP 的话按 IP 的限流会把所有用户
 * 算成同一个。只转发一个值（平台代理已设置则取其最左项，否则用直连地址），
 * 不把调用方自带的整条 X-Forwarded-For 链原样透传。
 *
 * 客户端 IP 放在单独的请求头里并附上签名：后端只在签名有效时采信它。否则任何人
 * 直接访问后端、自带一个 X-Forwarded-For，就能冒充任意 IP 绕过限流。
 */
export function forwardedHeaders(
  req: Pick<NextApiRequest, 'headers' | 'socket'>,
): Record<string, string> {
  const forwardedFor = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
    ?.split(',')[0]
    ?.trim();
  const clientIp = first || req.socket?.remoteAddress;
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
}

export async function proxyToBackend(
  req: NextApiRequest,
  res: NextApiResponse,
  backendPath: string,
  options: ProxyOptions = {},
) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return res.status(503).json(
      createErrorResponse('Backend service unavailable', 'BACKEND_URL_NOT_CONFIGURED', {
        message: 'BACKEND_URL environment variable is not set',
      }),
    );
  }

  const targetUrl = new URL(`${backendUrl}${backendPath}`);

  if (options.preserveQuery !== false && req.url?.includes('?')) {
    const search = req.url.substring(req.url.indexOf('?') + 1);
    targetUrl.search = search;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...forwardedHeaders(req),
    ...options.extraHeaders,
  };

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.body !== undefined && req.body !== null) {
      fetchOptions.body = JSON.stringify(req.body);
    }
  }

  try {
    const response = await fetch(targetUrl.toString(), fetchOptions);
    const responseData = await response.text();

    const headersToForward = [
      'content-type',
      'content-length',
      'cache-control',
      'etag',
      'x-request-id',
    ];
    headersToForward.forEach((header) => {
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
  } catch (error) {
    // 错误详情只进服务端日志：里面可能带有内部后端地址
    console.error('[Backend Proxy] Error:', error);
    return res.status(502).json(createErrorResponse('Bad Gateway', 'BACKEND_PROXY_ERROR'));
  }
}

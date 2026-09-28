import { NextApiRequest, NextApiResponse } from 'next';
import { createErrorResponse } from './api-utils';

/**
 * 转发给后端的通用请求头：会话凭证 + 客户端 IP。
 *
 * 后端看到的连接方永远是这台前端服务器，不带客户端 IP 的话按 IP 的限流会把所有用户
 * 算成同一个。只转发一个值（平台代理已设置则取其最左项，否则用直连地址），
 * 不把调用方自带的整条 X-Forwarded-For 链原样透传。
 */
export function forwardedHeaders(
  req: Pick<NextApiRequest, 'headers' | 'socket'>,
): Record<string, string> {
  const forwardedFor = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
    ?.split(',')[0]
    ?.trim();
  const clientIp = first || req.socket?.remoteAddress;
  return {
    ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
    ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
    ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
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

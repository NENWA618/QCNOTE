import { NextApiRequest, NextApiResponse } from 'next';
import { createErrorResponse } from './api-utils';

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
    ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
    ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
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
    console.error('[Backend Proxy] Error:', error);
    return res.status(502).json(
      createErrorResponse('Bad Gateway', 'BACKEND_PROXY_ERROR', {
        message: error instanceof Error ? error.message : 'Failed to proxy request',
      }),
    );
  }
}

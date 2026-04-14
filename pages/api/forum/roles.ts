import { NextApiRequest, NextApiResponse } from 'next';
import { withErrorHandler, createErrorResponse } from '../../../lib/api-utils';

/**
 * 代理路由：转发 /api/forum/roles 请求到后端
 *
 * 注意：此路由不能在前端处理数据库查询，必须转发到后端
 * 前端（Vercel）无法访问后端数据库
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const backendUrl = process.env.BACKEND_URL;

  if (!backendUrl) {
    console.warn('[Forum Roles Proxy] BACKEND_URL not configured');
    return res.status(503).json(createErrorResponse('Backend service unavailable', 'BACKEND_UNAVAILABLE', {
      message: 'BACKEND_URL environment variable is not set'
    }));
  }

  // 构建后端 URL
  const targetUrl = new URL(`${backendUrl}/api/forum/roles`);

  // 转发查询参数
  if (req.url?.includes('?')) {
    const queryString = req.url.substring(req.url.indexOf('?'));
    targetUrl.search = queryString;
  }

  console.log(`[Forum Roles] ${req.method} ${req.url} -> ${targetUrl.toString()}`);

  // 准备转发请求
  const fetchOptions: RequestInit = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      ...(req.headers.authorization && {
        authorization: req.headers.authorization
      }),
      ...(req.headers.cookie && {
        cookie: req.headers.cookie
      }),
    },
  };

  // 转发请求体
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    fetchOptions.body = JSON.stringify(req.body);
  }

  // 发送请求到后端
  const response = await fetch(targetUrl.toString(), fetchOptions);
  const responseData = await response.text();

  // 转发响应头
  const headersToForward = [
    'content-type',
    'content-length',
    'cache-control',
    'etag',
  ];

  headersToForward.forEach(header => {
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

export default withErrorHandler(handler);
import { forwardedHeaders } from '../../../lib/backend-proxy';
import { withCsrfProtection } from '../../../lib/csrfProtection';
import { NextApiRequest, NextApiResponse } from 'next';

/**
 * API 代理路由 - 转发请求到 Render 后端
 *
 * 路径转换：
 * /api/proxy/ugc/user/init -> BACKEND_URL/api/ugc/user/init
 * /api/proxy/admin/roles -> BACKEND_URL/api/admin/roles
 */

const ALLOWED_PREFIXES = ['ugc', 'admin'];
const ALLOWED_METHODS = ['GET', 'POST', 'PUT'];

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const backendUrl = process.env.BACKEND_URL;

  // 后端地址未配置
  if (!backendUrl) {
    console.warn('[Proxy] BACKEND_URL not configured, returning 503');
    return res.status(503).json({ error: 'Backend service unavailable' });
  }

  try {
    const { path = [] } = req.query;
    const segments = Array.isArray(path) ? path : [path];

    // 只转发前端实际使用的业务路由，并拒绝路径穿越（.. / 编码分隔符），
    // 避免代理被用来访问后端上任意其他路由
    const isSafeSegment = (segment: string) =>
      segment.length > 0 && segment !== '.' && segment !== '..' && !/[\\/%?#]/.test(segment);
    if (
      segments.length === 0 ||
      !segments.every(isSafeSegment) ||
      !ALLOWED_PREFIXES.includes(segments[0])
    ) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!ALLOWED_METHODS.includes(req.method ?? '')) {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const pathStr = segments.join('/');

    // 构建完整的后端 URL
    // 前端调用 /api/proxy/ugc/models/market
    // 代理转发到 BACKEND_URL/api/ugc/models/market
    const targetUrl = new URL(`${backendUrl}/api/${pathStr}`);

    // 移除代理路径前缀后的查询参数
    if (req.url?.includes('?')) {
      const queryString = req.url.substring(req.url.indexOf('?'));
      targetUrl.search = queryString;
    }

    // 只记录路径：查询串里可能带有用户标识等敏感信息
    console.log(`[Proxy] ${req.method} /api/${pathStr}`);

    // 准备转发请求的选项
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        // 保留会话凭证并带上客户端 IP（后端按 IP 限流）
        ...forwardedHeaders(req),
      },
    };

    // 如果有请求体，添加到转发请求中
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body) {
        // 如果是 FormData，不能直接序列化，需要特殊处理
        if (req.headers['content-type']?.includes('multipart/form-data')) {
          // FormData 从前端发出时已经被 axios 处理，这里直接转发原始 body
          fetchOptions.body = JSON.stringify(req.body);
        } else {
          fetchOptions.body = JSON.stringify(req.body);
        }
      }
    }

    // 发送请求到后端
    const response = await fetch(targetUrl.toString(), fetchOptions);
    const responseData = await response.text();

    // 转发响应头（选择性）
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

    // 返回后端响应
    res.status(response.status);

    // 尝试解析为 JSON，如果失败则当作文本返回
    try {
      const jsonData = JSON.parse(responseData);
      return res.json(jsonData);
    } catch {
      return res.send(responseData);
    }
  } catch (error) {
    // 错误详情只进服务端日志：里面可能带有内部后端地址
    console.error('[Proxy] Error:', error);
    res.status(502).json({ error: 'Bad Gateway' });
  }
}

export default withCsrfProtection(handler);

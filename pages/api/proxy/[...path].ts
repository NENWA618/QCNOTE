import { backendUrlFor, relayToBackend } from '../../../lib/backend-proxy';
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
  // 这里的错误响应保持 { error: string }：调用方直接把 data.error 当文字显示
  if (!process.env.BACKEND_URL) {
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

    // 只记录路径：查询串里可能带有用户标识等敏感信息
    console.log(`[Proxy] ${req.method} /api/${pathStr}`);

    // 前端调用 /api/proxy/ugc/models/market → BACKEND_URL/api/ugc/models/market
    return await relayToBackend(req, res, backendUrlFor(`/api/${pathStr}`)!);
  } catch (error) {
    // 错误详情只进服务端日志：里面可能带有内部后端地址
    console.error('[Proxy] Error:', error);
    res.status(502).json({ error: 'Bad Gateway' });
  }
}

export default withCsrfProtection(handler);

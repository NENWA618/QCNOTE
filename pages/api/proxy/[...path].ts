import { NextApiRequest, NextApiResponse } from 'next';

/**
 * API 代理路由 - 转发请求到 Render 后端
 *  
 * 路径转换：
 * /api/proxy/forum/posts -> BACKEND_URL/api/forum/posts
 * /api/proxy/ugc/user/credit -> BACKEND_URL/api/ugc/user/credit
 */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const backendUrl = process.env.BACKEND_URL;
  
  // 后端地址未配置
  if (!backendUrl) {
    console.warn('[Proxy] BACKEND_URL not configured, returning 503');
    return res.status(503).json({ 
      error: 'Backend service unavailable',
      message: 'BACKEND_URL environment variable is not set'
    });
  }

  try {
    const { path = [] } = req.query;
    const pathStr = Array.isArray(path) ? path.join('/') : path || '';
    
    // 构建完整的后端 URL
    // 前端调用 /api/proxy/ugc/models/market
    // 代理转发到 BACKEND_URL/api/ugc/models/market
    const targetUrl = new URL(`${backendUrl}/api/${pathStr}`);
    
    // 移除代理路径前缀后的查询参数
    if (req.url?.includes('?')) {
      const queryString = req.url.substring(req.url.indexOf('?'));
      targetUrl.search = queryString;
    }

    console.log(`[Proxy] ${req.method} ${req.url} -> ${targetUrl.toString()}`);

    // 准备转发请求的选项
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        // 保留某些关键请求头
        ...(req.headers.authorization && { 
          authorization: req.headers.authorization 
        }),
        ...(req.headers.cookie && { 
          cookie: req.headers.cookie 
        }),
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
      'x-request-id'
    ];

    headersToForward.forEach(header => {
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
    console.error('[Proxy] Error:', error);
    res.status(502).json({ 
      error: 'Bad Gateway',
      message: error instanceof Error ? error.message : 'Failed to proxy request'
    });
  }
}

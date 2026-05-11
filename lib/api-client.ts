/**
 * API 客户端工具 - 统一前后端 API 调用地址
 * 
 * 策略：前端调用的 UGC/论坛 API 通过 Vercel 代理路由转发到 Render 后端
 * 
 * 路径转换：
 * /api/ugc/* -> /api/proxy/ugc/*
 * /api/forum/* -> /api/proxy/forum/*
 * 
 * 代理路由 (pages/api/proxy/[...path].ts) 负责：
 * 1. 读取 BACKEND_URL 环境变量
 * 2. 转发请求到 Render 后端
 * 3. 返回响应給前端
 */

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // 需要代理的路由前缀（UGC、论坛等业务模块）
  const proxyPrefixes = ['/api/ugc/', '/api/forum/'];
  
  const shouldProxy = proxyPrefixes.some(prefix => 
    normalizedPath.startsWith(prefix)
  );

  // 如果是需要代理的路由，转换为 /api/proxy/* 格式
  if (shouldProxy) {
    // 移除 /api 前缀，然后添加 /api/proxy 前缀
    return `/api/proxy${normalizedPath.substring(4)}`;
  }
  
  // 其他 API 路由（如 NextAuth）直接使用
  return normalizedPath;
}

/**
 * 便捷函数
 */
export function withApiBaseUrl(path: string): string {
  return buildApiUrl(path);
}

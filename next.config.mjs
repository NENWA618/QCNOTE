import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  productionBrowserSourceMaps: process.env.ENABLE_SOURCE_MAPS === 'true',
  
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-eval' 仅在开发环境保留：Next.js dev 模式的 webpack HMR/react-refresh 依赖 eval。
              // 生产构建不再需要（原先是为 Live2D/jQuery UI 脚本开的口子，Live2D 已移除）。
              // 'blob:' 和 'wasm-unsafe-eval' 是语义搜索用的 onnxruntime-web（WASM 推理运行时）需要的：
              // 它把 WASM 胶水代码包成 blob: URL 当脚本加载，且 WebAssembly.instantiate 在该实现下
              // 需要显式的 wasm-unsafe-eval 授权（这个指令只放开 WASM 编译，不等同于放开 'unsafe-eval'
              // 那样允许任意 eval/Function 字符串求值，攻击面小得多）。这段代码是我们自己打包进来的，不是外部输入。
              `script-src 'self' blob: 'wasm-unsafe-eval'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''} https://vercel.live https://*.vercel.live`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              // 'https:' 允许连接到 /models 页面里用户自行配置的任意 AI 服务地址
              // （浏览器直接调用，不经过 QCNOTE 后端，所以无法预先把域名加入白名单），
              // 已覆盖 lwl12.com/jinrishici.com/hitokoto.cn/vercel.live 等原先单独列出的域名。
              "connect-src 'self' https:",
              "frame-src 'self' https://vercel.live https://*.vercel.live",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        source: '/api/health',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=5',
          },
        ],
      },
    ];
  },

  // CSRF protection middleware
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    };
  },

  // Use project root explicitly and TypeScript config path to avoid incorrect root detection
  outputFileTracingRoot: __dirname,
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  // Disable X-Powered-By header
  poweredByHeader: false,
};

export default nextConfig;

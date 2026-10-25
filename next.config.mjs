import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vercel 预览部署的评论工具（Vercel Toolbar）从 vercel.live 加载脚本和 iframe。
// 只在预览部署里放行：生产和自托管用不到它，多一个外部脚本来源只会扩大 XSS 的攻击面。
// VERCEL_ENV 由 Vercel 在构建时注入（production / preview / development）。
const VERCEL_LIVE =
  process.env.VERCEL_ENV === 'preview' ? ' https://vercel.live https://*.vercel.live' : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 每次部署一个 ID：静态资源 URL 带 ?dpl=，浏览器和 Service Worker 不会拿旧缓存冒充新文件；
  // 页面发现部署已更新时整页刷新，而不是新旧代码混跑（例如新页面配上旧的存储 Worker）。
  // VERCEL_DEPLOYMENT_ID 由 Vercel 在构建时注入；自托管不设置则保持原行为。
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || undefined,
  reactStrictMode: true,
  compress: true,
  productionBrowserSourceMaps: process.env.ENABLE_SOURCE_MAPS === 'true',

  experimental: {
    // Next 16.4 默认开启共享运行时，会把 chunk 启动代码 globalThis["TURBOPACK"].push(...) 以内联 <script>
    // 写进 HTML。生产 CSP 的 script-src 没有 'unsafe-inline'，这段脚本被拦截后页面永远停在加载界面；
    // 而且它不带 nonce、内容随路由和构建变化，nonce/hash 都放不行。关掉后启动代码回到外链 chunk。
    // 见 https://github.com/vercel/next.js/issues/99799
    turbopackSharedRuntime: false,
  },

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
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), browsing-topics=()',
          },
          {
            // 隔离浏览上下文：跨站打开的窗口拿不到 window.opener。登录走整页重定向，不依赖弹窗
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
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
              `script-src 'self' blob: 'wasm-unsafe-eval'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''}${VERCEL_LIVE}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              // 'https:' 允许连接到 /models 页面里用户自行配置的任意 AI 服务地址
              // （浏览器直接调用，不经过 QCNOTE 后端，所以无法预先把域名加入白名单），
              // 已覆盖 lwl12.com/jinrishici.com/hitokoto.cn/vercel.live 等原先单独列出的域名。
              "connect-src 'self' https:",
              // 站内没有 iframe；只有预览部署要嵌 Vercel Toolbar
              `frame-src ${VERCEL_LIVE ? VERCEL_LIVE.trim() : "'none'"}`,
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              'upgrade-insecure-requests',
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        // 浏览器更新 SW 时必须能拿到最新脚本，不能被 HTTP 缓存挡住
        source: '/service-worker.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
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
      // TWA 的 Digital Asset Links，指纹来自环境变量，见 lib/assetLinks.ts
      beforeFiles: [{ source: '/.well-known/assetlinks.json', destination: '/api/assetlinks' }],
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

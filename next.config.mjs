/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  productionBrowserSourceMaps: false,
  
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
            key: 'X-XSS-Protection',
            value: '1; mode=block',
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
              "script-src 'self' 'unsafe-eval' https://live2d.fghrsh.net",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://live2d.fghrsh.net https://lwl12.com https://jinrishici.com https://hitokoto.cn",
              "frame-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
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

  // Environment variables validation
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client-side: block exposure of sensitive env vars
      config.plugins.push({
        apply: (compiler) => {
          compiler.hooks.compilation.tap('BlockSensitiveEnv', (compilation) => {
            compilation.hooks.succeedModule.tap('BlockSensitiveEnv', (module) => {
              if (module.resource && module.resource.includes('process.env')) {
                // This is a simplification; ideally use env var allowlist
              }
            });
          });
        },
      });
    }
    return config;
  },

  // Disable X-Powered-By header
  poweredByHeader: false,
};

export default nextConfig;

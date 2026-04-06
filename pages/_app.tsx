import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import Script from 'next/script';
import '../styles/globals.css';
import { Inter } from 'next/font/google';
import { initWindowStorage } from '../lib/storage';
import ErrorBoundary from '../components/ErrorBoundary';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export default function App({ Component, pageProps }: AppProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 获取或创建全局 storage 实例（单例）
    if (typeof window === 'undefined') return;

    const storage = initWindowStorage();

    // 启用 IndexedDB 并迁移数据；等待结果再展示页面
    (async () => {
      const success = await storage?.enableIndexedDB();
      if (success) {
        if (process.env.NODE_ENV !== 'production') console.log('✓ IndexedDB 已启用，数据迁移成功');
      } else {
        if (process.env.NODE_ENV !== 'production') console.log('⚠ IndexedDB 启用失败，继续使用 localStorage');
      }
      setReady(true);
    })();
  }, []);

  return (
    <>
      {/* Load Cubism 2 runtime for koharu Live2D model.
          add a version query parameter to bust client cache after
          each deployment; the value can be explicit via
          NEXT_PUBLIC_LIVE2D_VERSION or defaults to build timestamp. */}
      <Script
        src={ "/js/jquery.min.js" }
        strategy="afterInteractive"
        onError={(e) => console.error('jquery 加载失败', e)}
      />
      <Script
        src={ "/js/jquery-ui.min.js" }
        strategy="afterInteractive"
        onError={(e) => console.error('jquery-ui 加载失败', e)}
      />
      <Script
        src={ "/js/live2d.min.js" }
        strategy="lazyOnload"
        onError={(e) => console.error('live2d 加载失败', e)}
      />
      <Script
        src={ "/js/waifu-tips.min.js" }
        strategy="lazyOnload"
        onError={(e) => console.error('waifu-tips 加载失败', e)}
      />
      <Script
        src={ "/js/waifu.js" }
        strategy="lazyOnload"
        onError={(e) => console.error('waifu 脚本加载失败', e)}
      />
      {!ready ? (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-dark via-primary to-accent-pink">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
            <div className="text-white text-xl font-semibold mb-2">QCNOTE</div>
            <div className="text-white/80 text-sm">正在初始化您的个人笔记空间...</div>
            <div className="mt-4 text-white/60 text-xs">加载 IndexedDB 存储系统</div>
          </div>
        </div>
      ) : (
        <ErrorBoundary>
          <main className={inter.className}>
            <Component {...pageProps} />
          </main>
        </ErrorBoundary>
      )}
    </>
  );
}

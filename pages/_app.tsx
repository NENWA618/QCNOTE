import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { SessionProvider } from 'next-auth/react';
import '../styles/globals.css';
import { Inter } from 'next/font/google';
import { setupGlobalErrorHandlers } from '../lib/errorHandler';
import ErrorBoundary from '../components/ErrorBoundary';
// 推送订阅提示只在客户端需要，延迟加载以缩小首屏 JS。
const PushNotificationPrompt = dynamic(() => import('../components/PushNotificationPrompt'), {
  ssr: false,
});

const inter = Inter({ subsets: ['latin'], display: 'swap' });

// 只有直接读写笔记存储的页面才需要等 IndexedDB 迁移完成；
// 其它页面（首页、隐私政策等）立即渲染，避免整页 SSR 内容被加载动画替代而拖慢 FCP/LCP。
const STORAGE_ROUTES = new Set(['/dashboard', '/models']);

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [storageReady, setReady] = useState(false);
  const ready = storageReady || !STORAGE_ROUTES.has(router.pathname);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setupGlobalErrorHandlers();

    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    if (!STORAGE_ROUTES.has(router.pathname)) return;

    // 存储层（含 lunr 等）体积较大，仅在需要它的页面才加载。
    let cancelled = false;
    (async () => {
      const { initWindowStorage } = await import('../lib/storage');
      const storage = initWindowStorage();
      const success = await storage?.enableIndexedDB();
      if (success) {
        if (process.env.NODE_ENV !== 'production') console.log('✓ IndexedDB 已启用，数据迁移成功');
      } else {
        if (process.env.NODE_ENV !== 'production')
          console.log('⚠ IndexedDB 启用失败，继续使用 localStorage');
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router.pathname]);

  useEffect(() => {
    const handleStorageFallback = async (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      if (detail?.message) {
        const { showNotification } = await import('../lib/ui');
        showNotification(detail.message, 5000);
      }
    };

    window.addEventListener('qcnote:storage-fallback', handleStorageFallback);

    return () => {
      window.removeEventListener('qcnote:storage-fallback', handleStorageFallback);
    };
  }, []);

  return (
    <>
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
          <SessionProvider session={pageProps.session}>
            <main className={inter.className}>
              <Component {...pageProps} />
              <PushNotificationPrompt />
            </main>
          </SessionProvider>
        </ErrorBoundary>
      )}
    </>
  );
}

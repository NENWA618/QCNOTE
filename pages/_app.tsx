import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { SessionProvider } from 'next-auth/react';
import '../styles/globals.css';
import { Inter } from 'next/font/google';
import { setupGlobalErrorHandlers } from '../lib/errorHandler';
import ErrorBoundary from '../components/ErrorBoundary';
import AppLoader from '../components/AppLoader';
// 推送订阅提示只在客户端需要，延迟加载以缩小首屏 JS。
const PushNotificationPrompt = dynamic(() => import('../components/PushNotificationPrompt'), {
  ssr: false,
});

const inter = Inter({ subsets: ['latin'], display: 'swap' });

// 只有直接读写笔记存储的页面才需要等存储初始化完成；
// 其它页面（首页、隐私政策等）立即渲染，避免整页 SSR 内容被加载动画替代而拖慢 FCP/LCP。
const STORAGE_ROUTES = new Set(['/dashboard', '/models']);
// 超过这个时间还没就绪，就告诉用户可能的原因并给出“重新加载”，而不是一直转圈
const SLOW_INIT_MS = 8000;

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [storageReady, setReady] = useState(false);
  const [initSlow, setInitSlow] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
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
    // 加载界面在首次绘制时跟随系统深浅色；用户明确选了浅色时靠它关掉跟随
    document.documentElement.dataset.theme = shouldBeDark ? 'dark' : 'light';
  }, []);

  useEffect(() => {
    if (!STORAGE_ROUTES.has(router.pathname)) return;

    // 存储层（含 lunr 等）体积较大，仅在需要它的页面才加载。
    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setInitSlow(true);
    }, SLOW_INIT_MS);
    (async () => {
      let storageModule: typeof import('../lib/storage');
      try {
        storageModule = await import('../lib/storage');
      } catch (err) {
        // 拿不到存储模块就没法读写笔记，只能提示重新加载（原来这里抛错后会永远停在加载界面）
        console.error('Failed to load storage module:', err);
        if (!cancelled) setInitError('加载存储模块失败，可能是网络中断或刚刚发布了新版本。');
        return;
      }
      try {
        const storage = storageModule.initWindowStorage();
        const success = await storage?.enableIndexedDB();
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            success ? '✓ IndexedDB 已启用' : '⚠ IndexedDB 启用失败，继续使用 localStorage',
          );
        }
      } catch (err) {
        // enableIndexedDB 失败时存储会继续用 localStorage，页面照常可用
        console.warn('IndexedDB init failed, falling back to localStorage:', err);
      }
      if (!cancelled) setReady(true);
    })().finally(() => window.clearTimeout(slowTimer));
    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, [router.pathname]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch((err) => {
        console.warn('Service Worker 注册失败:', err);
      });
    } else {
      // 开发环境的 chunk 没有内容哈希，缓存会导致拿到旧代码；清掉之前可能注册过的 SW。
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()));
    }
  }, []);

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
        <AppLoader state={initError ? 'error' : initSlow ? 'slow' : 'loading'} error={initError} />
      ) : (
        <ErrorBoundary>
          <SessionProvider session={pageProps.session}>
            <div className={inter.className}>
              <Component {...pageProps} />
              <PushNotificationPrompt />
            </div>
          </SessionProvider>
        </ErrorBoundary>
      )}
    </>
  );
}

import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { SessionProvider } from 'next-auth/react';
import '../styles/globals.css';
import 'katex/dist/katex.min.css';
import { Inter } from 'next/font/google';
import { initWindowStorage } from '../lib/storage';
import { showNotification } from '../lib/ui';
import { setupGlobalErrorHandlers } from '../lib/errorHandler';
import ErrorBoundary from '../components/ErrorBoundary';
import PushNotificationPrompt from '../components/PushNotificationPrompt';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

const noLive2DRoutes = [
  '/',
  '/admin',
  '/contact',
  '/diejie',
  '/leaderboard',
  '/models',
  '/privacy',
  '/signin',
  '/terms',
];

const LIVE2D_SCRIPTS = [
  '/js/jquery.min.js',
  '/js/jquery-ui.min.js',
  '/js/live2d.min.js',
  '/js/waifu-tips.min.js',
  '/js/waifu.js',
];

const shouldLoadLive2dForPath = (path: string) => {
  return (
    typeof window !== 'undefined' && !noLive2DRoutes.includes(path) && !path.startsWith('/api')
  );
};

const isScriptPresent = (src: string) => Boolean(document.querySelector(`script[src="${src}"]`));

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    if (isScriptPresent(src)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.body.appendChild(s);
  });

const loadLive2d = async () => {
  try {
    for (const src of LIVE2D_SCRIPTS) {
      await loadScript(src);
    }
  } catch (e) {
    console.error('加载 Live2D 脚本出错', e);
  }
};

const removeLive2d = () => {
  try {
    const selectors = ['.waifu', '.waifu-tips', '#live2d', '.waifu-loading', '.waifu-tool'];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    });

    const win = window as Window & {
      jQuery?: any;
      live2d?: unknown;
      waifu?: unknown;
    };

    if (win.jQuery) {
      try {
        const $ = win.jQuery;
        $(document).off('mouseover', '.waifu #live2d');
        $(document).off('click', '.waifu #live2d');
        $('.waifu').off();
        $('.waifu-tips').off();
      } catch (err) {
        // ignore
      }
    }

    LIVE2D_SCRIPTS.forEach((src) => {
      const s = document.querySelector(`script[src="${src}"]`);
      if (s && s.parentNode) s.parentNode.removeChild(s);
    });

    if ('live2d' in win) {
      try {
        delete win.live2d;
      } catch (e) {
        // ignore
      }
    }
    if ('waifu' in win) {
      try {
        delete win.waifu;
      } catch (e) {
        // ignore
      }
    }
  } catch (err) {
    console.error('removeLive2d 错误', err);
  }
};

export default function App({ Component, pageProps }: AppProps) {
  const [ready, setReady] = useState(false);
  const router = useRouter();

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

    const storage = initWindowStorage();

    (async () => {
      const success = await storage?.enableIndexedDB();
      if (success) {
        if (process.env.NODE_ENV !== 'production') console.log('✓ IndexedDB 已启用，数据迁移成功');
      } else {
        if (process.env.NODE_ENV !== 'production')
          console.log('⚠ IndexedDB 启用失败，继续使用 localStorage');
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const handleStorageFallback = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      if (detail?.message) {
        showNotification(detail.message, 5000);
      }
    };

    window.addEventListener('qcnote:storage-fallback', handleStorageFallback);

    return () => {
      window.removeEventListener('qcnote:storage-fallback', handleStorageFallback);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const shouldLoad = shouldLoadLive2dForPath(router.pathname);

    if (shouldLoad) {
      loadLive2d();
    } else {
      removeLive2d();
    }

    return () => {
      if (!shouldLoadLive2dForPath(window.location.pathname)) removeLive2d();
    };
  }, [router.pathname]);

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

import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import '../styles/globals.css';
import { Inter } from 'next/font/google';
import { initWindowStorage } from '../lib/storage';

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

  if (!ready) {
    // 简易 loading 屏幕，避免 UI 在 storage 未就绪时访问同步方法
    return <div className="min-h-screen flex items-center justify-center">加载中…</div>;
  }

  return (
    <main className={inter.className}>
      <Component {...pageProps} />
    </main>
  );
}

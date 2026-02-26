import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import '../styles/globals.css';
import { Inter } from 'next/font/google';
import { NoteStorage } from '../lib/storage';

const inter = Inter({ subsets: ['latin'], display: 'swap' });
const storage = new NoteStorage();

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // 启用 IndexedDB 并迁移数据
    storage.enableIndexedDB().then((success) => {
      if (success) {
        console.log('✓ IndexedDB 已启用，数据迁移成功');
      } else {
        console.log('⚠ IndexedDB 启用失败，继续使用 localStorage');
      }
    });
  }, []);

  return (
    <main className={inter.className}>
      <Component {...pageProps} />
    </main>
  );
}

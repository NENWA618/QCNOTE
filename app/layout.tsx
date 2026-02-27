"use client";

import '../styles/globals.css';
import { Inter } from 'next/font/google';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { initWindowStorage } from '../lib/storage';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'NOTE',
  description: '一个简洁而优雅的个人笔记应用',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storage = initWindowStorage();
    (async () => {
      await storage?.enableIndexedDB();
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center">加载中…</div>;
  }

  return (
    <html lang="zh">
      <body className={inter.className}>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}

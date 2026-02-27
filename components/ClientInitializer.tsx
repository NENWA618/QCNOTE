'use client';

import { useEffect, useState } from 'react';
import { initWindowStorage } from '../lib/storage';

export default function ClientInitializer({ children }: { children: React.ReactNode }) {
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

  return <>{children}</>;
}

import React from 'react';
import Link from 'next/link';
import VirtualSpace from '../components/VirtualSpace';
import { useSession } from 'next-auth/react';

type SessionUserWithId = {
  id?: string;
};

export default function SpacePage() {
  const { data: session } = useSession();
  const userId = (session?.user as SessionUserWithId | undefined)?.id;

  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">请先登录</h1>
          <Link href="/api/auth/signin" className="text-cyan-400 hover:underline">
            点击登录
          </Link>
        </div>
      </div>
    );
  }

  return <VirtualSpace userId={userId} />;
}

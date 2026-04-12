import React from 'react';
import CommunityHub from '../components/CommunityHub';
import { useSession } from 'next-auth/react';

export default function CommunityPage() {
  const { data: session } = useSession();

  if (!session?.user?.id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">请先登录</h1>
          <a href="/api/auth/signin" className="text-cyan-400 hover:underline">
            点击登录
          </a>
        </div>
      </div>
    );
  }

  return <CommunityHub />;
}

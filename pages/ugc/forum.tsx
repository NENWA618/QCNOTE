import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

type SessionUserWithId = {
  id?: string;
  name?: string;
  email?: string;
};

export default function ForumPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUserWithId | undefined;

  if (!user?.id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-dark-bg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary-dark dark:text-dark-text mb-4">请先登录</h1>
          <Link href="/api/auth/signin" className="btn btn-primary">
            点击登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg p-8">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-primary-dark dark:text-dark-text mb-4">💬 创意论坛</h1>
          <p className="text-text-light dark:text-dark-text-secondary">与创意者交流，分享想法</p>
          {/* 用户信息显示 */}
          <div className="mt-4 p-4 bg-primary-light dark:bg-dark-surface rounded-lg">
            <p className="text-primary-dark dark:text-dark-text">
              <span className="font-semibold">欢迎，{user.name || user.email}</span>
              <span className="ml-4 text-sm text-text-light dark:text-dark-text-secondary">
                身份：用户
              </span>
            </p>
          </div>
        </div>

        {/* 论坛内容占位符 */}
        <div className="card dark:bg-dark-surface dark:border-dark-border">
          <h2 className="text-2xl font-bold text-primary-dark dark:text-dark-text mb-4">论坛功能开发中</h2>
          <p className="text-text-light dark:text-dark-text-secondary mb-4">
            我们正在开发完整的论坛功能，包括：
          </p>
          <ul className="list-disc list-inside text-text-light dark:text-dark-text-secondary space-y-2">
            <li>主题讨论区</li>
            <li>用户交流</li>
            <li>创意分享</li>
            <li>管理员审核</li>
          </ul>
          <div className="mt-6">
            <Link href="/ugc/community" className="btn btn-primary">
              返回社区
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
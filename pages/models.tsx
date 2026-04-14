import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Models from '../components/Models';
import { useSession } from 'next-auth/react';

type SessionUserWithId = {
  id?: string;
};

export default function ModelsPage() {
  const { data: session } = useSession();
  const userId = (session?.user as SessionUserWithId | undefined)?.id;

  return (
    <>
      <Head>
        <title>Live2D 模型 - QCNOTE</title>
        <meta name="description" content="QCNOTE Live2D 模型市场和个人模型管理页面。购买、上传和切换你的虚拟模型。" />
      </Head>
      {!userId ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-4">请先登录</h1>
            <Link href="/api/auth/signin" className="text-cyan-400 hover:underline">
              点击登录
            </Link>
          </div>
        </div>
      ) : (
        <div className="min-h-screen bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 text-primary-dark dark:bg-dark-bg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Models userId={userId} />
          </div>
        </div>
      )}
    </>
  );
}

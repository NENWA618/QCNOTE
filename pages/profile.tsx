import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Profile from '../components/Profile';
import { useSession } from 'next-auth/react';
import Layout from '../components/Layout';

type SessionUserWithId = {
  id?: string;
};

export default function ProfilePage() {
  const { data: session } = useSession();
  const userId = (session?.user as SessionUserWithId | undefined)?.id;

  return (
    <>
      <Head>
        <title>个人主页 - QCNOTE</title>
        <meta name="description" content="编辑并展示你的 QCNOTE 个人主页。" />
      </Head>
      <Layout>
        {!userId ? (
          <div className="min-h-[calc(100vh-14rem)] flex items-center justify-center bg-gray-900 px-4">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white mb-4">请先登录</h1>
              <Link href="/api/auth/signin" className="text-cyan-400 hover:underline">
                点击登录
              </Link>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Profile userId={userId} />
          </div>
        )}
      </Layout>
    </>
  );
}

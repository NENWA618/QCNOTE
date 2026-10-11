import Head from 'next/head';
import Link from 'next/link';
import Profile, { ProfileSkeleton } from '../components/Profile';
import { useSession } from 'next-auth/react';
import Layout from '../components/Layout';

type SessionUserWithId = {
  id?: string;
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const userId = (session?.user as SessionUserWithId | undefined)?.id;

  return (
    <>
      <Head>
        <title>编辑个人资料 - QCNOTE</title>
        <meta name="description" content="编辑你的 QCNOTE 个人资料，并管理已公开的笔记。" />
      </Head>
      <Layout>
        {status === 'loading' ? (
          <div role="status">
            <span className="sr-only">加载中…</span>
            <ProfileSkeleton />
          </div>
        ) : !userId ? (
          <div className="min-h-[calc(100vh-14rem)] flex items-center justify-center px-4">
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-ink dark:text-white mb-3">
                请先登录
              </h1>
              <p className="text-text-light mb-6">登录后即可编辑个人资料、管理公开笔记</p>
              <Link href="/api/auth/signin" className="btn btn-primary">
                登录
              </Link>
            </div>
          </div>
        ) : (
          <Profile userId={userId} />
        )}
      </Layout>
    </>
  );
}

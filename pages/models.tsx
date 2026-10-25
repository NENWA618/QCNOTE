import Head from 'next/head';
import Link from 'next/link';
import AIModelSettings from '../components/Models';
import { useSession } from 'next-auth/react';
import Layout from '../components/Layout';

type SessionUserWithId = {
  id?: string;
};

export default function ModelsPage() {
  const { data: session, status } = useSession();
  const userId = (session?.user as SessionUserWithId | undefined)?.id;

  return (
    <>
      <Head>
        <title>AI 模型接入 - QCNOTE</title>
        <meta
          name="description"
          content="配置 QCNOTE 接入的外部 AI 服务，API Key 仅加密存储在本地。"
        />
      </Head>
      <Layout>
        {status === 'loading' ? (
          <div role="status" className="min-h-[50vh] flex items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-accent-pink" />
            <span className="sr-only">加载中…</span>
          </div>
        ) : !userId ? (
          <div className="min-h-[calc(100vh-14rem)] flex items-center justify-center px-4">
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-ink dark:text-white mb-3">
                请先登录
              </h1>
              <p className="text-text-light mb-6">登录后即可配置 AI 服务、用 AI 生成笔记</p>
              <Link href="/api/auth/signin" className="btn btn-primary">
                登录
              </Link>
            </div>
          </div>
        ) : (
          <AIModelSettings />
        )}
      </Layout>
    </>
  );
}

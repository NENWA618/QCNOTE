import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './api/auth/authConfig';
import { withApiBaseUrl } from '../lib/api-client';
import AdminPanel from '../components/AdminPanel';
import Layout from '../components/Layout';

interface AdminPageProps {
  userRole: string;
}

export default function AdminPage({ userRole }: AdminPageProps) {
  if (userRole !== 'admin') {
    return (
      <>
        <Head>
          <title>管理员面板 - QCNOTE</title>
          <meta
            name="description"
            content="QCNOTE管理员控制面板 - 管理系统用户、推送通知和公开笔记。仅限授权管理员访问。"
          />
        </Head>
        <Layout>
          <div className="min-h-[calc(100vh-14rem)] flex items-center justify-center px-4">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-ink dark:text-white mb-4">访问被拒绝</h1>
              <p className="text-text-light dark:text-dark-text-secondary mb-4">您没有管理员权限</p>
              <Link href="/" className="text-ink-pink hover:underline">
                返回首页
              </Link>
            </div>
          </div>
        </Layout>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>管理员面板 - QCNOTE</title>
        <meta
          name="description"
          content="QCNOTE管理员控制面板 - 管理系统用户、推送通知和公开笔记。仅限授权管理员访问。"
        />
      </Head>
      <Layout>
        <AdminPanel />
      </Layout>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session?.user) {
    return {
      redirect: {
        destination: '/api/auth/signin',
        permanent: false,
      },
    };
  }

  const userEmail = session.user.email;
  const userId = session.user.id;

  if (!userEmail && !userId) {
    return {
      props: {
        userRole: 'user',
      },
    };
  }

  try {
    const query = userEmail
      ? `email=${encodeURIComponent(userEmail)}`
      : `userId=${encodeURIComponent(userId!)}`;
    const rolePath = withApiBaseUrl(`/api/admin/roles?${query}`);
    const baseUrl = process.env.NEXTAUTH_URL || `http://${context.req.headers.host}`;
    const roleUrl = new URL(rolePath, baseUrl).toString();

    const response = await fetch(roleUrl, {
      method: 'GET',
      headers: {
        cookie: context.req.headers.cookie || '',
      },
    });
    if (!response.ok) {
      console.error('Failed to fetch user role during SSR:', response.status, response.statusText);
      return {
        props: {
          userRole: 'user',
        },
      };
    }

    const data = (await response.json()) as { role?: string } | null;
    return {
      props: {
        userRole: data?.role || 'user',
      },
    };
  } catch (error) {
    console.error('Get admin role error:', error);
    return {
      props: {
        userRole: 'user',
      },
    };
  }
};

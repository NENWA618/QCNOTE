import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './api/auth/authConfig';
import AdminPanel from '../components/AdminPanel';

interface AdminPageProps {
  userRole: string;
}

export default function AdminPage({ userRole }: AdminPageProps) {
  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 dark:bg-dark-bg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary-dark dark:text-white mb-4">访问被拒绝</h1>
          <p className="text-text-light dark:text-dark-text-secondary mb-4">您没有管理员权限</p>
          <Link href="/" className="text-accent-pink hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>管理员面板 - QCNOTE</title>
        <meta name="description" content="QCNOTE管理员控制面板 - 管理系统统计、用户管理和社区内容。仅限授权管理员访问。" />
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 dark:bg-dark-bg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AdminPanel />
        </div>
      </div>
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

  const sessionUser = session.user as any;
  const userEmail = sessionUser.email as string | undefined;

  if (!userEmail) {
    return {
      props: {
        userRole: 'user',
      },
    };
  }

  try {
    const baseUrl = process.env.NEXTAUTH_URL
      ? process.env.NEXTAUTH_URL
      : `http://${context.req.headers.host}`;
    const roleUrl = new URL(
      `/api/forum/roles?email=${encodeURIComponent(userEmail)}`,
      baseUrl
    ).toString();

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

    const data = await response.json();
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
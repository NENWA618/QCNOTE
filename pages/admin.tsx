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
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">访问被拒绝</h1>
          <p className="text-gray-400 mb-4">您没有管理员权限</p>
          <Link href="/" className="text-cyan-400 hover:underline">
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
        <meta name="description" content="QCNOTE 管理员控制面板" />
      </Head>
      <AdminPanel />
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

  // 这里应该从数据库获取用户角色
  // 暂时返回默认角色，实际应用中需要查询数据库
  const userRole = 'admin'; // 临时设置为admin用于测试

  return {
    props: {
      userRole,
    },
  };
};
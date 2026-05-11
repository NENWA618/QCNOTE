import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/authConfig';
import CreatePost from '../components/CreatePost';
import Layout from '../components/Layout';
import { ForumCategory } from '../types/ugc-types';
import { ForumService } from '../server/forum-service';
import { getRedisClient } from '../server/redis-client';
import { getPostgresClient } from '../server/postgres-client';

interface CreatePostPageProps {
  categories: ForumCategory[];
}

export default function CreatePostPage({ categories }: CreatePostPageProps) {
  return (
    <>
      <Head>
        <title>对话式发布 - QCNOTE</title>
        <meta name="description" content="在 QCNOTE 社区论坛通过对话式流程发布新话题。更自然、更轻松地分享你的经验和问题。" />
      </Head>
      <Layout>
        <div className="min-h-[calc(100vh-14rem)] px-4 py-8">
          <CreatePost categories={categories} />
        </div>
      </Layout>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const session = await getServerSession(context.req, context.res, authOptions);

    // 检查用户是否已登录
    if (!session?.user) {
      return {
        redirect: {
          destination: '/auth/signin?callbackUrl=/forum-create',
          permanent: false
        }
      };
    }

    const forumService = new ForumService(getRedisClient(), getPostgresClient());
    const categories = await forumService.getCategories();

    return {
      props: {
        categories,
        session
      }
    };
  } catch (error) {
    console.error('Create post page error:', error);
    return {
      props: {
        categories: []
      }
    };
  }
};
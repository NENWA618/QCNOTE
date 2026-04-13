import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import CreatePost from '../../../components/CreatePost';
import { ForumCategory } from '../../types/ugc-types';
import { ForumService } from '../../../server/forum-service';
import { getRedisClient, getPostgresClient } from '../../../server/redis-client';

interface CreatePostPageProps {
  categories: ForumCategory[];
}

export default function CreatePostPage({ categories }: CreatePostPageProps) {
  return (
    <>
      <Head>
        <title>发布帖子 - QCNOTE</title>
        <meta name="description" content="在 QCNOTE 社区论坛发布新帖子。分享您的笔记经验、使用技巧和问题求助。" />
      </Head>
      <CreatePost categories={categories} />
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
          destination: '/auth/signin?callbackUrl=/forum/create',
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
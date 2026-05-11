import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/authConfig';
import Layout from '../components/Layout';
import ForumHome from '../components/ForumHome';
import { ForumPost, ForumCategory, ForumStats } from '../types/ugc-types';
import { ForumService } from '../server/forum-service';
import { getRedisClient } from '../server/redis-client';
import { getPostgresClient } from '../server/postgres-client';

interface ForumPageProps {
  posts: ForumPost[];
  categories: ForumCategory[];
  stats: ForumStats;
}

export default function ForumPage({ posts, categories, stats }: ForumPageProps) {
  return (
    <>
      <Head>
        <title>QCNOTE 社区论坛 | 知识分享与讨论中心</title>
        <meta
          name="description"
          content="进入 QCNOTE 社区论坛，发现热门话题、提问交流、分享笔记经验，让你的知识网络更有价值。"
        />
        <meta property="og:title" content="QCNOTE 社区论坛 | 知识分享与讨论中心" />
        <meta
          property="og:description"
          content="进入 QCNOTE 社区论坛，发现热门话题、提问交流、分享笔记经验，让你的知识网络更有价值。"
        />
      </Head>
      <Layout>
        <ForumHome initialPosts={posts} categories={categories} stats={stats} />
      </Layout>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const session = await getServerSession(context.req, context.res, authOptions);
    const forumService = new ForumService(getRedisClient(), getPostgresClient());

    // 获取初始数据
    const [postsResult, categories, stats] = await Promise.all([
      forumService.getPosts(undefined, 1, 20),
      forumService.getCategories(),
      forumService.getForumStats()
    ]);

    return {
      props: {
        posts: postsResult.posts,
        categories,
        stats,
        session
      }
    };
  } catch (error) {
    console.error('Forum page error:', error);
    return {
      props: {
        posts: [],
        categories: [],
        stats: {
          totalPosts: 0,
          totalReplies: 0,
          totalUsers: 0,
          totalCategories: 0
        }
      }
    };
  }
};
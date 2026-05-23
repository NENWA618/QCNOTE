import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Layout from '../components/Layout';
import ForumHome from '../components/ForumHome';
import { ForumPost, ForumCategory, ForumStats } from '../types/ugc-types';

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
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    console.error('BACKEND_URL is not configured for Forum page SSR');
    return {
      props: {
        posts: [],
        categories: [],
        stats: {
          totalPosts: 0,
          totalReplies: 0,
          totalUsers: 0,
          totalCategories: 0,
        },
      },
    };
  }

  const headers: Record<string, string> = {};
  if (context.req.headers.cookie) {
    headers.cookie = context.req.headers.cookie;
  }

  try {
    const [postsRes, categoriesRes, statsRes] = await Promise.all([
      fetch(`${backendUrl}/api/forum/posts?page=1&limit=20`, { headers }),
      fetch(`${backendUrl}/api/forum/categories`, { headers }),
      fetch(`${backendUrl}/api/forum/stats`, { headers }),
    ]);

    const [postsData, categoriesData, statsData] = await Promise.all([
      postsRes.json(),
      categoriesRes.json(),
      statsRes.json(),
    ]);

    return {
      props: {
        posts: postsData.posts ?? [],
        categories: categoriesData.categories ?? [],
        stats: statsData.stats ?? {
          totalPosts: 0,
          totalReplies: 0,
          totalUsers: 0,
          totalCategories: 0,
        },
      },
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
          totalCategories: 0,
        },
      },
    };
  }
};

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/authConfig';
import CreatePost from '../components/CreatePost';
import Layout from '../components/Layout';
import { ForumCategory } from '../types/ugc-types';

interface CreatePostPageProps {
  categories: ForumCategory[];
}

export default function CreatePostPage({ categories }: CreatePostPageProps) {
  return (
    <>
      <Head>
        <title>对话式发布 - QCNOTE</title>
        <meta
          name="description"
          content="在 QCNOTE 社区论坛通过对话式流程发布新话题。更自然、更轻松地分享你的经验和问题。"
        />
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

    if (!session?.user) {
      return {
        redirect: {
          destination: '/auth/signin?callbackUrl=/forum-create',
          permanent: false,
        },
      };
    }

    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      console.error('BACKEND_URL is not configured for Create Post page SSR');
      return {
        props: { categories: [] },
      };
    }

    const headers: Record<string, string> = {};
    if (context.req.headers.cookie) {
      headers.cookie = context.req.headers.cookie;
    }

    const categoriesRes = await fetch(`${backendUrl}/api/forum/categories`, { headers });
    const categoriesData = await categoriesRes.json();

    return {
      props: {
        categories: categoriesData.categories ?? [],
        session,
      },
    };
  } catch (error) {
    console.error('Create post page error:', error);
    return {
      props: {
        categories: [],
      },
    };
  }
};

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Layout from '../../../components/Layout';
import ForumPostDetail from '../../../components/ForumPostDetail';
import { ForumPost, ForumReply } from '../../../types/ugc-types';

interface ForumPostPageProps {
  post: ForumPost;
  replies: ForumReply[];
  totalReplies: number;
}

export default function ForumPostPage({ post, replies, totalReplies }: ForumPostPageProps) {
  return (
    <Layout>
      <Head>
        <title>{post.title} · QCNOTE 论坛</title>
        <meta name="description" content={`阅读并回复帖子：${post.title}`} />
      </Head>

      <div className="space-y-6">
        <ForumPostDetail post={post} replies={replies} totalReplies={totalReplies} />
      </div>
    </Layout>
  );
}

interface Params extends Record<string, string> {
  id: string;
}

export const getServerSideProps: GetServerSideProps<ForumPostPageProps, Params> = async (
  context,
) => {
  const postId = context.params?.id;

  if (!postId || Array.isArray(postId)) {
    return {
      notFound: true,
    };
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    console.error('BACKEND_URL is not configured for Forum post page SSR');
    return {
      notFound: true,
    };
  }

  const headers: Record<string, string> = {};
  if (context.req.headers.cookie) {
    headers.cookie = context.req.headers.cookie;
  }

  const [postRes, repliesRes] = await Promise.all([
    fetch(`${backendUrl}/api/forum/posts/${postId}`, { headers }),
    fetch(`${backendUrl}/api/forum/replies?postId=${postId}&page=1&limit=50`, { headers }),
  ]);

  if (!postRes.ok) {
    return {
      notFound: true,
    };
  }

  const postData = await postRes.json();
  const repliesData = await repliesRes.json();

  return {
    props: {
      post: postData.post,
      replies: repliesData.replies ?? [],
      totalReplies: Array.isArray(repliesData.replies) ? repliesData.replies.length : 0,
    },
  };
};

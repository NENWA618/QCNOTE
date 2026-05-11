import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Layout from '../../../components/Layout';
import ForumPostDetail from '../../../components/ForumPostDetail';
import { ForumPost, ForumReply } from '../../../types/ugc-types';
import { getPostgresClient, initPostgresClient } from '../../../server/postgres-client';
import { getRedisClient, initRedisClient } from '../../../server/redis-client';
import { ForumService } from '../../../server/forum-service';

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

export const getServerSideProps: GetServerSideProps<ForumPostPageProps, Params> = async (context) => {
  const postId = context.params?.id;

  if (!postId || Array.isArray(postId)) {
    return {
      notFound: true,
    };
  }

  const postgres = await initPostgresClient();
  const redis = await initRedisClient();
  const forumService = new ForumService(redis, postgres);

  const post = await forumService.getPost(postId);

  if (!post) {
    return {
      notFound: true,
    };
  }

  const { replies } = await forumService.getReplies(postId, 1, 50);

  return {
    props: {
      post,
      replies,
      totalReplies: replies.length,
    },
  };
};

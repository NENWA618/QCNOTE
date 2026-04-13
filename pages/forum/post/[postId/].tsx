import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import ForumPostDetail from '../../../components/ForumPostDetail';
import { ForumPost, ForumReply } from '../../../types/ugc-types';
import { ForumService } from '../../../server/forum-service';
import { getRedisClient, getPostgresClient } from '../../../server/redis-client';

interface PostPageProps {
  post: ForumPost | null;
  replies: ForumReply[];
  totalReplies: number;
}

export default function PostPage({ post, replies, totalReplies }: PostPageProps) {
  if (!post) {
    return (
      <>
        <Head>
          <title>帖子不存在 - QCNOTE</title>
          <meta name="description" content="该帖子不存在或已被删除。" />
        </Head>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">帖子不存在</h1>
            <p className="text-gray-600 dark:text-gray-400">该帖子可能已被删除或不存在</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{post.title} - QCNOTE 论坛</title>
        <meta name="description" content={`${post.content.substring(0, 150)}...`} />
      </Head>
      <ForumPostDetail post={post} replies={replies} totalReplies={totalReplies} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { postId } = context.params as { postId: string };

  try {
    const session = await getServerSession(context.req, context.res, authOptions);
    const forumService = new ForumService(getRedisClient(), getPostgresClient());

    // 获取帖子和回复数据
    const [post, repliesResult] = await Promise.all([
      forumService.getPost(postId),
      forumService.getReplies(postId, 1, 50) // 获取前50条回复
    ]);

    if (!post) {
      return {
        props: {
          post: null,
          replies: [],
          totalReplies: 0
        }
      };
    }

    return {
      props: {
        post,
        replies: repliesResult.replies,
        totalReplies: repliesResult.total,
        session
      }
    };
  } catch (error) {
    console.error('Post page error:', error);
    return {
      props: {
        post: null,
        replies: [],
        totalReplies: 0
      }
    };
  }
};
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]';
import { ForumService } from '../../../../../server/forum-service';
import { getRedisClient } from '../../../../../server/redis-client';
import { getPostgresClient } from '../../../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { postId } = req.query;

  if (!postId || typeof postId !== 'string') {
    return res.status(400).json({ error: 'Invalid post ID' });
  }

  const forumService = new ForumService(getRedisClient(), getPostgresClient());

  if (req.method === 'GET') {
    try {
      const post = await forumService.getPost(postId);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // 增加查看次数
      await forumService.incrementViewCount(postId);

      const replies = await forumService.getReplies(postId);

      res.status(200).json({
        success: true,
        post: { ...post, viewCount: post.viewCount + 1 },
        replies
      });
    } catch (error) {
      console.error('Get post error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'PUT') {
    try {
      const session = await getServerSession(req, res, authOptions);
      const userId = (session?.user as any)?.id as string | undefined;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { title, content, category, tags } = req.body;
      const post = await forumService.getPost(postId);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // 检查权限（作者或管理员）
      if (post.authorId !== userId) {
        const userRole = await forumService.getUserRole(userId);
        if (userRole !== 'admin' && userRole !== 'moderator') {
          return res.status(403).json({ error: 'Permission denied' });
        }
      }

      const updatedPost = await forumService.updatePost(postId, userId, {
        title,
        content,
        tags
      });

      res.status(200).json({
        success: true,
        post: updatedPost
      });
    } catch (error) {
      console.error('Update post error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'DELETE') {
    try {
      const session = await getServerSession(req, res, authOptions);
      const userId = (session?.user as any)?.id as string | undefined;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const post = await forumService.getPost(postId);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // 检查权限（作者或管理员）
      if (post.authorId !== userId) {
        const userRole = await forumService.getUserRole(userId);
        if (userRole !== 'admin') {
          return res.status(403).json({ error: 'Permission denied' });
        }
      }

      await forumService.deletePost(postId, userId);

      res.status(200).json({
        success: true,
        message: 'Post deleted successfully'
      });
    } catch (error) {
      console.error('Delete post error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
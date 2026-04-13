import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { ForumService } from '../../../server/forum-service';
import { getRedisClient } from '../../../server/redis-client';
import { getPostgresClient } from '../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const session = await getServerSession(req, res, authOptions);
      const userId = (session?.user as any)?.id as string | undefined;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { postId, content, parentReplyId } = req.body;

      if (!postId || !content) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const forumService = new ForumService(getRedisClient(), getPostgresClient());

      // 检查帖子是否存在
      const post = await forumService.getPost(postId);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const reply = await forumService.createReply(userId, {
        postId,
        content,
        parentReplyId
      });

      res.status(201).json({
        success: true,
        reply
      });
    } catch (error) {
      console.error('Create reply error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
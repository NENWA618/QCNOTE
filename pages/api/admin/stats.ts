import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authConfig';
import { ForumService } from '../../../server/forum-service';
import { getRedisClient, initRedisClient } from '../../../server/redis-client';
import { getPostgresClient, initPostgresClient } from '../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Initialize clients if not already initialized
  try {
    await initRedisClient();
    await initPostgresClient();
  } catch (error) {
    console.error('Client initialization error:', error);
    return res.status(500).json({ error: 'Database connection failed' });
  }

  if (req.method === 'GET') {
    try {
      const session = await getServerSession(req, res, authOptions);
      const userId = (session?.user as any)?.id as string | undefined;
      const userEmail = (session?.user as any)?.email as string | undefined;
      if (!userId && !userEmail) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // 检查用户是否为管理员
      const forumService = new ForumService(getRedisClient(), getPostgresClient());
      let userRole = 'user';
      if (userId) {
        userRole = await forumService.getUserRole(userId);
      }
      if (userRole !== 'admin' && userEmail) {
        userRole = await forumService.getUserRoleByEmail(userEmail);
      }

      if (userRole !== 'admin') {
        return res.status(403).json({ error: 'Permission denied' });
      }

      // 获取统计数据
      const pool = getPostgresClient();

      const [userCount, postCount, replyCount, categoryCount] = await Promise.all([
        pool.query('SELECT COUNT(*) as count FROM users'),
        pool.query('SELECT COUNT(*) as count FROM forum_posts'),
        pool.query('SELECT COUNT(*) as count FROM forum_replies'),
        pool.query('SELECT COUNT(*) as count FROM forum_categories'),
      ]);

      const stats = {
        totalUsers: parseInt(userCount.rows[0].count),
        totalPosts: parseInt(postCount.rows[0].count),
        totalReplies: parseInt(replyCount.rows[0].count),
        totalCategories: parseInt(categoryCount.rows[0].count),
      };

      res.status(200).json({
        success: true,
        stats,
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
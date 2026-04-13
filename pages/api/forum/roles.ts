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
      const { userId } = req.query;
      const forumService = new ForumService(getRedisClient(), getPostgresClient());

      if (userId && typeof userId === 'string') {
        // 查询特定用户的角色
        const role = await forumService.getUserRole(userId);
        return res.status(200).json({
          success: true,
          role
        });
      } else {
        // 查询当前用户的角色
        const session = await getServerSession(req, res, authOptions);
        const currentUserId = (session?.user as any)?.id as string | undefined;
        if (!currentUserId) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const role = await forumService.getUserRole(currentUserId);
        return res.status(200).json({
          success: true,
          role
        });
      }
    } catch (error) {
      console.error('Get user role error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'PUT') {
    try {
      const session = await getServerSession(req, res, authOptions);
      const userId = (session?.user as any)?.id as string | undefined;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // 只有管理员可以修改用户角色
      const forumService = new ForumService(getRedisClient(), getPostgresClient());
      const currentUserRole = await forumService.getUserRole(userId);

      if (currentUserRole !== 'admin') {
        return res.status(403).json({ error: 'Permission denied' });
      }

      const { userId: targetUserId, role } = req.body;

      if (!targetUserId || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!['user', 'moderator', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      if (!(session?.user as any)?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await forumService.setUserRole(targetUserId, role as 'user' | 'moderator' | 'admin', (session!.user as any).id);

      res.status(200).json({
        success: true,
        message: 'User role updated successfully'
      });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
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
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // 检查用户是否为管理员
      const forumService = new ForumService(getRedisClient(), getPostgresClient());
      const userRole = await forumService.getUserRole(userId);

      if (userRole !== 'admin') {
        return res.status(403).json({ error: 'Permission denied' });
      }

      // 获取所有用户
      const pool = getPostgresClient();
      const usersResult = await pool.query(`
        SELECT id, name, email, created_at
        FROM users
        ORDER BY created_at DESC
      `);

      // 为每个用户获取角色
      const usersWithRoles = await Promise.all(
        usersResult.rows.map(async (user) => {
          const role = await forumService.getUserRole(user.id);
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: role,
            createdAt: user.created_at,
          };
        })
      );

      res.status(200).json({
        success: true,
        users: usersWithRoles,
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
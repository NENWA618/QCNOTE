import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authConfig';
import { ForumService } from '../../../server/forum-service';
import { UGCService } from '../../../server/ugc-service';
import { getRedisClient, initRedisClient } from '../../../server/redis-client';
import { getPostgresClient, initPostgresClient } from '../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize clients
    await initRedisClient();
    await initPostgresClient();

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 检查当前用户是否为管理员
    const forumService = new ForumService(getRedisClient(), getPostgresClient());
    const sessionUser = session.user as any;
    const currentUserId = sessionUser.id as string | undefined;
    const currentUserEmail = sessionUser.email as string | undefined;

    let currentUserRole = 'user';
    if (currentUserId) {
      currentUserRole = await forumService.getUserRole(currentUserId);
    }
    if (currentUserRole !== 'admin' && currentUserEmail) {
      currentUserRole = await forumService.getUserRoleByEmail(currentUserEmail);
    }

    if (currentUserRole !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { email, username, userId } = req.body;

    if (!email && !userId) {
      return res.status(400).json({ error: 'Either email or userId is required' });
    }

    const pool = getPostgresClient();
    let user;

    if (userId) {
      // 通过ID查找用户
      const result = await pool.query(
        'SELECT id, name, email, username FROM users WHERE id = $1',
        [userId]
      );
      user = result.rows[0];
    } else {
      // 通过邮箱查找用户
      const result = await pool.query(
        'SELECT id, name, email, username FROM users WHERE email = $1',
        [email]
      );
      user = result.rows[0];

      // 如果用户不存在，创建用户
      if (!user && username) {
        console.log(`User ${email} not found, creating new user...`);
        const ugcService = new UGCService(getRedisClient(), getPostgresClient());
        await ugcService.createUserProfile(email, email, username);

        // 重新查询
        const newResult = await pool.query(
          'SELECT id, name, email, username FROM users WHERE email = $1',
          [email]
        );
        user = newResult.rows[0];
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found and could not be created' });
    }

    // 设置为管理员
    await forumService.setUserRole(user.id, 'admin', (session.user as any).id);

    res.status(200).json({
      success: true,
      message: `User ${user.name || user.username} (${user.email}) has been set as admin`,
      user: {
        id: user.id,
        name: user.name || user.username,
        email: user.email,
      }
    });
  } catch (error) {
    console.error('Set admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
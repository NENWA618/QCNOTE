import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authConfig';
import { ForumService } from '../../../server/forum-service';
import { getRedisClient, initRedisClient } from '../../../server/redis-client';
import { getPostgresClient, initPostgresClient } from '../../../server/postgres-client';
import { withErrorHandler, createSuccessResponse, createErrorResponse } from '../../../lib/api-utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Initialize clients if not already initialized
  await initRedisClient();
  await initPostgresClient();

  if (req.method === 'GET') {
    const session = await getServerSession(req, res, authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    const userEmail = (session?.user as any)?.email as string | undefined;
    if (!userId && !userEmail) {
      return res.status(401).json(createErrorResponse('Unauthorized', 'AUTH_ERROR'));
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
      return res.status(403).json(createErrorResponse('Permission denied', 'PERMISSION_ERROR'));
    }

    // 获取所有用户及其角色（使用JOIN避免N+1查询）
    const pool = getPostgresClient();
    const usersResult = await pool.query(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.created_at,
        COALESCE(ur.role, 'user') as role
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      ORDER BY u.created_at DESC
    `);

    const usersWithRoles = usersResult.rows.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.created_at,
    }));

    res.status(200).json(createSuccessResponse({ users: usersWithRoles }));
  } else {
    res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }
}

export default withErrorHandler(handler);
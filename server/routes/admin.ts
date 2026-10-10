import type { FastifyReply } from 'fastify';
import type { BackendRequest, ExtendedFastifyInstance } from '../types';
import { requireUser, requireAdmin, isAdminUser } from '../session';
import { initPostgresClient } from '../postgres-client';
import logger from '../../lib/logger';

export function registerAdminRoutes(app: ExtendedFastifyInstance) {
  // ==================== 后端管理路由 ====================

  app.get('/api/admin/users', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      const adminUserId = await requireAdmin(request, reply);
      if (!adminUserId) return;

      const pool = await initPostgresClient();
      const usersResult = await pool.query(`
        SELECT u.id, u.username AS name, u.email, u.created_at, COALESCE(ur.role, 'user') as role
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        ORDER BY u.created_at DESC
      `);

      const users = usersResult.rows.map(
        (user: { id: string; name: string; email: string; role: string; created_at: string }) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          // BIGINT 列经 pg 返回的是字符串，转成毫秒时间戳数字
          createdAt: Number(user.created_at),
        }),
      );

      reply.send({ success: true, users });
    } catch (error) {
      logger.error('Admin users error:', error);
      reply.status(500).send({ success: false, error: 'Internal server error' });
    }
  });

  app.post('/api/admin/set-admin', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      const adminUserId = await requireAdmin(request, reply);
      if (!adminUserId) return;

      const { email, userId } = request.body as {
        email?: string;
        userId?: string;
      };
      if (!email && !userId) {
        return reply
          .status(400)
          .send({ success: false, error: 'Either email or userId is required' });
      }

      const pool = await initPostgresClient();
      let user;

      if (userId) {
        const result = await pool.query(
          'SELECT id, username AS name, email, username FROM users WHERE id = $1',
          [userId],
        );
        user = result.rows[0];
      } else {
        const result = await pool.query(
          'SELECT id, username AS name, email, username FROM users WHERE email = $1',
          [email],
        );
        user = result.rows[0];
      }

      // Never create the user here: a placeholder row would get an id that no
      // OAuth sign-in ever matches, so the role would silently never apply.
      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found. They need to sign in once before they can be made an admin.',
        });
      }

      await pool.query(
        `INSERT INTO user_roles (user_id, role, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           role = EXCLUDED.role,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [user.id, 'admin', adminUserId],
      );
      reply.send({
        success: true,
        message: `User ${user.name || user.username} (${user.email}) has been set as admin`,
        user,
      });
    } catch (error) {
      logger.error('Admin set-admin error:', error);
      reply.status(500).send({ success: false, error: 'Internal server error' });
    }
  });

  // ==================== 管理角色路由 ====================

  app.get('/api/admin/roles', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      const me = await requireUser(request, reply);
      if (!me) return;

      const { userId, email } = request.query;
      if (!userId && !email) {
        return reply.status(400).send({
          success: false,
          error: 'Missing email or userId parameter',
        });
      }

      // 查询自己的角色无需特权；查询他人角色需要管理员
      const isSelf =
        (typeof userId === 'string' && userId === me.userId) ||
        (typeof email === 'string' &&
          me.email !== null &&
          email.toLowerCase() === me.email.toLowerCase());
      if (!isSelf && !(await isAdminUser(me.userId))) {
        return reply.status(403).send({ success: false, error: 'Forbidden' });
      }

      const pool = await initPostgresClient();
      let role = 'user';

      if (email && typeof email === 'string') {
        const result = await pool.query(
          `SELECT ur.role
           FROM users u
           LEFT JOIN user_roles ur ON u.id = ur.user_id
           WHERE LOWER(u.email) = LOWER($1)
           LIMIT 1`,
          [email],
        );
        role = result.rows[0]?.role || 'user';
      } else if (userId && typeof userId === 'string') {
        const result = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
        role = result.rows[0]?.role || 'user';
      }

      reply.send({ success: true, role });
    } catch (error) {
      logger.error('Get admin role error:', error);
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: 'Internal server error',
      });
    }
  });

  app.put(
    '/api/admin/roles',
    async (request: BackendRequest<{ userId?: string; role?: string }>, reply: FastifyReply) => {
      try {
        const adminUserId = await requireAdmin(request, reply);
        if (!adminUserId) return;

        const { userId, role } = request.body;

        if (!userId || typeof userId !== 'string' || !role) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required fields',
          });
        }

        if (!['user', 'moderator', 'admin'].includes(role)) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid role',
          });
        }

        const pool = await initPostgresClient();
        await pool.query(
          `INSERT INTO user_roles (user_id, role, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           role = EXCLUDED.role,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
          [userId, role, adminUserId],
        );

        reply.send({ success: true, message: 'User role updated successfully' });
      } catch (error) {
        logger.error('Update admin role error:', error);
        reply.status(500).send({
          success: false,
          error: 'Internal server error',
          message: 'Internal server error',
        });
      }
    },
  );
}

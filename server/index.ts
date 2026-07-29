import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getToken } from 'next-auth/jwt';
import { initRedisClient, closeRedisClient } from './redis-client';
import { initPostgresClient } from './postgres-client';
import { UGCService } from './ugc-service';
import { RecommendationService } from './recommendation-service';
import { pushService } from './push-service';
import logger from '../lib/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ExtendedFastifyInstance extends FastifyInstance {
  __routesRegistered?: boolean;
}

interface Note {
  id: string;
  title?: string;
  content?: string;
  [key: string]: unknown;
}

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, pair) => {
    const [name, ...valueParts] = pair.split('=');
    const nameTrimmed = name?.trim();
    if (!nameTrimmed) return cookies;
    cookies[nameTrimmed] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {});
}

let serverNotes: Note[] = [];
const NOTES_PERSIST_PATH = path.join(__dirname, '.notes-cache.json');

let ugcService: UGCService;
let recommendationService: RecommendationService;

async function getSessionUserId(request: FastifyRequest): Promise<string | null> {
  const cookieHeader = request.raw.headers.cookie as string | undefined;
  const cookieNames = cookieHeader
    ? cookieHeader.split(';').map((item) => item.split('=')[0].trim())
    : [];
  const hasNextAuthSecret = Boolean(process.env.NEXTAUTH_SECRET);

  try {
    const token = await getToken({
      req: {
        ...request.raw,
        cookies: parseCookieHeader(request.raw.headers.cookie as string | undefined),
      } as any,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === 'production',
    });

    if (!token || typeof token !== 'object') {
      logger.warn('Session token missing or invalid', {
        hasCookie: Boolean(cookieHeader),
        cookieNames,
        hasAuthorization: Boolean(request.raw.headers.authorization),
      });
      return null;
    }

    const userId = (token.id as string) || (token.sub as string) || null;

    if (!userId) {
      logger.warn('Decoded token has no user id/sub', {
        id: token.id,
        sub: token.sub,
        email: token.email,
        name: token.name,
        hasCookie: Boolean(cookieHeader),
        cookieNames,
      });
      return null;
    }

    return userId;
  } catch (error) {
    logger.error('Failed to decode session token:', error, {
      hasCookie: Boolean(cookieHeader),
      cookieNames,
      hasAuthorization: Boolean(request.raw.headers.authorization),
      hasNextAuthSecret,
    });
    return null;
  }
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const userId = await getSessionUserId(request);
  if (!userId) {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
    return null;
  }

  const pool = await initPostgresClient();
  const result = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  const role = result.rows[0]?.role || 'user';
  if (role !== 'admin') {
    reply.status(403).send({ success: false, error: 'Forbidden' });
    return null;
  }

  return userId;
}

function getUtc8DayString(date: Date = new Date()): string {
  const utc8Ms = date.getTime() + (date.getTimezoneOffset() + 480) * 60000;
  return new Date(utc8Ms).toISOString().slice(0, 10);
}

function getNextUtc8Midnight(date: Date = new Date()): Date {
  const day = getUtc8DayString(date);
  const midnight = new Date(`${day}T00:00:00+08:00`);
  midnight.setTime(midnight.getTime() + 24 * 60 * 60 * 1000);
  return midnight;
}

function buildFastify() {
  const fastify = Fastify({ logger: true });
  fastify.register(cors, { origin: true });
  registerRoutes(fastify);
  return fastify;
}

const fastify = buildFastify();

function registerRoutes(app: ExtendedFastifyInstance) {
  if (app.__routesRegistered) return;
  app.__routesRegistered = true;

  // 请求监控中间件
  app.addHook(
    'onRequest',
    (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
      request.startTime = Date.now();
      logger.info(`${request.method} ${request.url} - Start`);
      done();
    },
  );

  app.addHook(
    'onResponse',
    (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
      const duration = Date.now() - (request.startTime || 0);
      logger.info(`${request.method} ${request.url} - ${reply.statusCode} - ${duration}ms`);
      done();
    },
  );

  // ==================== 原有路由 ====================
  app.post('/syncNote', async (request: FastifyRequest, reply: FastifyReply) => {
    const note = request.body as Note | undefined;
    if (!note || !note.id || typeof note.id !== 'string') {
      return reply.status(200).send({ ok: false, message: 'Invalid note payload' });
    }

    const existingIndex = serverNotes.findIndex((item) => item.id === note.id);
    if (existingIndex >= 0) {
      serverNotes[existingIndex] = { ...serverNotes[existingIndex], ...note };
    } else {
      serverNotes.push(note);
    }

    await saveNotesToDisk();
    return { ok: true, message: `Note ${note.id} synced` };
  });

  app.get('/stats', async () => {
    return {
      totalNotes: serverNotes.length,
      persisted: true,
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/api/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查数据库连接
      const dbClient = await initPostgresClient();
      await dbClient.query('SELECT 1');

      // 检查Redis连接
      const redisClient = await initRedisClient();
      await redisClient.ping();

      return reply.code(200).send({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
          database: 'ok',
          redis: 'ok',
          notes: serverNotes.length,
        },
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      return reply.code(503).send({
        status: 'unhealthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ==================== UGC 用户路由 ====================

  // 获取或创建用户资料
  app.post('/api/ugc/user/init', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, email, username } = request.body;

      let profile = await ugcService.getUserProfile(userId);
      if (!profile) {
        profile = await ugcService.createUserProfile(userId, email, username);
        const space = await ugcService.createUserSpace(userId);
        reply.send({ success: true, profile, space });
      } else {
        reply.send({ success: true, profile });
      }
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 获取用户资料
  app.get('/api/ugc/user/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const profile = await ugcService.getUserProfile(userId);
      const followers = await ugcService.getFollowers(userId);
      const following = await ugcService.getFollowing(userId);

      reply.send({ success: true, profile, followers, following });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 更新用户资料
  app.put('/api/ugc/user/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const updates = request.body;
      const updated = await ugcService.updateUserProfile(userId, updates);
      reply.send({ success: true, profile: updated });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // ==================== UGC 虚拟空间路由 ====================

  // 获取用户虚拟空间
  app.get('/api/ugc/space/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const space = await ugcService.getUserSpace(userId);
      reply.send({ success: true, space });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 更新虚拟空间
  app.put('/api/ugc/space/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const updates = request.body;
      const updated = await ugcService.updateUserSpace(userId, updates);
      reply.send({ success: true, space: updated });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 添加装饰品
  app.post(
    '/api/ugc/space/:userId/decoration',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.params;
        const decoration = request.body;
        await ugcService.addDecoration(userId, decoration);
        reply.send({ success: true, message: 'Decoration added' });
      } catch (error) {
        reply.status(400).send({ success: false, error: (error as Error).message });
      }
    },
  );

  // ==================== UGC 虚拟货币路由 ====================

  // 获取用户虚拟货币
  app.get('/api/ugc/credit/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const credit = await ugcService.getCredit(userId);
      reply.send({ success: true, credit });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 记录模型分享并奖励
  app.post('/api/ugc/models/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, modelId, shareToCommunity } = request.body as {
        userId?: string;
        modelId?: string;
        shareToCommunity?: boolean;
      };

      if (!userId || !modelId) {
        return reply.status(400).send({ success: false, error: 'Missing required fields' });
      }

      await ugcService.rewardModelShare(userId, modelId, shareToCommunity ?? false);
      reply.send({ success: true, message: 'Model upload simulated successfully' });
    } catch (error) {
      reply.status(500).send({ success: false, error: (error as Error).message });
    }
  });

  // 处理模型购买
  app.post('/api/ugc/models/purchase', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, modelId } = request.body as { userId?: string; modelId?: string };
      if (!userId || !modelId) {
        return reply.status(400).send({ success: false, error: 'Missing required fields' });
      }

      const userCredit = await ugcService.getUserCredit(userId);
      const modelPrice = 15;

      if (userCredit < modelPrice) {
        return reply.status(400).send({ success: false, error: 'Insufficient credit' });
      }

      await ugcService.addCredit(userId, -modelPrice, '购买Live2D模型');

      const uploaderId = modelId.split('_')[2] || '';
      if (uploaderId && uploaderId !== userId) {
        await ugcService.addCredit(uploaderId, modelPrice, '模型被购买');
      }
      await ugcService.recordModelPurchase(modelId, userId);

      const newCredit = await ugcService.getUserCredit(userId);
      reply.send({ success: true, newCredit, message: 'Purchase successful' });
    } catch (error) {
      reply.status(500).send({ success: false, error: (error as Error).message });
    }
  });

  // ==================== 社区功能已迁移至论坛系统 ====================

  // ==================== UGC 互动路由 ====================

  // 关注用户
  app.post('/api/ugc/follow', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { followerId, followeeId } = request.body;
      await ugcService.followUser(followerId, followeeId);
      reply.send({ success: true, message: 'User followed' });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 取消关注
  app.post('/api/ugc/unfollow', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { followerId, followeeId } = request.body;
      await ugcService.unfollowUser(followerId, followeeId);
      reply.send({ success: true, message: 'User unfollowed' });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 检查是否关注
  app.get(
    '/api/ugc/following/:followerId/:followeeId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { followerId, followeeId } = request.params;
        const following = await ugcService.isFollowing(followerId, followeeId);
        reply.send({ success: true, following });
      } catch (error) {
        reply.status(400).send({ success: false, error: (error as Error).message });
      }
    },
  );

  // ==================== UGC 排行榜路由 ====================

  // Maze leaderboard for current UTC+8 day
  app.get('/api/ugc/leaderboard/maze', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const utc8Ms = now.getTime() + (now.getTimezoneOffset() + 480) * 60000;
      const day = new Date(utc8Ms).toISOString().slice(0, 10);
      const leaderboardKey = `leaderboard:maze:${day}`;
      const leaderboard = await ugcService.getGameLeaderboard(
        leaderboardKey,
        Number(request.query.limit) || 50,
      );
      const count = leaderboard.length;

      reply.send({
        success: true,
        leaderboard,
        day,
        count,
        debug: {
          leaderboardKey,
          count,
          requestedDay: day,
        },
      });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 获取排行榜
  app.get('/api/ugc/leaderboard/:type', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type } = request.params;
      const limit = request.query.limit || 50;

      const leaderboardKey = `leaderboard:${type}`;
      const leaderboard = await ugcService.getLeaderboard(leaderboardKey, limit);

      reply.send({ success: true, leaderboard });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/ugc/maze/submit', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await getSessionUserId(request);
      logger.info('[Maze Submit] start', {
        hasCookie: Boolean(request.raw.headers.cookie),
        userId,
        body: request.body,
      });
      if (!userId) {
        logger.warn('[Maze Submit] unauthorized', {
          hasCookie: Boolean(request.raw.headers.cookie),
          cookieHeader: request.raw.headers.cookie,
        });
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      const { day, steps, timeMs } = request.body as {
        day?: string;
        steps?: number;
        timeMs?: number;
      };

      if (!day || typeof steps !== 'number' || typeof timeMs !== 'number') {
        return reply.status(400).send({ success: false, error: 'Invalid parameters' });
      }

      const normalizedSteps = Math.round(steps);
      const normalizedTimeMs = Math.round(timeMs);
      const leaderboardKey = `leaderboard:maze:${day}`;
      logger.info('[Maze Submit] checking existing submission', { leaderboardKey, userId });
      const alreadySubmitted = await ugcService.hasGameSubmission(leaderboardKey, userId);
      logger.info('[Maze Submit] submission exists', { leaderboardKey, userId, alreadySubmitted });

      const pool = await initPostgresClient();
      const userResult = await pool.query('SELECT id, username, image FROM users WHERE id = $1', [
        userId,
      ]);
      const user = userResult.rows[0];
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }

      logger.info('[Maze Submit] writing submission', {
        leaderboardKey,
        userId,
        steps,
        timeMs,
        username: user.username,
      });
      await ugcService.addGameSubmission(
        leaderboardKey,
        userId,
        normalizedSteps,
        normalizedTimeMs,
        user.username,
        user.image,
      );
      logger.info('[Maze Submit] write complete', { leaderboardKey, userId });
      reply.send({ success: true, submitted: true, day });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // ==================== 后端管理路由 ====================

  app.get('/api/admin/users', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminUserId = await requireAdmin(request, reply);
      if (!adminUserId) return;

      const pool = await initPostgresClient();
      const usersResult = await pool.query(`
        SELECT u.id, u.name, u.email, u.created_at, COALESCE(ur.role, 'user') as role
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        ORDER BY u.created_at DESC
      `);

      const users = usersResult.rows.map((user: any) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.created_at,
      }));

      reply.send({ success: true, users });
    } catch (error) {
      logger.error('Admin users error:', error);
      reply
        .status(500)
        .send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/admin/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminUserId = await requireAdmin(request, reply);
      if (!adminUserId) return;

      const pool = await initPostgresClient();
      const [{ rows: userRows }] = await Promise.all([
        pool.query('SELECT COUNT(*) as count FROM users'),
      ]);

      reply.send({
        success: true,
        stats: {
          totalUsers: parseInt(userRows[0].count, 10),
          totalPosts: 0,
          totalReplies: 0,
          totalCategories: 0,
        },
      });
    } catch (error) {
      logger.error('Admin stats error:', error);
      reply
        .status(500)
        .send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/admin/set-admin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminUserId = await requireAdmin(request, reply);
      if (!adminUserId) return;

      const { email, username, userId } = request.body as {
        email?: string;
        username?: string;
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
          'SELECT id, name, email, username FROM users WHERE id = $1',
          [userId],
        );
        user = result.rows[0];
      } else {
        const result = await pool.query(
          'SELECT id, name, email, username FROM users WHERE email = $1',
          [email],
        );
        user = result.rows[0];
        if (!user && username) {
          await ugcService.createUserProfile(email!, email!, username);
          const newResult = await pool.query(
            'SELECT id, name, email, username FROM users WHERE email = $1',
            [email],
          );
          user = newResult.rows[0];
        }
      }

      if (!user) {
        return reply
          .status(404)
          .send({ success: false, error: 'User not found and could not be created' });
      }

      await pool.query(
        `INSERT INTO user_roles (user_id, role, updated_by, updated_at)
         VALUES ($1, $2, $1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           role = EXCLUDED.role,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [user.id, 'admin'],
      );
      reply.send({
        success: true,
        message: `User ${user.name || user.username} (${user.email}) has been set as admin`,
        user,
      });
    } catch (error) {
      logger.error('Admin set-admin error:', error);
      reply
        .status(500)
        .send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/sitemap.xml', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const pool = await initPostgresClient();

      const staticUrls = [
        { loc: 'https://www.qcnote.com/', priority: 1.0, changefreq: 'daily' },
        { loc: 'https://www.qcnote.com/dashboard', priority: 0.8, changefreq: 'weekly' },
        { loc: 'https://www.qcnote.com/contact', priority: 0.6, changefreq: 'monthly' },
        { loc: 'https://www.qcnote.com/privacy', priority: 0.4, changefreq: 'yearly' },
        { loc: 'https://www.qcnote.com/terms', priority: 0.4, changefreq: 'yearly' },
        { loc: 'https://www.qcnote.com/leaderboard', priority: 0.8, changefreq: 'daily' },
        { loc: 'https://www.qcnote.com/models', priority: 0.8, changefreq: 'weekly' },
        { loc: 'https://www.qcnote.com/signin', priority: 0.5, changefreq: 'monthly' },
      ];

      const allUrls = staticUrls;
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls.map((url) => `  <url>\n    <loc>${url.loc}</loc>\n${url.lastmod ? `    <lastmod>${url.lastmod}</lastmod>` : ''}\n${url.changefreq ? `    <changefreq>${url.changefreq}</changefreq>` : ''}\n${url.priority ? `    <priority>${url.priority}</priority>` : ''}\n  </url>`).join('\n')}\n</urlset>`;

      reply.header('Content-Type', 'application/xml').send(sitemapXml);
    } catch (error) {
      logger.error('Sitemap generation error:', error);
      reply
        .status(500)
        .send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ==================== 管理角色路由 ====================

  app.get('/api/admin/roles', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, email } = request.query;
      if (!userId && !email) {
        return reply.status(400).send({
          success: false,
          error: 'Missing email or userId parameter',
        });
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
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.put('/api/admin/roles', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, role } = request.body;

      if (!userId || !role) {
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
         VALUES ($1, $2, $1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           role = EXCLUDED.role,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [userId, role],
      );

      reply.send({ success: true, message: 'User role updated successfully' });
    } catch (error) {
      logger.error('Update admin role error:', error);
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ==================== UGC 推荐路由 ====================

  // 获取个性化推荐
  app.get(
    '/api/ugc/recommendations/:userId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.params;
        const limit = request.query.limit || 20;

        const recommendations = await recommendationService.recommendNotesForUser(userId, limit);

        reply.send({ success: true, recommendations });
      } catch (error) {
        reply.status(400).send({ success: false, error: (error as Error).message });
      }
    },
  );

  // ==================== Web Push 通知路由 ====================

  // 订阅推送通知
  app.post('/api/push/subscribe', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const subscription = request.body;
      if (!subscription.endpoint || !subscription.keys) {
        return reply.status(400).send({ error: 'Invalid subscription data' });
      }

      await pushService.subscribe(subscription);
      reply.send({ success: true, message: 'Subscription saved' });
    } catch (error) {
      logger.error('Push subscribe error:', error);
      reply.status(500).send({ error: 'Failed to save subscription' });
    }
  });

  // 取消订阅推送通知
  app.post('/api/push/unsubscribe', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { endpoint } = request.body;
      if (!endpoint) {
        return reply.status(400).send({ error: 'Missing endpoint' });
      }

      await pushService.unsubscribe(endpoint);
      reply.send({ success: true, message: 'Unsubscribed' });
    } catch (error) {
      logger.error('Push unsubscribe error:', error);
      reply.status(500).send({ error: 'Failed to unsubscribe' });
    }
  });

  // 广播推送通知（仅管理员）
  app.post('/api/push/broadcast', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminUserId = await requireAdmin(request, reply);
      if (!adminUserId) return;

      const { title, body, icon, badge, tag, data } = request.body as {
        title?: string;
        body?: string;
        icon?: string;
        badge?: string;
        tag?: string;
        data?: unknown;
      };

      if (!title) {
        return reply.status(400).send({ error: 'Missing title' });
      }

      if (!pushService.isReady()) {
        return reply.status(503).send({
          error: 'Push service not configured',
          message: 'Please configure VAPID_PUBLIC and VAPID_PRIVATE environment variables',
        });
      }

      const result = await pushService.broadcastNotification(title, {
        body,
        icon,
        badge,
        tag,
        data,
      });

      reply.send({ success: true, result });
    } catch (error) {
      logger.error('Push broadcast error:', error);
      reply.status(500).send({ error: 'Failed to broadcast notification' });
    }
  });

  // 获取推送统计信息（仅管理员）
  app.get('/api/push/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const adminUserId = await requireAdmin(request, reply);
      if (!adminUserId) return;

      const subscriptions = await pushService.getAllSubscriptions();
      reply.send({
        success: true,
        totalSubscriptions: subscriptions.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Push stats error:', error);
      reply.status(500).send({ error: 'Failed to get push stats' });
    }
  });

  // ==================== 设备指纹验证路由 ====================

  app.post('/api/device/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { fingerprint } = request.body as { fingerprint?: string };
      const userId = await getSessionUserId(request);

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!fingerprint || typeof fingerprint !== 'string') {
        return reply.status(400).send({ error: 'Fingerprint is required' });
      }

      const verification = await ugcService.verifyDeviceFingerprint(userId, fingerprint);
      if (!verification.allowed) {
        return reply.status(403).send({
          success: false,
          error: 'Device fingerprint not recognized',
          code: 'DEVICE_MISMATCH',
          firstTime: false,
        });
      }

      reply.send({ success: true, firstTime: verification.firstTime });
    } catch (error) {
      logger.error('Device verify error:', error);
      reply
        .status(500)
        .send({ error: error instanceof Error ? error.message : 'Failed to verify device' });
    }
  });

  app.post('/api/device/session/create', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { fingerprint } = request.body as { fingerprint?: string };
      const userId = await getSessionUserId(request);

      if (!userId) {
        logger.warn('Unauthenticated request to /api/device/session/create', {
          hasCookie: Boolean(request.headers.cookie),
          hasAuthorization: Boolean(request.headers.authorization),
        });
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!fingerprint || typeof fingerprint !== 'string') {
        return reply.status(400).send({ error: 'Fingerprint is required' });
      }

      const verification = await ugcService.verifyDeviceFingerprint(userId, fingerprint);
      if (!verification.allowed) {
        return reply.status(403).send({
          success: false,
          error: 'Device fingerprint not recognized',
          code: 'DEVICE_MISMATCH',
          firstTime: false,
        });
      }

      const token = await ugcService.createDeviceSessionToken(userId, fingerprint);
      reply.send({ success: true, token, firstTime: verification.firstTime });
    } catch (error) {
      logger.error('Device session create error:', error);
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to create device session',
      });
    }
  });

  app.post('/api/device/session/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { token, fingerprint } = request.body as {
        token?: string;
        fingerprint?: string;
      };
      const userId = await getSessionUserId(request);

      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!token || typeof token !== 'string') {
        return reply.status(400).send({ error: 'Token is required' });
      }
      if (!fingerprint || typeof fingerprint !== 'string') {
        return reply.status(400).send({ error: 'Fingerprint is required' });
      }

      const valid = await ugcService.verifyDeviceSessionToken(userId, token, fingerprint);
      if (!valid) {
        return reply
          .status(403)
          .send({ success: false, error: 'Invalid or expired device session token' });
      }

      reply.send({ success: true });
    } catch (error) {
      logger.error('Device session validate error:', error);
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to validate device session',
      });
    }
  });

  app.post('/api/device/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = await getSessionUserId(request);

      if (!userId) {
        logger.warn('Unauthenticated request to /api/device/reset', {
          hasCookie: Boolean(request.headers.cookie),
          hasAuthorization: Boolean(request.headers.authorization),
        });
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      logger.info('Resetting device fingerprints for user', { userId });
      await ugcService.resetDeviceFingerprints(userId);
      reply.send({ success: true, message: 'Device fingerprints reset successfully' });
    } catch (error) {
      logger.error('Device reset error:', error);
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Failed to reset device fingerprints',
      });
    }
  });
}

registerRoutes(fastify);

async function loadNotesFromDisk(): Promise<void> {
  try {
    const data = await fs.readFile(NOTES_PERSIST_PATH, 'utf-8');
    serverNotes = JSON.parse(data) as Note[];
    logger.info(`[Server] Loaded ${serverNotes.length} notes from disk`);
  } catch (e) {
    logger.info('[Server] No persisted notes found; starting with an empty note list');
  }
}

async function saveNotesToDisk(): Promise<void> {
  try {
    await fs.writeFile(NOTES_PERSIST_PATH, JSON.stringify(serverNotes, null, 2), 'utf-8');
    logger.info('[Server] Notes persisted to disk');
  } catch (e) {
    logger.warn('[Server] Failed to persist notes:', e);
  }
}

const PORT = Number(process.env.PORT || process.env.REDIRECT_PORT || 10000);
const HOST = process.env.HOST || '0.0.0.0';

// 初始化 Redis、PostgreSQL 和服务
async function startServer() {
  try {
    const redis = await initRedisClient();
    logger.info('[Server] Redis connected');

    const postgres = await initPostgresClient();
    logger.info('[Server] PostgreSQL connected');

    // 初始化服务
    ugcService = new UGCService(redis, postgres);
    recommendationService = new RecommendationService(redis, ugcService);
    logger.info('[Server] UGC services initialized');

    const currentUtc8Day = getUtc8DayString();
    const deletedCount = await ugcService.cleanupMazeLeaderboardEntries(currentUtc8Day);
    logger.info('[Maze Cleanup] initial run completed', { currentUtc8Day, deletedCount });

    const scheduleMazeLeaderboardCleanup = () => {
      const now = new Date();
      const nextMidnight = getNextUtc8Midnight(now);
      const waitMs = Math.max(1000, nextMidnight.getTime() - now.getTime());

      logger.info('[Maze Cleanup] scheduled', {
        waitMs,
        nextMidnight: nextMidnight.toISOString(),
      });

      setTimeout(async () => {
        try {
          const cleanupDay = getUtc8DayString();
          const removedCount = await ugcService.cleanupMazeLeaderboardEntries(cleanupDay);
          logger.info('[Maze Cleanup] executed', { cleanupDay, removedCount });
        } catch (error) {
          logger.error('[Maze Cleanup] failed', error);
        } finally {
          scheduleMazeLeaderboardCleanup();
        }
      }, waitMs);
    };

    scheduleMazeLeaderboardCleanup();

    // 仅保留现有笔记缓存加载逻辑，不影响新 PG 存储
    await loadNotesFromDisk();

    await fastify.listen({ port: PORT, host: HOST });
    logger.info(`[Server] Listening on ${HOST}:${PORT}`);
  } catch (err: unknown) {
    logger.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('[Server] SIGTERM received, shutting down gracefully');
  await fastify.close();
  await closeRedisClient();
  process.exit(0);
});

startServer();

export { buildFastify };

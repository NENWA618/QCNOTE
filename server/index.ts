import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { initRedisClient, closeRedisClient } from './redis-client';
import { initPostgresClient } from './postgres-client';
import { UGCService } from './ugc-service';
import { RecommendationService } from './recommendation-service';
import { pushService } from './push-service';
import logger from '../lib/logger';
import { ForumService } from './forum-service';

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

let serverNotes: Note[] = [];
const NOTES_PERSIST_PATH = path.join(__dirname, '.notes-cache.json');

let ugcService: UGCService;
let recommendationService: RecommendationService;

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
  app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    request.startTime = Date.now();
    logger.info(`${request.method} ${request.url} - Start`);
    done();
  });

  app.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    const duration = Date.now() - (request.startTime || 0);
    logger.info(`${request.method} ${request.url} - ${reply.statusCode} - ${duration}ms`);
    done();
  });

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
          notes: serverNotes.length
        }
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      return reply.code(503).send({
        status: 'unhealthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
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
  app.post('/api/ugc/space/:userId/decoration', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const decoration = request.body;
      await ugcService.addDecoration(userId, decoration);
      reply.send({ success: true, message: 'Decoration added' });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

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
  app.get('/api/ugc/following/:followerId/:followeeId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { followerId, followeeId } = request.params;
      const following = await ugcService.isFollowing(followerId, followeeId);
      reply.send({ success: true, following });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // ==================== UGC 排行榜路由 ====================

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

  // ==================== 论坛路由 ====================

  // 获取用户角色
  app.get('/api/forum/roles', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, email } = request.query;
      const forumService = new ForumService(
        await initRedisClient(),
        await initPostgresClient()
      );

      // 优先使用 email，因为它比 userId 更可靠
      if (email && typeof email === 'string') {
        const role = await forumService.getUserRoleByEmail(email);
        return reply.send({
          success: true,
          role
        });
      } else if (userId && typeof userId === 'string') {
        // 备用：用户可以通过 userId 查询
        const role = await forumService.getUserRole(userId);
        return reply.send({
          success: true,
          role
        });
      } else {
        return reply.status(400).send({ 
          error: 'Missing email or userId parameter' 
        });
      }
    } catch (error) {
      logger.error('Get user role error:', error);
      reply.status(500).send({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // 修改用户角色
  app.put('/api/forum/roles', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, role } = request.body;

      if (!userId || !role) {
        return reply.status(400).send({ 
          error: 'Missing required fields' 
        });
      }

      if (!['user', 'moderator', 'admin'].includes(role)) {
        return reply.status(400).send({ 
          error: 'Invalid role' 
        });
      }

      const forumService = new ForumService(
        await initRedisClient(),
        await initPostgresClient()
      );

      // 设置用户角色（updatedBy 使用userId本身，因为这是代理调用）
      await forumService.setUserRole(userId, role, userId);

      reply.send({
        success: true,
        message: 'User role updated successfully'
      });
    } catch (error) {
      logger.error('Update user role error:', error);
      reply.status(500).send({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ==================== UGC 推荐路由 ====================

  // 获取个性化推荐
  app.get('/api/ugc/recommendations/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const limit = request.query.limit || 20;

      const recommendations = await recommendationService.recommendNotesForUser(userId, limit);

      reply.send({ success: true, recommendations });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

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
      const { title, body, icon, badge, tag, data, adminToken } = request.body;

      // 简单的管理员令牌验证
      if (adminToken !== process.env.ADMIN_TOKEN) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

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
      const { adminToken } = request.query;

      if (adminToken !== process.env.ADMIN_TOKEN) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

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


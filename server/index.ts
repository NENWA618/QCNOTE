import Fastify from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { initRedisClient, closeRedisClient } from './redis-client';
import { initPostgresClient } from './postgres-client';
import { UGCService } from './ugc-service';
import { RecommendationService } from './recommendation-service';

let logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
try {
  logger = require('../lib/logger');
} catch {
  logger = console;
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
  fastify.register(require('@fastify/cors'), { origin: true });
  registerRoutes(fastify);
  return fastify;
}

const fastify = buildFastify();

function registerRoutes(app: any) {
  if (app.__routesRegistered) return;
  app.__routesRegistered = true;

  // 请求监控中间件
  app.addHook('onRequest', (request: any, reply: any, done: any) => {
    request.startTime = Date.now();
    logger.info(`${request.method} ${request.url} - Start`);
    done();
  });

  app.addHook('onResponse', (request: any, reply: any, done: any) => {
    const duration = Date.now() - (request.startTime || 0);
    logger.info(`${request.method} ${request.url} - ${reply.statusCode} - ${duration}ms`);
    done();
  });

  // ==================== 原有路由 ====================
  app.post('/syncNote', async (request: any, reply: any) => {
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

  app.get('/api/health', async (request: any, reply: any) => {
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
  app.post('/api/ugc/user/init', async (request: any, reply: any) => {
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
  app.get('/api/ugc/user/:userId', async (request: any, reply: any) => {
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
  app.put('/api/ugc/user/:userId', async (request: any, reply: any) => {
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
  app.get('/api/ugc/space/:userId', async (request: any, reply: any) => {
    try {
      const { userId } = request.params;
      const space = await ugcService.getUserSpace(userId);
      reply.send({ success: true, space });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 更新虚拟空间
  app.put('/api/ugc/space/:userId', async (request: any, reply: any) => {
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
  app.post('/api/ugc/space/:userId/decoration', async (request: any, reply: any) => {
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
  app.get('/api/ugc/credit/:userId', async (request: any, reply: any) => {
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
  app.post('/api/ugc/follow', async (request: any, reply: any) => {
    try {
      const { followerId, followeeId } = request.body;
      await ugcService.followUser(followerId, followeeId);
      reply.send({ success: true, message: 'User followed' });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 取消关注
  app.post('/api/ugc/unfollow', async (request: any, reply: any) => {
    try {
      const { followerId, followeeId } = request.body;
      await ugcService.unfollowUser(followerId, followeeId);
      reply.send({ success: true, message: 'User unfollowed' });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
    }
  });

  // 检查是否关注
  app.get('/api/ugc/following/:followerId/:followeeId', async (request: any, reply: any) => {
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
  app.get('/api/ugc/leaderboard/:type', async (request: any, reply: any) => {
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
  app.get('/api/forum/roles', async (request: any, reply: any) => {
    try {
      const { userId } = request.query;
      const forumService = new (require('./forum-service').ForumService)(
        await initRedisClient(),
        await initPostgresClient()
      );

      if (userId && typeof userId === 'string') {
        // 查询特定用户的角色
        const role = await forumService.getUserRole(userId);
        return reply.send({
          success: true,
          role
        });
      } else {
        // 对于无userId的请求，返回默认角色
        // 注意：这通常应该从请求头或会话中获取userId
        // 但由于这是代理路由，前端应该已经处理了认证
        return reply.status(400).send({ 
          error: 'Missing userId parameter' 
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
  app.put('/api/forum/roles', async (request: any, reply: any) => {
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

      const forumService = new (require('./forum-service').ForumService)(
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
  app.get('/api/ugc/recommendations/:userId', async (request: any, reply: any) => {
    try {
      const { userId } = request.params;
      const limit = request.query.limit || 20;

      const recommendations = await recommendationService.recommendNotesForUser(userId, limit);

      reply.send({ success: true, recommendations });
    } catch (error) {
      reply.status(400).send({ success: false, error: (error as Error).message });
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

module.exports = { buildFastify };


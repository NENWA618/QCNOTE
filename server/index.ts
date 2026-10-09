import Fastify from 'fastify';
import type { FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { initRedisClient, closeRedisClient } from './redis-client';
import { initPostgresClient } from './postgres-client';
import { UGCService } from './ugc-service';
import logger from '../lib/logger';
import { setUgcService } from './context';
import { getSessionIdentity } from './session';
import { getNextUtc8Midnight, getUtc8DayString } from './utils';
import type { BackendRequest, ExtendedFastifyInstance } from './types';
import { registerCoreRoutes } from './routes/core';
import { registerUgcRoutes } from './routes/ugc';
import { registerLeaderboardRoutes } from './routes/leaderboard';
import { registerAdminRoutes } from './routes/admin';
import { registerPushRoutes } from './routes/push';
import { registerDeviceRoutes } from './routes/device';

const ALLOWED_ORIGINS = [process.env.NEXTAUTH_URL?.trim()].filter((origin): origin is string =>
  Boolean(origin),
);

if (ALLOWED_ORIGINS.length === 0) {
  logger.warn(
    '[CORS] NEXTAUTH_URL 未配置，当前将拒绝所有带 Origin 头的跨域请求。请确认环境变量已设置。',
  );
}

function buildFastify() {
  // 后端总是在反向代理（平台负载均衡 / 前端的 /api 代理）之后：不信任代理的话 request.ip
  // 永远是代理自己的地址，所有用户会共用同一个限流桶。前端代理只转发一个客户端 IP，
  // 平台负载均衡再把前端的地址追加在后面，所以最左边的才是客户端。
  const fastify = Fastify({ logger: true, bodyLimit: 256 * 1024, trustProxy: true });
  fastify.register(helmet);
  // 全局兜底限流；敏感接口在路由上用 config.rateLimit 收紧。
  // 已登录用户按 userId 计数（不受 X-Forwarded-For 伪造影响），匿名请求才退回到 IP
  fastify.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: async (request) => {
      const identity = await getSessionIdentity(request, { quiet: true });
      return identity ? `user:${identity.userId}` : request.ip;
    },
  });
  fastify.register(cors, {
    origin: (origin, callback) => {
      // 无 Origin 头的请求（如服务端调用、curl、同源请求）直接放行
      if (!origin) {
        callback(null, true);
        return;
      }
      if (ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      logger.warn('[CORS] 拒绝的来源', { origin });
      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  // 放进子作用域，保证限流插件先加载、其 onRoute 钩子能覆盖到所有路由
  fastify.register(async (scope) => {
    registerRoutes(scope as ExtendedFastifyInstance);
  });
  return fastify;
}

const fastify = buildFastify();

function registerRoutes(app: ExtendedFastifyInstance) {
  if (app.__routesRegistered) return;
  app.__routesRegistered = true;

  // 请求监控中间件
  app.addHook(
    'onRequest',
    (request: BackendRequest, reply: FastifyReply, done: (err?: Error) => void) => {
      request.startTime = Date.now();
      logger.info(`${request.method} ${request.url} - Start`);
      done();
    },
  );

  app.addHook(
    'onResponse',
    (request: BackendRequest, reply: FastifyReply, done: (err?: Error) => void) => {
      const duration = Date.now() - (request.startTime || 0);
      logger.info(`${request.method} ${request.url} - ${reply.statusCode} - ${duration}ms`);
      done();
    },
  );

  registerCoreRoutes(app);
  registerUgcRoutes(app);
  registerLeaderboardRoutes(app);
  registerAdminRoutes(app);
  registerPushRoutes(app);
  registerDeviceRoutes(app);
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
    const ugcService = new UGCService(redis, postgres);
    setUgcService(ugcService);
    ugcService.assertVaultMasterKeyConfigured();
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

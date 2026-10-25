import { initRedisClient, closeRedisClient } from './redis-client';
import { initPostgresClient } from './postgres-client';
import { UGCService } from './ugc-service';
import logger from '../lib/logger';
import { setUgcService } from './context';
import { getNextUtc8Midnight, getUtc8DayString } from './utils';
import { buildFastify } from './app';

const fastify = buildFastify();

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

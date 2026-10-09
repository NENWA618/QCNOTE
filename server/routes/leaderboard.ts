import type { FastifyReply } from 'fastify';
import type { BackendRequest, ExtendedFastifyInstance } from '../types';
import { getSessionUserId } from '../session';
import { clampLimit, getUtc8DayString } from '../utils';
import { initPostgresClient } from '../postgres-client';
import { getUgcService } from '../context';
import logger from '../../lib/logger';

export function registerLeaderboardRoutes(app: ExtendedFastifyInstance) {
  // ==================== UGC 排行榜路由 ====================

  // Maze leaderboard for current UTC+8 day
  app.get('/api/ugc/leaderboard/maze', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const utc8Ms = now.getTime() + (now.getTimezoneOffset() + 480) * 60000;
      const day = new Date(utc8Ms).toISOString().slice(0, 10);
      const leaderboardKey = `leaderboard:maze:${day}`;
      const leaderboard = await getUgcService().getGameLeaderboard(
        leaderboardKey,
        clampLimit(request.query.limit),
      );

      reply.send({
        success: true,
        leaderboard,
        day,
      });
    } catch (error) {
      reply.status(400).send({ success: false, error: 'Failed to load leaderboard' });
    }
  });

  // 获取排行榜
  app.get('/api/ugc/leaderboard/:type', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      const { type } = request.params;
      if (!/^[a-z0-9_-]{1,32}$/i.test(type)) {
        return reply.status(400).send({ success: false, error: 'Invalid leaderboard type' });
      }
      const limit = clampLimit(request.query.limit);

      const leaderboardKey = `leaderboard:${type}`;
      const leaderboard = await getUgcService().getLeaderboard(leaderboardKey, limit);

      reply.send({ success: true, leaderboard });
    } catch (error) {
      reply.status(400).send({ success: false, error: 'Failed to load leaderboard' });
    }
  });

  app.post(
    '/api/ugc/maze/submit',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request: BackendRequest, reply: FastifyReply) => {
      try {
        const userId = await getSessionUserId(request);
        logger.info('[Maze Submit] start', { userId });
        if (!userId) {
          logger.warn('[Maze Submit] unauthorized');
          return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        const { steps, timeMs } = request.body as {
          steps?: number;
          timeMs?: number;
        };

        if (
          typeof steps !== 'number' ||
          typeof timeMs !== 'number' ||
          !Number.isFinite(steps) ||
          !Number.isFinite(timeMs) ||
          steps < 1 ||
          steps > 100000 ||
          timeMs < 100 ||
          timeMs > 24 * 60 * 60 * 1000
        ) {
          return reply.status(400).send({ success: false, error: 'Invalid parameters' });
        }

        const normalizedSteps = Math.round(steps);
        const normalizedTimeMs = Math.round(timeMs);
        const day = getUtc8DayString();
        const leaderboardKey = `leaderboard:maze:${day}`;
        logger.info('[Maze Submit] checking existing submission', { leaderboardKey, userId });
        const alreadySubmitted = await getUgcService().hasGameSubmission(leaderboardKey, userId);
        logger.info('[Maze Submit] submission exists', {
          leaderboardKey,
          userId,
          alreadySubmitted,
        });

        const pool = await initPostgresClient();
        const userResult = await pool.query('SELECT id, username, image FROM users WHERE id = $1', [
          userId,
        ]);
        const user = userResult.rows[0];
        if (!user) {
          return reply.status(404).send({ success: false, error: 'User not found' });
        }

        logger.info('[Maze Submit] writing submission', { leaderboardKey, userId, steps, timeMs });
        await getUgcService().addGameSubmission(
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
        logger.error('[Maze Submit] failed', error);
        reply.status(400).send({ success: false, error: 'Failed to submit result' });
      }
    },
  );
}

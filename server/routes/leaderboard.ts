import type { FastifyReply } from 'fastify';
import type { BackendRequest, ExtendedFastifyInstance } from '../types';
import { getSessionUserId } from '../session';
import { clampLimit, getUtc8DayString } from '../utils';
import { initPostgresClient } from '../postgres-client';
import { getUgcService } from '../context';
import logger from '../../lib/logger';
import {
  MAZE_COLS,
  MAZE_ROWS,
  generateMaze,
  mulberry32,
  replayMazeMoves,
} from '../../lib/diejie/maze';

// One letter per step; far more than any real run of a 7×11 maze needs.
const MOVES_PATTERN = /^[NESW]{1,5000}$/;
// Movement is locked for the first 7 s of a run (the light preview).
const MIN_RUN_MS = 7000;

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

  // 开局：发放迷宫种子和签名的开局令牌，服务端从这一刻开始计时
  app.post(
    '/api/ugc/maze/start',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request: BackendRequest, reply: FastifyReply) => {
      try {
        const userId = await getSessionUserId(request);
        if (!userId) {
          return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }
        const { token, seed } = await getUgcService().createMazeRunToken(userId);
        reply.send({ success: true, token, seed, rows: MAZE_ROWS, cols: MAZE_COLS });
      } catch (error) {
        logger.error('[Maze Start] failed', error);
        reply.status(400).send({ success: false, error: 'Failed to start run' });
      }
    },
  );

  // 提交：用令牌里的种子重建迷宫并回放走法，步数和用时都由服务端得出
  app.post(
    '/api/ugc/maze/submit',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request: BackendRequest, reply: FastifyReply) => {
      try {
        const userId = await getSessionUserId(request);
        if (!userId) {
          logger.warn('[Maze Submit] unauthorized');
          return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        const { token, moves } = (request.body ?? {}) as { token?: unknown; moves?: unknown };
        if (typeof token !== 'string' || typeof moves !== 'string' || !MOVES_PATTERN.test(moves)) {
          return reply.status(400).send({ success: false, error: 'Invalid parameters' });
        }

        const run = await getUgcService().verifyMazeRunToken(userId, token);
        if (!run) {
          return reply.status(400).send({ success: false, error: 'Invalid or expired run' });
        }
        const steps = replayMazeMoves(
          generateMaze(MAZE_ROWS, MAZE_COLS, mulberry32(run.seed)),
          moves,
        );
        if (steps === null) {
          return reply.status(400).send({ success: false, error: 'Moves do not solve the maze' });
        }
        const timeMs = Date.now() - run.startedAt;
        if (timeMs < MIN_RUN_MS) {
          return reply.status(400).send({ success: false, error: 'Run finished too quickly' });
        }

        const day = getUtc8DayString();
        const leaderboardKey = `leaderboard:maze:${day}`;

        const pool = await initPostgresClient();
        const userResult = await pool.query('SELECT id, username, image FROM users WHERE id = $1', [
          userId,
        ]);
        const user = userResult.rows[0];
        if (!user) {
          return reply.status(404).send({ success: false, error: 'User not found' });
        }

        logger.info('[Maze Submit] writing submission', { leaderboardKey, userId, steps, timeMs });
        // addGameSubmission keeps the best steps and time of the day
        await getUgcService().addGameSubmission(
          leaderboardKey,
          userId,
          steps,
          timeMs,
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

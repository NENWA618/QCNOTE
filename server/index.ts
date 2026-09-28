import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { NextApiRequest } from 'next';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getToken } from 'next-auth/jwt';
import { initRedisClient, closeRedisClient } from './redis-client';
import { initPostgresClient } from './postgres-client';
import { UGCService } from './ugc-service';
import { pushService, type PushSubscription as ServerPushSubscription } from './push-service';
import { isAllowedPushEndpoint } from '../lib/pushEndpoint';
import { SESSION_COOKIE_NAME, USE_SECURE_COOKIES } from '../lib/authCookies';
import { INTERNAL_TOKEN_HEADER, isValidInternalApiToken } from '../lib/internalAuth';
import type { UserProfile } from '../types/ugc-types';
import logger from '../lib/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ExtendedFastifyInstance extends FastifyInstance {
  __routesRegistered?: boolean;
}

type BackendRequest<
  TBody extends object = Record<string, unknown>,
  TParams extends object = Record<string, string>,
  TQuery extends object = Record<string, string | undefined>,
> = FastifyRequest<{
  Params: TParams;
  Querystring: TQuery;
  Body: TBody;
}>;

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
const MAX_SERVER_NOTES = 1000;
const NOTES_PERSIST_PATH = path.join(__dirname, '.notes-cache.json');

let ugcService: UGCService;

type RequestWithRaw = Pick<FastifyRequest, 'raw'>;

interface SessionIdentity {
  userId: string;
  email: string | null;
}

async function getSessionIdentity(
  request: RequestWithRaw,
  { quiet = false }: { quiet?: boolean } = {},
): Promise<SessionIdentity | null> {
  try {
    const token = await getToken({
      req: {
        ...request.raw,
        cookies: parseCookieHeader(request.raw.headers.cookie as string | undefined),
      } as unknown as NextApiRequest,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: USE_SECURE_COOKIES,
      cookieName: SESSION_COOKIE_NAME,
    });

    if (!token || typeof token !== 'object') {
      // 不要记录 cookie 内容：其中包含会话令牌
      if (!quiet) {
        logger.warn('Session token missing or invalid', {
          hasCookie: Boolean(request.raw.headers.cookie),
        });
      }
      return null;
    }

    const userId = (token.id as string) || (token.sub as string) || null;
    if (!userId) {
      if (!quiet) logger.warn('Decoded token has no user id/sub');
      return null;
    }

    return { userId, email: typeof token.email === 'string' ? token.email : null };
  } catch (error) {
    if (!quiet) {
      logger.error('Failed to decode session token:', error, {
        hasCookie: Boolean(request.raw.headers.cookie),
        hasNextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
      });
    }
    return null;
  }
}

async function getSessionUserId(request: RequestWithRaw): Promise<string | null> {
  return (await getSessionIdentity(request))?.userId ?? null;
}

async function requireUser(
  request: RequestWithRaw,
  reply: FastifyReply,
): Promise<SessionIdentity | null> {
  const identity = await getSessionIdentity(request);
  if (!identity) {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
    return null;
  }
  return identity;
}

async function isAdminUser(userId: string): Promise<boolean> {
  const pool = await initPostgresClient();
  const result = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return result.rows[0]?.role === 'admin';
}

async function requireAdmin(request: BackendRequest, reply: FastifyReply): Promise<string | null> {
  const userId = await getSessionUserId(request);
  if (!userId) {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
    return null;
  }

  if (!(await isAdminUser(userId))) {
    reply.status(403).send({ success: false, error: 'Forbidden' });
    return null;
  }

  return userId;
}

function clampLimit(value: unknown, fallback = 50, max = 100): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function isHttpUrl(value: unknown, maxLength = 2048): value is string {
  if (typeof value !== 'string' || value.length > maxLength) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
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

  // ==================== 原有路由 ====================
  app.post('/syncNote', async (request: BackendRequest, reply: FastifyReply) => {
    // 该缓存不属于任何用户，仅管理员可写，避免被匿名灌数据
    const adminUserId = await requireAdmin(request, reply);
    if (!adminUserId) return;

    const note = request.body as Note | undefined;
    if (!note || !note.id || typeof note.id !== 'string' || note.id.length > 128) {
      return reply.status(200).send({ ok: false, message: 'Invalid note payload' });
    }

    const existingIndex = serverNotes.findIndex((item) => item.id === note.id);
    if (existingIndex >= 0) {
      serverNotes[existingIndex] = { ...serverNotes[existingIndex], ...note };
    } else {
      if (serverNotes.length >= MAX_SERVER_NOTES) {
        return reply.status(507).send({ ok: false, message: 'Note cache is full' });
      }
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

  app.get('/api/health', async (request: BackendRequest, reply: FastifyReply) => {
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
        error: 'Internal server error',
      });
    }
  });

  // ==================== UGC 用户路由 ====================

  // 获取或创建用户资料（仅供前端 NextAuth 登录回调以服务间令牌调用）
  app.post(
    '/api/ugc/user/init',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (
      request: BackendRequest<{ userId: string; email: string; username: string }>,
      reply: FastifyReply,
    ) => {
      if (
        !isValidInternalApiToken(
          request.headers[INTERNAL_TOKEN_HEADER],
          process.env.NEXTAUTH_SECRET,
        )
      ) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      try {
        const { userId, email, username } = request.body ?? {};
        if (
          typeof userId !== 'string' ||
          typeof email !== 'string' ||
          typeof username !== 'string' ||
          !userId ||
          userId.length > 256 ||
          email.length > 320 ||
          username.length > 100
        ) {
          return reply.status(400).send({ success: false, error: 'Invalid parameters' });
        }

        let profile = await ugcService.getUserProfile(userId);
        if (!profile) {
          profile = await ugcService.createUserProfile(userId, email, username);
        }
        reply.send({ success: true, profile });
      } catch (error) {
        logger.error('User init error:', error);
        reply.status(400).send({ success: false, error: 'Failed to initialize user' });
      }
    },
  );

  // 获取用户资料：本人返回完整资料；他人仅返回公开资料且不含邮箱
  app.get('/api/ugc/user/:userId', async (request: BackendRequest, reply: FastifyReply) => {
    const me = await requireUser(request, reply);
    if (!me) return;

    try {
      const { userId } = request.params;
      const profile = await ugcService.getUserProfile(userId);

      if (userId === me.userId) {
        return reply.send({ success: true, profile });
      }
      if (!profile || !profile.isPublic) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }
      const { email: _email, ...publicProfile } = profile;
      reply.send({ success: true, profile: publicProfile });
    } catch (error) {
      logger.error('Get user profile error:', error);
      reply.status(400).send({ success: false, error: 'Failed to load profile' });
    }
  });

  // 更新用户资料：只能改自己的，且只接受白名单字段（邮箱来自登录提供方，不可改）
  app.put(
    '/api/ugc/user/:userId',
    async (request: BackendRequest<Partial<UserProfile>>, reply: FastifyReply) => {
      const me = await requireUser(request, reply);
      if (!me) return;

      const { userId } = request.params;
      if (userId !== me.userId) {
        return reply.status(403).send({ success: false, error: 'Forbidden' });
      }

      try {
        const body = request.body ?? {};
        const updates: Partial<UserProfile> = {};
        if (body.username !== undefined) {
          if (
            typeof body.username !== 'string' ||
            !body.username.trim() ||
            body.username.length > 100
          ) {
            return reply.status(400).send({ success: false, error: 'Invalid username' });
          }
          updates.username = body.username.trim();
        }
        if (body.bio !== undefined) {
          if (typeof body.bio !== 'string' || body.bio.length > 1000) {
            return reply.status(400).send({ success: false, error: 'Invalid bio' });
          }
          updates.bio = body.bio;
        }
        if (body.avatar !== undefined) {
          if (!isHttpUrl(body.avatar)) {
            return reply.status(400).send({ success: false, error: 'Invalid avatar' });
          }
          updates.avatar = body.avatar;
        }
        if (body.isPublic !== undefined) {
          if (typeof body.isPublic !== 'boolean') {
            return reply.status(400).send({ success: false, error: 'Invalid isPublic' });
          }
          updates.isPublic = body.isPublic;
        }

        const updated = await ugcService.updateUserProfile(userId, updates);
        reply.send({ success: true, profile: updated });
      } catch (error) {
        logger.error('Update user profile error:', error);
        reply.status(400).send({ success: false, error: 'Failed to update profile' });
      }
    },
  );

  // ==================== UGC 排行榜路由 ====================

  // Maze leaderboard for current UTC+8 day
  app.get('/api/ugc/leaderboard/maze', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      const now = new Date();
      const utc8Ms = now.getTime() + (now.getTimezoneOffset() + 480) * 60000;
      const day = new Date(utc8Ms).toISOString().slice(0, 10);
      const leaderboardKey = `leaderboard:maze:${day}`;
      const leaderboard = await ugcService.getGameLeaderboard(
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
      const leaderboard = await ugcService.getLeaderboard(leaderboardKey, limit);

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
        const alreadySubmitted = await ugcService.hasGameSubmission(leaderboardKey, userId);
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
        logger.error('[Maze Submit] failed', error);
        reply.status(400).send({ success: false, error: 'Failed to submit result' });
      }
    },
  );

  // ==================== 后端管理路由 ====================

  app.get('/api/admin/users', async (request: BackendRequest, reply: FastifyReply) => {
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

      const users = usersResult.rows.map(
        (user: { id: string; name: string; email: string; role: string; created_at: string }) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.created_at,
        }),
      );

      reply.send({ success: true, users });
    } catch (error) {
      logger.error('Admin users error:', error);
      reply.status(500).send({ success: false, error: 'Internal server error' });
    }
  });

  app.get('/api/admin/stats', async (request: BackendRequest, reply: FastifyReply) => {
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
      reply.status(500).send({ success: false, error: 'Internal server error' });
    }
  });

  app.post('/api/admin/set-admin', async (request: BackendRequest, reply: FastifyReply) => {
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

  app.get('/api/sitemap.xml', async (request: BackendRequest, reply: FastifyReply) => {
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

      const allUrls: Array<{
        loc: string;
        priority: number;
        changefreq: string;
        lastmod?: string;
      }> = staticUrls;
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls.map((url) => `  <url>\n    <loc>${url.loc}</loc>\n${url.lastmod ? `    <lastmod>${url.lastmod}</lastmod>` : ''}\n${url.changefreq ? `    <changefreq>${url.changefreq}</changefreq>` : ''}\n${url.priority ? `    <priority>${url.priority}</priority>` : ''}\n  </url>`).join('\n')}\n</urlset>`;

      reply.header('Content-Type', 'application/xml').send(sitemapXml);
    } catch (error) {
      logger.error('Sitemap generation error:', error);
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

  // ==================== Web Push 通知路由 ====================

  // 订阅推送通知
  app.post(
    '/api/push/subscribe',
    async (request: BackendRequest<ServerPushSubscription>, reply: FastifyReply) => {
      try {
        const me = await requireUser(request, reply);
        if (!me) return;

        const subscription = request.body;
        if (
          !subscription?.keys ||
          typeof subscription.keys.p256dh !== 'string' ||
          typeof subscription.keys.auth !== 'string' ||
          !isAllowedPushEndpoint(subscription.endpoint)
        ) {
          return reply.status(400).send({ error: 'Invalid subscription data' });
        }

        await pushService.subscribe(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
          },
          me.userId,
        );
        reply.send({ success: true, message: 'Subscription saved' });
      } catch (error) {
        logger.error('Push subscribe error:', error);
        reply.status(500).send({ error: 'Failed to save subscription' });
      }
    },
  );

  // 取消订阅推送通知
  app.post(
    '/api/push/unsubscribe',
    async (request: BackendRequest<{ endpoint?: string }>, reply: FastifyReply) => {
      try {
        const me = await requireUser(request, reply);
        if (!me) return;

        const { endpoint } = request.body;
        if (!endpoint || typeof endpoint !== 'string') {
          return reply.status(400).send({ error: 'Missing endpoint' });
        }

        await pushService.unsubscribe(endpoint, me.userId);
        reply.send({ success: true, message: 'Unsubscribed' });
      } catch (error) {
        logger.error('Push unsubscribe error:', error);
        reply.status(500).send({ error: 'Failed to unsubscribe' });
      }
    },
  );

  // 广播推送通知（仅管理员）
  app.post('/api/push/broadcast', async (request: BackendRequest, reply: FastifyReply) => {
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
        data: data as Record<string, unknown> | undefined,
      });

      reply.send({ success: true, result });
    } catch (error) {
      logger.error('Push broadcast error:', error);
      reply.status(500).send({ error: 'Failed to broadcast notification' });
    }
  });

  // 获取推送统计信息（仅管理员）
  app.get('/api/push/stats', async (request: BackendRequest, reply: FastifyReply) => {
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

  app.post('/api/device/verify', async (request: BackendRequest, reply: FastifyReply) => {
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
      reply.status(500).send({ error: 'Failed to verify device' });
    }
  });

  app.post('/api/device/session/create', async (request: BackendRequest, reply: FastifyReply) => {
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
        error: 'Failed to create device session',
      });
    }
  });

  app.post('/api/device/session/validate', async (request: BackendRequest, reply: FastifyReply) => {
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
        error: 'Failed to validate device session',
      });
    }
  });

  app.post(
    '/api/device/reset',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: BackendRequest, reply: FastifyReply) => {
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
        reply.status(500).send({ error: 'Failed to reset device fingerprints' });
      }
    },
  );

  // ==================== 本地数据库加密 Vault Key 路由 ====================
  // 复用设备会话校验（与打开笔记库前必经的检查完全一致，不新增用户可感知的
  // 摩擦）：只有已登录 + 持有对应设备的有效 device session token 才能换取 KEK。

  app.post('/api/vault/key', async (request: BackendRequest, reply: FastifyReply) => {
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

      const kek = await ugcService.getOrCreateVaultKey(userId);
      reply.send({ success: true, kek: kek.toString('base64') });
    } catch (error) {
      logger.error('Vault key error:', error);
      reply.status(500).send({
        error: 'Failed to retrieve vault key',
      });
    }
  });
}

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

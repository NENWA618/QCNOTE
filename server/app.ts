// Builds the Fastify app (plugins, rate limiting, routes) without starting
// it or touching Redis/Postgres, so tests can import it with no side effects.
// index.ts is the entry point that initializes services and listens.
import Fastify from 'fastify';
import type { FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import logger from '../lib/logger';
import { getSessionIdentity } from './session';
import {
  CLIENT_IP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
  isValidClientIpSignature,
} from '../lib/internalAuth';
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

export function buildFastify() {
  // request.ip 只用于匿名请求的限流。只信任离后端最近的 TRUST_PROXY_HOPS 跳，从
  // X-Forwarded-For 的右边取地址：右边的条目是我们信任的负载均衡追加的，左边的
  // 是调用方自己写的。trustProxy: true 会取最左边，任何人直接访问后端时都能自带一个
  // X-Forwarded-For 冒充任意 IP。
  // 跳数设少了只是取到某个代理的地址（匿名请求合并计数）；设多了会采信调用方伪造的
  // 条目。所以默认 0、什么都不信任，由部署显式配置：Render 前面是 Cloudflare 加
  // Render 的负载均衡，共 2 跳（见 render.yaml，已用实测日志核对）。
  // （不能直接传数字：Fastify 5 把数字形式的 trustProxy 当作什么都不信任。）
  const configuredHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  const trustProxyHops =
    Number.isInteger(configuredHops) && configuredHops >= 0 ? configuredHops : 0;
  const fastify = Fastify({
    logger: true,
    bodyLimit: 256 * 1024,
    trustProxy: (_address: string, hop: number) => hop < trustProxyHops,
  });
  fastify.register(helmet);
  // 全局兜底限流；敏感接口在路由上用 config.rateLimit 收紧。
  // 已登录用户按 userId 计数；匿名请求按 IP：经前端代理来的请求用代理签过名的客户端
  // IP（否则所有人都是前端服务器这一个地址），其余用 request.ip。
  fastify.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: async (request) => {
      const identity = await getSessionIdentity(request, { quiet: true });
      if (identity) return `user:${identity.userId}`;
      const clientIp = request.headers[CLIENT_IP_HEADER];
      const signature = request.headers[CLIENT_IP_SIGNATURE_HEADER];
      if (isValidClientIpSignature(clientIp, signature, process.env.NEXTAUTH_SECRET)) {
        return `ip:${clientIp}`;
      }
      return `ip:${request.ip}`;
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

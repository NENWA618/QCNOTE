import type { FastifyReply } from 'fastify';
import type { BackendRequest, ExtendedFastifyInstance } from '../types';
import { getSessionIdentity } from '../session';
import { getUgcService } from '../context';
import logger from '../../lib/logger';

export function registerDeviceRoutes(app: ExtendedFastifyInstance) {
  // ==================== 设备会话令牌路由 ====================
  // 设备会话令牌绑定的是当前登录会话（一个账号同一时间只有一个有效会话，见
  // server/session.ts），不再校验浏览器指纹。

  app.post('/api/device/session/create', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      const identity = await getSessionIdentity(request);

      if (!identity) {
        logger.warn('Unauthenticated request to /api/device/session/create', {
          hasCookie: Boolean(request.headers.cookie),
          hasAuthorization: Boolean(request.headers.authorization),
        });
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const token = await getUgcService().createDeviceSessionToken(
        identity.userId,
        identity.sessionId,
      );
      reply.send({ success: true, token });
    } catch (error) {
      logger.error('Device session create error:', error);
      reply.status(500).send({
        error: 'Failed to create device session',
      });
    }
  });

  app.post('/api/device/session/validate', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      const { token } = request.body as { token?: string };
      const identity = await getSessionIdentity(request);

      if (!identity) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!token || typeof token !== 'string') {
        return reply.status(400).send({ error: 'Token is required' });
      }

      const valid = await getUgcService().verifyDeviceSessionToken(
        identity.userId,
        token,
        identity.sessionId,
      );
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

  // ==================== 本地数据库加密 Vault Key 路由 ====================
  // 复用设备会话校验（与打开笔记库前必经的检查完全一致，不新增用户可感知的
  // 摩擦）：只有已登录 + 持有当前登录会话签发的有效设备会话令牌才能换取 KEK。

  app.post('/api/vault/key', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      const { token } = request.body as { token?: string };
      const identity = await getSessionIdentity(request);

      if (!identity) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!token || typeof token !== 'string') {
        return reply.status(400).send({ error: 'Token is required' });
      }

      const valid = await getUgcService().verifyDeviceSessionToken(
        identity.userId,
        token,
        identity.sessionId,
      );
      if (!valid) {
        return reply
          .status(403)
          .send({ success: false, error: 'Invalid or expired device session token' });
      }

      const kek = await getUgcService().getOrCreateVaultKey(identity.userId);
      reply.send({ success: true, kek: kek.toString('base64') });
    } catch (error) {
      logger.error('Vault key error:', error);
      reply.status(500).send({
        error: 'Failed to retrieve vault key',
      });
    }
  });
}

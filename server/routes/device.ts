import type { FastifyReply } from 'fastify';
import type { BackendRequest, ExtendedFastifyInstance } from '../types';
import { getSessionUserId } from '../session';
import { getUgcService } from '../context';
import logger from '../../lib/logger';

export function registerDeviceRoutes(app: ExtendedFastifyInstance) {
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

      const verification = await getUgcService().verifyDeviceFingerprint(userId, fingerprint);
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

      const verification = await getUgcService().verifyDeviceFingerprint(userId, fingerprint);
      if (!verification.allowed) {
        return reply.status(403).send({
          success: false,
          error: 'Device fingerprint not recognized',
          code: 'DEVICE_MISMATCH',
          firstTime: false,
        });
      }

      const token = await getUgcService().createDeviceSessionToken(userId, fingerprint);
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

      const valid = await getUgcService().verifyDeviceSessionToken(userId, token, fingerprint);
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
        await getUgcService().resetDeviceFingerprints(userId);
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

      const valid = await getUgcService().verifyDeviceSessionToken(userId, token, fingerprint);
      if (!valid) {
        return reply
          .status(403)
          .send({ success: false, error: 'Invalid or expired device session token' });
      }

      const kek = await getUgcService().getOrCreateVaultKey(userId);
      reply.send({ success: true, kek: kek.toString('base64') });
    } catch (error) {
      logger.error('Vault key error:', error);
      reply.status(500).send({
        error: 'Failed to retrieve vault key',
      });
    }
  });
}

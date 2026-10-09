import type { FastifyReply } from 'fastify';
import type { BackendRequest, ExtendedFastifyInstance } from '../types';
import { requireUser, requireAdmin } from '../session';
import { pushService, type PushSubscription as ServerPushSubscription } from '../push-service';
import { isAllowedPushEndpoint } from '../../lib/pushEndpoint';
import logger from '../../lib/logger';

export function registerPushRoutes(app: ExtendedFastifyInstance) {
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
}

import { getPostgresClient } from './postgres-client';
import webpush from 'web-push';
import { isAllowedPushEndpoint } from '../lib/pushEndpoint';

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** The HTTP status a push service answered with, from web-push's WebPushError. */
function pushErrorStatusCode(error: unknown): number | undefined {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}

/**
 * True when the push service says the subscription no longer exists (404 or
 * 410), so it should be deleted. web-push reports this only in `statusCode`;
 * the message is always "Received unexpected response code".
 */
export function isGoneSubscriptionError(error: unknown): boolean {
  const statusCode = pushErrorStatusCode(error);
  return statusCode === 404 || statusCode === 410;
}

/** How many pushes a broadcast has in flight at once. */
const BROADCAST_CONCURRENCY = 10;

export class PushService {
  private isConfigured = false;

  constructor() {
    // Configure web-push with VAPID details
    const vapidPublicKey = process.env.VAPID_PUBLIC;
    const vapidPrivateKey = process.env.VAPID_PRIVATE;

    if (vapidPublicKey && vapidPrivateKey) {
      try {
        webpush.setVapidDetails(
          `mailto:${process.env.ADMIN_SET_EMAIL || 'admin@example.com'}`,
          vapidPublicKey,
          vapidPrivateKey,
        );
        this.isConfigured = true;
        console.log('✓ Web Push VAPID configured successfully');
      } catch (error) {
        console.warn(
          '⚠ Failed to configure VAPID:',
          error instanceof Error ? error.message : String(error),
        );
        console.warn(
          '⚠ Web Push notifications will be disabled. Configure VAPID_PUBLIC and VAPID_PRIVATE env vars.',
        );
      }
    } else {
      console.warn('⚠ VAPID_PUBLIC and/or VAPID_PRIVATE environment variables not set');
      console.warn('⚠ Web Push notifications are disabled');
    }
  }

  /**
   * Check if push service is configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Save a push subscription to database
   */
  async subscribe(subscription: PushSubscription, userId?: string): Promise<void> {
    const client = getPostgresClient();

    try {
      const query = `
        INSERT INTO push_subscriptions (endpoint, keys, user_id, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (endpoint) DO UPDATE 
        SET keys = EXCLUDED.keys, updated_at = NOW(), user_id = EXCLUDED.user_id
      `;

      await client.query(query, [
        subscription.endpoint,
        JSON.stringify(subscription.keys),
        userId || null,
      ]);

      console.log(`✓ Push subscription saved: ${subscription.endpoint}`);
    } catch (error) {
      console.error('Failed to save push subscription:', error);
      throw error;
    }
  }

  /**
   * Remove a push subscription from database
   */
  async unsubscribe(endpoint: string, userId?: string): Promise<void> {
    const client = getPostgresClient();

    try {
      // 带 userId 时只允许删除自己的订阅；不带（服务端清理失效端点）则按端点删除
      if (userId) {
        await client.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [
          endpoint,
          userId,
        ]);
      } else {
        await client.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
      }
      console.log(`✓ Push subscription removed: ${endpoint}`);
    } catch (error) {
      console.error('Failed to remove push subscription:', error);
      throw error;
    }
  }

  /**
   * Get all active subscriptions. Throws if they can't be read, so a database
   * failure is never reported as "nobody is subscribed".
   */
  async getAllSubscriptions(): Promise<PushSubscription[]> {
    const client = getPostgresClient();

    try {
      const query = 'SELECT endpoint, keys FROM push_subscriptions ORDER BY created_at DESC';
      const result = await client.query(query);

      return result.rows
        .filter((row: { endpoint: string }) => isAllowedPushEndpoint(row.endpoint))
        .map((row: { endpoint: string; keys: PushSubscription['keys'] | string }) => ({
          endpoint: row.endpoint,
          // keys 列是 JSONB，pg 会直接返回对象；兼容旧数据里以字符串存储的情况
          keys:
            typeof row.keys === 'string'
              ? (JSON.parse(row.keys) as PushSubscription['keys'])
              : row.keys,
        }));
    } catch (error) {
      console.error('Failed to retrieve push subscriptions:', error);
      throw error;
    }
  }

  /**
   * Send push notification to all subscribers
   */
  async broadcastNotification(
    title: string,
    options?: {
      body?: string;
      icon?: string;
      badge?: string;
      tag?: string;
      data?: Record<string, unknown>;
    },
  ): Promise<{
    success: number;
    failed: number;
    errors: Array<{ endpoint: string; error: string }>;
  }> {
    if (!this.isConfigured) {
      console.warn('⚠ Push notification service not configured. Skipping broadcast.');
      return { success: 0, failed: 0, errors: [] };
    }

    const subscriptions = await this.getAllSubscriptions();
    const notificationPayload = JSON.stringify({
      title,
      ...options,
    });

    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ endpoint: string; error: string }> = [];

    // A few workers share the list: sending one by one takes minutes once
    // there are hundreds of subscribers, and the request times out.
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < subscriptions.length) {
        const subscription = subscriptions[nextIndex++];
        const error = await this.sendOne(subscription, notificationPayload);
        if (error) {
          failedCount++;
          errors.push({ endpoint: subscription.endpoint, error });
        } else {
          successCount++;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(BROADCAST_CONCURRENCY, subscriptions.length) }, worker),
    );

    console.log(`📢 Broadcast notification sent. Success: ${successCount}, Failed: ${failedCount}`);

    return { success: successCount, failed: failedCount, errors };
  }

  /**
   * Sends one push; returns null on success, else a readable error message.
   * Deletes the subscription if the push service says it no longer exists.
   */
  private async sendOne(subscription: PushSubscription, payload: string): Promise<string | null> {
    try {
      await webpush.sendNotification(subscription, payload);
      return null;
    } catch (error) {
      const statusCode = pushErrorStatusCode(error);
      const message = error instanceof Error ? error.message : String(error);
      const errorMsg = statusCode ? `${message} (HTTP ${statusCode})` : message;
      console.warn(`⚠ Push to ${subscription.endpoint} failed: ${errorMsg}`);

      if (isGoneSubscriptionError(error)) {
        await this.unsubscribe(subscription.endpoint).catch(() => {
          // Ignore cleanup errors
        });
      }
      return errorMsg;
    }
  }
}

export const pushService = new PushService();

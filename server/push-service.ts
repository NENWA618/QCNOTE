import { getPostgresClient } from './postgres-client';
import webpush from 'web-push';

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

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
        SET updated_at = NOW(), user_id = EXCLUDED.user_id
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
  async unsubscribe(endpoint: string): Promise<void> {
    const client = getPostgresClient();

    try {
      const query = 'DELETE FROM push_subscriptions WHERE endpoint = $1';
      await client.query(query, [endpoint]);
      console.log(`✓ Push subscription removed: ${endpoint}`);
    } catch (error) {
      console.error('Failed to remove push subscription:', error);
      throw error;
    }
  }

  /**
   * Get all active subscriptions
   */
  async getAllSubscriptions(): Promise<PushSubscription[]> {
    const client = getPostgresClient();

    try {
      const query = 'SELECT endpoint, keys FROM push_subscriptions ORDER BY created_at DESC';
      const result = await client.query(query);

      return result.rows.map((row) => ({
        endpoint: row.endpoint,
        keys: JSON.parse(row.keys),
      }));
    } catch (error) {
      console.error('Failed to retrieve push subscriptions:', error);
      return [];
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

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(subscription, notificationPayload);
        successCount++;
      } catch (error) {
        failedCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Remove subscription if endpoint is invalid
        if (
          errorMsg.includes('410') ||
          errorMsg.includes('invalid') ||
          errorMsg.includes('expired')
        ) {
          await this.unsubscribe(subscription.endpoint).catch(() => {
            // Ignore cleanup errors
          });
        }

        errors.push({
          endpoint: subscription.endpoint,
          error: errorMsg,
        });
      }
    }

    console.log(`📢 Broadcast notification sent. Success: ${successCount}, Failed: ${failedCount}`);

    return { success: successCount, failed: failedCount, errors };
  }
}

export const pushService = new PushService();

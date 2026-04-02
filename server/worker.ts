import { Worker } from 'bullmq';
import path from 'path';
import logger from '../lib/logger';
import pushModule from './push';
import IORedis from 'ioredis';

const connectionString = process.env.REDIS_URL || process.env.REDIS || 'redis://127.0.0.1:6379';
let connection: IORedis | null;
try {
  connection = new IORedis(connectionString);
} catch (e) {
  logger.warn('[Worker] Redis connection failed:', e instanceof Error ? e.message : e);
  connection = null;
}

export async function startWorker() {
  if (!connection) {
    logger.info('[Worker] No Redis connection; worker not started');
    return null;
  }

  const worker = new Worker('reminders', async (job: any) => {
    try {
      const data = (job.data || {}) as Record<string, unknown>;
      if (pushModule && typeof pushModule.sendNotificationToSubscription === 'function') {
        const fs = await import('fs/promises');
        const p = path.join(__dirname, '.subscriptions.json');
        let subs: Array<{ subscription?: unknown }> = [];
        try {
          const raw = await fs.readFile(p, 'utf-8');
          subs = JSON.parse(raw);
        } catch (e) {
          subs = [];
        }
        const payload = { title: (data.title as string) || '提醒', body: (data.body as string) || '', data: { reminderId: data.id } };
        for (const s of subs) {
          if (!s.subscription) continue;
          await pushModule.sendNotificationToSubscription(s.subscription, payload);
        }
        logger.info('[Worker] Delivered reminder via queue', data.id);
      } else {
        logger.warn('[Worker] pushModule not available to deliver reminder');
      }
    } catch (e) {
      logger.warn('[Worker] job failed', e instanceof Error ? e.message : e);
      throw e;
    }
  }, { connection });

  worker.on('completed', (job: any) => logger.info('[Worker] job completed', job.id));
  worker.on('failed', (job: any, err: any) => logger.warn('[Worker] job failed', job.id, err instanceof Error ? err.message : err));
  logger.info('[Worker] started');
  return worker;
}

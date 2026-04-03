let Worker: any, IORedis: any;
try {
  const bullmq = require('bullmq');
  Worker = bullmq.Worker;
} catch (e) {
  // bullmq is optional
}

try {
  IORedis = require('ioredis');
} catch (e) {
  // ioredis is optional
}

const path = require('path');
const logger = require('../lib/logger');

let pushModule: any;
try {
  pushModule = require('./push');
} catch (e) {
  // push module optional
}

const connectionString = process.env.REDIS_URL || process.env.REDIS || 'redis://127.0.0.1:6379';
let connection: any;
try {
  connection = IORedis ? new IORedis(connectionString) : null;
  if (connection) {
    connection.on('error', (err: unknown) => {
      logger.warn('[Worker] Redis connection error (ignored):', err instanceof Error ? err.message : err);
    });
  }
} catch (e) {
  logger.warn('[Worker] Redis connection failed:', e instanceof Error ? e.message : e);
  connection = null;
}

export async function startWorker() {
  if (!connection || !Worker) {
    logger.info('[Worker] No Redis connection or Worker module; worker not started');
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

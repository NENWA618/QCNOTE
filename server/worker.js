const { Worker } = require('bullmq');
const path = require('path');
const logger = require('../lib/logger');
const pushModule = require(path.resolve(__dirname, './push'));
const IORedis = require('ioredis');

const connectionString = process.env.REDIS_URL || process.env.REDIS || 'redis://127.0.0.1:6379';
let connection;
try {
  connection = new IORedis(connectionString);
} catch (e) {
  logger.warn('[Worker] Redis connection failed:', e && e.message);
  connection = null;
}

function startWorker() {
  if (!connection) {
    logger.info('[Worker] No Redis connection; worker not started');
    return null;
  }
  const worker = new Worker('reminders', async (job) => {
    try {
      const data = job.data || {};
      // call push deliver for this single reminder
      if (pushModule && typeof pushModule.sendNotificationToSubscription === 'function') {
        const subs = await (async () => {
          const fs = require('fs').promises;
          const p = path.join(__dirname, '.subscriptions.json');
          try { const s = await fs.readFile(p, 'utf-8'); return JSON.parse(s); } catch (e) { return []; }
        })();
        const payload = { title: data.title || '提醒', body: data.body || '', data: { reminderId: data.id } };
        for (const s of subs) {
          if (!s.subscription) continue;
          await pushModule.sendNotificationToSubscription(s.subscription, payload);
        }
        logger.info('[Worker] Delivered reminder via queue', data.id);
      } else {
        logger.warn('[Worker] pushModule not available to deliver reminder');
      }
    } catch (e) {
      logger.warn('[Worker] job failed', e && e.message);
      throw e;
    }
  }, { connection });
  worker.on('completed', (job) => logger.info('[Worker] job completed', job.id));
  worker.on('failed', (job, err) => logger.warn('[Worker] job failed', job.id, err && err.message));
  logger.info('[Worker] started');
  return worker;
}

module.exports = { startWorker };

let Queue: any, QueueScheduler: any, IORedis: any;
try {
  const bullmq = require('bullmq');
  Queue = bullmq.Queue;
  QueueScheduler = bullmq.QueueScheduler;
} catch (e) {
  // bullmq is optional
}

try {
  IORedis = require('ioredis');
} catch (e) {
  // ioredis is optional
}

const logger = require('../lib/logger');
const connectionString = process.env.REDIS_URL || process.env.REDIS || 'redis://127.0.0.1:6379';
let connection: any;
try {
  connection = IORedis ? new IORedis(connectionString) : null;
  if (connection) {
    connection.on('error', (err: unknown) => {
      logger.warn('[Queue] Redis connection error (ignored):', err instanceof Error ? err.message : err);
    });
  }
} catch (e) {
  logger.warn('[Queue] Failed to create Redis connection:', e instanceof Error ? e.message : e);
  connection = null;
}

let reminderQueue: any = null;
let reminderScheduler: any = null;

export function initQueue() {
  if (!connection) return null;
  reminderQueue = new Queue('reminders', { connection });
  reminderScheduler = new QueueScheduler('reminders', { connection });
  logger.info('[Queue] Initialized reminders queue');
  return { reminderQueue, reminderScheduler };
}

export function getQueue() {
  return reminderQueue;
}

import { Queue, QueueScheduler } from 'bullmq';
import IORedis from 'ioredis';
import logger from '../lib/logger';

const connectionString = process.env.REDIS_URL || process.env.REDIS || 'redis://127.0.0.1:6379';
let connection: IORedis | null;
try {
  connection = new IORedis(connectionString);
} catch (e) {
  logger.warn('[Queue] Failed to create Redis connection:', e instanceof Error ? e.message : e);
  connection = null;
}

let reminderQueue: Queue | null = null;
let reminderScheduler: QueueScheduler | null = null;

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

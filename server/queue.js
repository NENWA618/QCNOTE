const { Queue, QueueScheduler } = require('bullmq');
const IORedis = require('ioredis');
const path = require('path');
const logger = require('../lib/logger');

const connectionString = process.env.REDIS_URL || process.env.REDIS || 'redis://127.0.0.1:6379';
let connection;
try {
  connection = new IORedis(connectionString);
} catch (e) {
  logger.warn('[Queue] Failed to create Redis connection:', e && e.message);
  connection = null;
}

let reminderQueue = null;
let reminderScheduler = null;
function initQueue() {
  if (!connection) return null;
  reminderQueue = new Queue('reminders', { connection });
  // scheduler to handle delayed jobs reliably
  reminderScheduler = new QueueScheduler('reminders', { connection });
  logger.info('[Queue] Initialized reminders queue');
  return { reminderQueue, reminderScheduler };
}

module.exports = { initQueue, getQueue: () => reminderQueue };

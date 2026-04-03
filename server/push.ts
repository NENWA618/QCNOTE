// server/push.ts - Push notification and reminder module

import logger from '../lib/logger';

interface Reminder {
  id: string;
  message: string;
  time: number; // timestamp
  userId?: string;
}

let reminders: Reminder[] = [];
let reminderInterval: NodeJS.Timeout | null = null;

export function registerRoutes(app: any) {
  // Register push-related routes
  app.post('/api/push/reminder', async (request: any, reply: any) => {
    const body = request.body as { message: string; time: number } | undefined;
    if (!body || !body.message || !body.time) {
      return reply.status(400).send({ error: 'message and time required' });
    }

    const reminder: Reminder = {
      id: Date.now().toString(),
      message: body.message,
      time: body.time,
    };

    reminders.push(reminder);
    logger.info(`[Push] Reminder scheduled: ${reminder.message} at ${new Date(reminder.time)}`);

    return { success: true, id: reminder.id };
  });

  app.get('/api/push/reminders', async () => {
    return reminders.filter(r => r.time > Date.now());
  });

  app.delete('/api/push/reminder/:id', async (request: any, reply: any) => {
    const id = request.params.id;
    const index = reminders.findIndex(r => r.id === id);
    if (index === -1) {
      return reply.status(404).send({ error: 'Reminder not found' });
    }

    reminders.splice(index, 1);
    return { success: true };
  });
}

export function startReminderLoop() {
  if (reminderInterval) return; // Already running

  reminderInterval = setInterval(() => {
    const now = Date.now();
    const dueReminders = reminders.filter(r => r.time <= now);

    dueReminders.forEach(reminder => {
      logger.info(`[Push] Reminder triggered: ${reminder.message}`);
      // Here you could integrate with actual push services like FCM, APNs, etc.
      // For now, just log
    });

    // Remove triggered reminders
    reminders = reminders.filter(r => r.time > now);
  }, 60000); // Check every minute

  logger.info('[Push] Reminder loop started');
}

export function stopReminderLoop() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    logger.info('[Push] Reminder loop stopped');
  }
}
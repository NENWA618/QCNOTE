const fs = require('fs').promises;
const path = require('path');
const webpush = require('web-push');
const logger = require('../lib/logger');

const SUBS_PATH = path.join(__dirname, '.subscriptions.json');
const REM_PATH = path.join(__dirname, '.reminders.json');

function loadJson(p) {
  return fs.readFile(p, 'utf-8').then((s) => JSON.parse(s)).catch(() => null);
}
function saveJson(p, data) {
  return fs.writeFile(p, JSON.stringify(data || [], null, 2), 'utf-8').catch(() => {});
}

function ensureVapid() {
  const pub = process.env.VAPID_PUBLIC;
  const priv = process.env.VAPID_PRIVATE;
  if (!pub || !priv) {
    logger.warn('[Push] VAPID keys not configured; push will not work until VAPID_PUBLIC and VAPID_PRIVATE are set');
    return false;
  }
  try {
    webpush.setVapidDetails('mailto:admin@example.com', pub, priv);
    return true;
  } catch (e) {
    logger.warn('[Push] Failed to set VAPID keys:', e && e.message);
    return false;
  }
}

async function registerRoutes(fastify) {
  const vapidReady = ensureVapid();
  if (!vapidReady) {
    logger.warn('[Push] Skipping push routes; VAPID not configured');
    return;
  }
  // try to use Redis-backed queue if available
  let queueModule = null;
  try {
    queueModule = require(path.resolve(__dirname, './queue'));
    if (queueModule && typeof queueModule.initQueue === 'function') queueModule.initQueue();
  } catch (e) {
    // ignore
  }

  fastify.post('/push/subscribe', async (request, reply) => {
    const sub = request.body;
    if (!sub || !sub.endpoint) return { ok: false, message: 'Invalid subscription' };
    const all = (await loadJson(SUBS_PATH)) || [];
    // dedupe by endpoint
    const exists = all.find((s) => s.endpoint === sub.endpoint);
    if (!exists) {
      all.push({ subscription: sub, createdAt: Date.now() });
      await saveJson(SUBS_PATH, all);
      logger.info('[Push] Saved new subscription');
    }
    return { ok: true };
  });

  fastify.post('/push/unsubscribe', async (request, reply) => {
    const { endpoint } = request.body || {};
    if (!endpoint) return { ok: false };
    const all = (await loadJson(SUBS_PATH)) || [];
    const next = all.filter((s) => s.subscription && s.subscription.endpoint !== endpoint);
    await saveJson(SUBS_PATH, next);
    return { ok: true };
  });

  fastify.post('/reminders', async (request, reply) => {
    const r = request.body || {};
    if (!r || !r.targetAt) return reply.code(400).send({ ok: false, message: 'invalid' });
    const id = `r_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const rec = { id, title: r.title || '提醒', body: r.body || '', targetAt: r.targetAt, tz: r.tz || null, noteId: r.noteId || null, status: 'scheduled', createdAt: Date.now() };
    // if queue available, enqueue job with delay
    try {
      const q = queueModule && queueModule.getQueue && queueModule.getQueue();
      if (q) {
        const delay = Math.max(0, new Date(rec.targetAt).getTime() - Date.now());
        await q.add('reminder', rec, { delay });
        logger.info('[Push] Enqueued reminder', rec.id, 'delay', delay);
        return { ok: true, id };
      }
    } catch (e) {
      logger.warn('[Push] enqueue failed, fallback to file store', e && e.message);
    }
    // fallback: file store and let local loop handle delivery
    const all = (await loadJson(REM_PATH)) || [];
    all.push(rec);
    await saveJson(REM_PATH, all);
    logger.info('[Push] Scheduled reminder (fallback)', rec.id, rec.targetAt);
    return { ok: true, id };
  });

  fastify.get('/reminders', async (request, reply) => {
    const all = (await loadJson(REM_PATH)) || [];
    return all;
  });

  fastify.delete('/reminders/:id', async (request, reply) => {
    const id = request.params.id;
    let all = (await loadJson(REM_PATH)) || [];
    const next = all.filter((r) => r.id !== id);
    await saveJson(REM_PATH, next);
    return { ok: true };
  });
}

async function sendNotificationToSubscription(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (e) {
    logger.warn('[Push] sendNotification failed', e && e.message);
    return false;
  }
}

async function deliverDueReminders() {
  const subs = (await loadJson(SUBS_PATH)) || [];
  const rems = (await loadJson(REM_PATH)) || [];
  const now = Date.now();
  const due = rems.filter((r) => r.status === 'scheduled' && new Date(r.targetAt).getTime() <= now);
  if (due.length === 0) return;
  for (const r of due) {
    const payload = { title: r.title || '提醒', body: r.body || '', data: { reminderId: r.id } };
    for (const s of subs) {
      if (!s.subscription) continue;
      await sendNotificationToSubscription(s.subscription, payload);
    }
    // mark as sent
    r.status = 'sent';
    r.sentAt = Date.now();
  }
  await saveJson(REM_PATH, rems);
  logger.info('[Push] Delivered reminders:', due.map((d) => d.id).join(','));
}

let _interval = null;
function startReminderLoop() {
  if (_interval) return;
  // run every 30 seconds; simple reliable loop for prototype
  _interval = setInterval(() => {
    deliverDueReminders().catch((e) => logger.warn('[Push] deliver error', e && e.message));
  }, 30 * 1000);
  logger.info('[Push] Reminder loop started');
}

module.exports = { registerRoutes, startReminderLoop, deliverDueReminders };

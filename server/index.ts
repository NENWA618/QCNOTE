import Fastify from 'fastify';
import fs from 'fs/promises';
import path from 'path';

let logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
try {
  logger = require('../lib/logger');
} catch {
  logger = console;
}

interface Note {
  id: string;
  title?: string;
  content?: string;
  [key: string]: unknown;
}

let serverNotes: Note[] = [];
const NOTES_PERSIST_PATH = path.join(__dirname, '.notes-cache.json');

function buildFastify() {
  const fastify = Fastify({ logger: true });
  fastify.register(require('@fastify/cors'), { origin: true });
  registerRoutes(fastify);
  return fastify;
}

const fastify = buildFastify();

function registerRoutes(app: any) {
  if (app.__routesRegistered) return;
  app.__routesRegistered = true;

  app.post('/syncNote', async (request: any, reply: any) => {
    const note = request.body as Note | undefined;
    if (!note || !note.id || typeof note.id !== 'string') {
      return reply.status(200).send({ ok: false, message: 'Invalid note payload' });
    }

    const existingIndex = serverNotes.findIndex((item) => item.id === note.id);
    if (existingIndex >= 0) {
      serverNotes[existingIndex] = { ...serverNotes[existingIndex], ...note };
    } else {
      serverNotes.push(note);
    }

    await saveNotesToDisk();
    return { ok: true, message: `Note ${note.id} synced` };
  });

  app.get('/stats', async () => {
    return {
      totalNotes: serverNotes.length,
      persisted: true,
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/api/health', async (request: any, reply: any) => {
    return reply.code(200).send({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      notes: serverNotes.length,
    });
  });
}

registerRoutes(fastify);

async function loadNotesFromDisk(): Promise<void> {
  try {
    const data = await fs.readFile(NOTES_PERSIST_PATH, 'utf-8');
    serverNotes = JSON.parse(data) as Note[];
    logger.info(`[Server] Loaded ${serverNotes.length} notes from disk`);
  } catch (e) {
    logger.info('[Server] No persisted notes found; starting with an empty note list');
  }
}

async function saveNotesToDisk(): Promise<void> {
  try {
    await fs.writeFile(NOTES_PERSIST_PATH, JSON.stringify(serverNotes, null, 2), 'utf-8');
    logger.info('[Server] Notes persisted to disk');
  } catch (e) {
    logger.warn('[Server] Failed to persist notes:', e);
  }
}

const PORT = Number(process.env.PORT || process.env.REDIRECT_PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

loadNotesFromDisk()
  .then(() => fastify.listen({ port: PORT, host: HOST }))
  .then(() => {
    logger.info(`[Server] listening on ${HOST}:${PORT}`);
  })
  .catch((err: unknown) => {
    logger.error('[Server] failed to start', err);
    process.exit(1);
  });

module.exports = { buildFastify };

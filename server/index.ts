import Fastify from 'fastify';
import fs from 'fs/promises';
import path from 'path';

// logger is optional; in tests we may not have a real implementation
let logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
try {
  logger = require('../lib/logger');
} catch (e) {
  logger = console;
}

import vector from './vector';
import sentiment from './sentiment';
import AIService from './aiService';
import { rateLimitMiddleware, apiKeyMiddleware, startRateLimitCleanup } from './middleware';

interface Note { id: string; title: string; content: string; }
interface IndexState { lunr: any | null; vectors: Record<string, Record<string, number>>; sentiments: Record<string, unknown>; }

let serverNotes: Note[] = [];
let serverIndex: IndexState = { lunr: null, vectors: {}, sentiments: {} };

const NOTES_PERSIST_PATH = path.join(__dirname, '.notes-cache.json');

const DEFAULT_PERSONA = {
  id: 'waifu_character',
  name: '看板娘',
  displayName: 'Waifu',
  ageRange: '20s',
  style: '活泼可爱，智能陪伴',
  colors: { primary: '#ff69b4', hair: '#ffb6c1', outfit: '#ffe4e1' },
  shortBio: 'Live2D看板娘，通过你的笔记来了解你，陪伴你探索知识的世界。',
  greetings: ['こんにちは！私は看板娘です。', '今日も一緒に頑張りましょう！', 'また会えて嬉しいです。'],
  happyReplies: ['それはいいですね！楽しそうですね。', 'あなたの喜びが私にも伝わってきます。'],
  sadReplies: ['そうですか。でも大丈夫、ここにいますよ。', '一緒に頑張りましょう。'],
  playfulReplies: ['ふふふ、面白いですね。', 'そのような考えもいいですね。'],
  fallbackReplies: ['えっと...何かお話しましょうか？', 'どうぞ、聞きますよ。', 'それは興味深いです。'],
  templates: {
    noNotes: 'まだメモがありませんね。これから一緒に記録していきましょう。',
    summary: (total: number, topTag?: string, topCat?: string) => {
      let s = `あなたは ${total} 個のメモを持っています`;
      if (topTag) s += `。最も使うタグは「${topTag}」ですね`;
      if (topCat) s += `。主に ${topCat} に関することが多いようです`;
      s += '。';
      return s;
    },
  },
};

function buildFastify() {
  const fastify = Fastify({ logger: true });
  fastify.register(require('@fastify/cors'), { origin: true });
  
  // Register security middleware
  rateLimitMiddleware(fastify);
  apiKeyMiddleware(fastify);
  
  if (typeof registerRoutes === 'function') {
    registerRoutes(fastify);
  }
  return fastify;
}

const fastify = buildFastify();

function registerRoutes(app: any) {
  if (app.__routesRegistered) return;
  app.__routesRegistered = true;

  // Initialize AI Service with backend API key (secure)
  const aiService = new AIService(process.env.OPENAI_API_KEY);

  // AI API Endpoints (Backend Proxy for OpenAI)
  app.post('/api/ai/generateTags', async (request: any, reply: any) => {
    try {
      const body = request.body as Record<string, unknown> | undefined;
      const content = typeof body?.content === 'string' ? body.content : '';
      
      if (!content) {
        return reply.status(400).send({ error: 'content is required' });
      }

      const tags = await aiService.generateTags(content);
      return { success: true, tags };
    } catch (error) {
      console.error('Error in generateTags endpoint:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to generate tags' 
      });
    }
  });

  app.post('/api/ai/generateSummary', async (request: any, reply: any) => {
    try {
      const body = request.body as Record<string, unknown> | undefined;
      const content = typeof body?.content === 'string' ? body.content : '';
      
      if (!content) {
        return reply.status(400).send({ error: 'content is required' });
      }

      const summary = await aiService.generateSummary(content);
      return { success: true, summary };
    } catch (error) {
      console.error('Error in generateSummary endpoint:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to generate summary' 
      });
    }
  });

  app.post('/api/ai/categorizeNote', async (request: any, reply: any) => {
    try {
      const body = request.body as Record<string, unknown> | undefined;
      const content = typeof body?.content === 'string' ? body.content : '';
      
      if (!content) {
        return reply.status(400).send({ error: 'content is required' });
      }

      const category = await aiService.categorizeNote(content);
      return { success: true, category };
    } catch (error) {
      console.error('Error in categorizeNote endpoint:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to categorize note' 
      });
    }
  });

  app.post('/reply', async (request: any, reply: any) => {
    const body = request.body as Record<string, unknown> | undefined;
    const memory = body?.memory ?? {};
    const message = typeof body?.message === 'string' ? body.message : '';

    const searchResults = searchServerNotes(message);
    let noteSnippet: string | null = null;
    if (searchResults.length > 0) {
      const topResultId = searchResults[0].id;
      const topNote = serverNotes.find((n) => n.id === topResultId);
      if (topNote) {
        noteSnippet = topNote.content.slice(0, 150) + (topNote.content.length > 150 ? '...' : '');
      }
    }

    const result = generateReplyFromMemory(message, memory as any, DEFAULT_PERSONA as any, noteSnippet);
    return result;
  });

  app.post('/syncNote', async (request: any, reply: any) => {
    const note = request.body as Note | undefined;
    if (note && note.id) {
      const idx = serverNotes.findIndex((n) => n.id === note.id);
      if (idx !== -1) serverNotes[idx] = note;
      else serverNotes.push(note);
      await rebuildIndex();
      await saveNotesToDisk();
      return { ok: true, message: `Note ${note.id} synced and indexed` };
    }
    return { ok: false, message: 'Invalid note' };
  });

  app.get('/stats', async () => {
    return {
      totalNotes: serverNotes.length,
      indexReady: serverIndex.lunr !== null,
      vectorsCount: Object.keys(serverIndex.vectors).length,
      sentimentsCount: Object.keys(serverIndex.sentiments).length,
    };
  });
}

registerRoutes(fastify);

try {
  const pushModule = require(path.resolve(__dirname, './push'));
  if (pushModule && typeof pushModule.registerRoutes === 'function') {
    pushModule.registerRoutes(fastify);
  }
  if (pushModule && typeof pushModule.startReminderLoop === 'function') {
    pushModule.startReminderLoop();
  }
} catch (e) {
  logger.info('[Server] Push module not registered:', e && (e as Error).message);
}

try {
  const queueModule = require(path.resolve(__dirname, './queue'));
  const workerModule = require(path.resolve(__dirname, './worker'));
  if (queueModule && typeof queueModule.initQueue === 'function') queueModule.initQueue();
  if (workerModule && typeof workerModule.startWorker === 'function') workerModule.startWorker();
} catch (e) {
  // no-op
}

module.exports = { buildFastify };

async function loadNotesFromDisk(): Promise<void> {
  try {
    const data = await fs.readFile(NOTES_PERSIST_PATH, 'utf-8');
    serverNotes = JSON.parse(data);
    logger.info(`[Server] Loaded ${serverNotes.length} notes from disk`);
    await rebuildIndex();
  } catch (e) {
    logger.info('[Server] No persisted notes found; starting fresh');
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

async function rebuildIndex(): Promise<void> {
  if (serverNotes.length === 0) {
    serverIndex = { lunr: null, vectors: {}, sentiments: {} };
    return;
  }

  try {
    const lunr = require('lunr');
    serverIndex.lunr = lunr(function (builder: any) {
      builder.ref('id');
      builder.field('title');
      builder.field('content');
      serverNotes.forEach((note) => builder.add({ id: note.id, title: note.title, content: note.content }));
    });

    serverIndex.vectors = {};
    serverIndex.sentiments = {};
    serverNotes.forEach((note) => {
      const text = `${note.title} ${note.content}`;
      serverIndex.vectors[note.id] = vector.computeVector(text);
      serverIndex.sentiments[note.id] = sentiment.analyzeEmotion(text);
    });
    logger.info(`[Server] Rebuilt index for ${serverNotes.length} notes`);
  } catch (e) {
    logger.error('[Server] Error rebuilding index:', e);
    throw e;
  }
}

function containsAny(text: string, keywords: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function searchServerNotes(query: string): { id: string }[] {
  const results: { id: string }[] = [];
  if (!query || typeof query !== 'string' || !serverIndex.lunr) return results;

  try {
    const searchResults = serverIndex.lunr.search(query);
    return searchResults.map((result: any) => ({ id: result.ref }));
  } catch (error) {
    logger.warn('[Server] Search failed:', error);
    return results;
  }
}

function generateReplyFromMemory(message: string, memory: any, persona: any, noteSnippet: string | null): any {
  // 这是示例函数、可按原逻辑补全
  return {
    reply: `收到：${message}`,
    mood: 'neutral'
  };
}

// 启动服务：确保 Render、Heroku 等平台可检测到端口
const PORT = Number(process.env.PORT || process.env.REDIRECT_PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

// Start rate limit cleanup
startRateLimitCleanup();

fastify.listen({ port: PORT, host: HOST })
  .then(() => {
    logger.info(`[Server] listening on ${HOST}:${PORT}`);
    logger.info('[Server] Rate limiting enabled: 30 requests per minute per IP');
    if (process.env.REQUIRE_API_KEY === 'true') {
      logger.info('[Server] API key validation enabled');
    }
  })
  .catch((err: unknown) => {
    logger.error('[Server] failed to start', err);
    process.exit(1);
  });

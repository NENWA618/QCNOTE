const Fastify = require('fastify');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../lib/logger');
let vector;
let sentiment;
try {
  // Prefer server-local implementations (CommonJS)
  vector = require(path.resolve(__dirname, './vector')).default;
  sentiment = require(path.resolve(__dirname, './sentiment')).default;
} catch (e) {
  // Fallback to shared lib if server copies are not present
  vector = require(path.resolve(__dirname, '../lib/vector')).default;
  sentiment = require(path.resolve(__dirname, '../lib/sentiment')).default;
}

// simple in-memory storage for server-side notes
let serverNotes = [];
let serverIndex = { lunr: null, vectors: {}, sentiments: {} };

const NOTES_PERSIST_PATH = path.join(__dirname, '.notes-cache.json');

function buildFastify() {
  const fastify = Fastify({ logger: true });
  fastify.register(require('@fastify/cors'), { origin: true });
  return fastify;
}

// create default instance for normal run
const fastify = buildFastify();

// helper to register all endpoints onto a fastify instance
function registerRoutes(app) {
  app.post('/reply', async (request, reply) => {
    const body = request.body || {};
    const { message, memory } = body;
    let persona;
    try {
      persona = require(path.resolve(__dirname, './characterData')).persona;
    } catch (e) {
      persona = require(path.resolve(__dirname, '../lib/characterData')).persona;
    }
    
    // Search for relevant notes
    let noteSnippet = null;
    const searchResults = searchServerNotes(message);
    if (searchResults.length > 0) {
      const topResultId = searchResults[0].id;
      const topNote = serverNotes.find((n) => n.id === topResultId);
      if (topNote) {
        noteSnippet = topNote.content.slice(0, 150) + (topNote.content.length > 150 ? '...' : '');
      }
    }
    
    const result = generateReplyFromMemory(message || '', memory || {}, persona, noteSnippet);
    return result;
  });

  app.post('/syncNote', async (request, reply) => {
    const note = request.body;
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

  app.get('/stats', async (request, reply) => {
    return {
      totalNotes: serverNotes.length,
      indexReady: serverIndex.lunr !== null,
      vectorsCount: Object.keys(serverIndex.vectors).length,
      sentimentsCount: Object.keys(serverIndex.sentiments).length,
    };
  });
}

// register routes on default instance
registerRoutes(fastify);

// register push routes if available
try {
  const pushModule = require(path.resolve(__dirname, './push'));
  if (pushModule && typeof pushModule.registerRoutes === 'function') {
    pushModule.registerRoutes(fastify);
  }
  if (pushModule && typeof pushModule.startReminderLoop === 'function') {
    pushModule.startReminderLoop();
  }
} catch (e) {
  logger.info('[Server] Push module not registered: ', e && e.message);
}

// initialize Redis queue & worker if REDIS_URL present
try {
  const queueModule = require(path.resolve(__dirname, './queue'));
  const workerModule = require(path.resolve(__dirname, './worker'));
  if (queueModule && typeof queueModule.initQueue === 'function') queueModule.initQueue();
  if (workerModule && typeof workerModule.startWorker === 'function') workerModule.startWorker();
} catch (e) {
  // if redis/bull not installed or not configured, we'll continue with file-based scheduler
}

// export builder for testing or embedding
module.exports = { buildFastify };

// Load notes from disk on startup
async function loadNotesFromDisk() {
  try {
    const data = await fs.readFile(NOTES_PERSIST_PATH, 'utf-8');
    serverNotes = JSON.parse(data);
    logger.info(`[Server] Loaded ${serverNotes.length} notes from disk`);
    // rebuild index after loading
    await rebuildIndex();
  } catch (e) {
    logger.info('[Server] No persisted notes found; starting fresh');
  }
}

// Save notes to disk
async function saveNotesToDisk() {
  try {
    await fs.writeFile(NOTES_PERSIST_PATH, JSON.stringify(serverNotes, null, 2), 'utf-8');
    logger.info('[Server] Notes persisted to disk');
  } catch (e) {
    console.warn('[Server] Failed to persist notes:', e);
  }
}

// Rebuild lunr index and vector/sentiment caches
async function rebuildIndex() {
  if (serverNotes.length === 0) {
    serverIndex = { lunr: null, vectors: {}, sentiments: {} };
    return;
  }
  
  try {
    // Build lunr index
    const lunr = require('lunr');
    serverIndex.lunr = lunr(function (builder) {
      builder.ref('id');
      builder.field('title');
      builder.field('content');
      serverNotes.forEach((note) => {
        builder.add({ id: note.id, title: note.title, content: note.content });
      });
    });
    
    // Compute vectors and sentiment for each note
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
    throw e; // propagate so caller can know
  }
}

function containsAny(text, keywords) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// search using lunr + vector fallback
function searchServerNotes(query) {
  const results = [];
  
  // Try lunr search first
  if (serverIndex.lunr) {
    try {
      const hits = serverIndex.lunr.search(query);
      hits.forEach((h) => results.push({ id: h.ref, score: h.score, method: 'lunr' }));
    } catch (e) {
      console.warn('[Server] Lunr search error:', e);
    }
  }
  
  // Add vector search results
  if (Object.keys(serverIndex.vectors).length > 0) {
    const qvec = vector.computeVector(query);
    const vecResults = [];
    for (const id in serverIndex.vectors) {
      const score = vector.cosine(qvec, serverIndex.vectors[id]);
      if (score > 0.05) {
        vecResults.push({ id, score, method: 'vector' });
      }
    }
    vecResults.sort((a, b) => b.score - a.score);
    // merge with lunr results, avoiding duplicates
    vecResults.forEach((vr) => {
      if (!results.some((r) => r.id === vr.id)) {
        results.push(vr);
      }
    });
  }
  
  return results;
}

// simple reply generator that accepts a memory snapshot from client
// optionally augmented with retrieved note snippets for context
function generateReplyFromMemory(message, memory, persona, noteSnippet) {
  let reply = persona.fallbackReplies[0];
  let mood = 'idle';

  const total = memory && typeof memory.totalNotes === 'number' ? memory.totalNotes : 0;
  const tagFreq = (memory && memory.tagFreq) || {};
  const categoryFreq = (memory && memory.categoryFreq) || {};

  if (containsAny(message, ['记了什么', '笔记', '内容'])) {
    if (total === 0) {
      reply = persona.templates.noNotes;
      mood = 'playful';
    } else {
      const topTag = Object.entries(tagFreq).sort((a, b) => b[1] - a[1])[0];
      const topCat = Object.entries(categoryFreq).sort((a, b) => b[1] - a[1])[0];
      reply = persona.templates.summary(total, topTag ? topTag[0] : undefined, topCat ? topCat[0] : undefined);
      mood = 'happy';
    }
  } else if (containsAny(message, ['你好', '嗨', '在吗'])) {
    reply = persona.greetings[Math.floor(Math.random() * persona.greetings.length)];
    mood = 'happy';
  } else if (containsAny(message, ['难过', '悲伤', '烦', '哭'])) {
    reply = persona.sadReplies[Math.floor(Math.random() * persona.sadReplies.length)];
    mood = 'sad';
  } else if (containsAny(message, ['喜欢', '爱', '开心', '好'])) {
    reply = persona.happyReplies[Math.floor(Math.random() * persona.happyReplies.length)];
    mood = 'happy';
  } else if (containsAny(message, ['调皮', '捣蛋', '恶作剧'])) {
    reply = persona.playfulReplies[Math.floor(Math.random() * persona.playfulReplies.length)];
    mood = 'playful';
  } else {
    reply = persona.fallbackReplies[Math.floor(Math.random() * persona.fallbackReplies.length)];
    mood = 'thinking';
  }

  // Append retrieved note context if available
  if (noteSnippet) {
    reply += `\n（你之前写过："${noteSnippet}"）`;
  }

  return { reply, mood };
}

fastify.post('/reply', async (request, reply) => {
  const body = request.body || {};
  const { message, memory } = body;
  let persona;
  try {
    persona = require(path.resolve(__dirname, './characterData')).persona;
  } catch (e) {
    persona = require(path.resolve(__dirname, '../lib/characterData')).persona;
  }
  
  // Search for relevant notes
  let noteSnippet = null;
  const searchResults = searchServerNotes(message);
  if (searchResults.length > 0) {
    const topResultId = searchResults[0].id;
    const topNote = serverNotes.find((n) => n.id === topResultId);
    if (topNote) {
      noteSnippet = topNote.content.slice(0, 150) + (topNote.content.length > 150 ? '...' : '');
    }
  }
  
  const result = generateReplyFromMemory(message || '', memory || {}, persona, noteSnippet);
  return result;
});

// accept note syncs, update server-side structures
fastify.post('/syncNote', async (request, reply) => {
  const note = request.body;
  if (note && note.id) {
    // replace or add
    const idx = serverNotes.findIndex((n) => n.id === note.id);
    if (idx !== -1) serverNotes[idx] = note;
    else serverNotes.push(note);
    
    // rebuild index to include new/updated note
    await rebuildIndex();
    
    // persist to disk
    await saveNotesToDisk();
    
    return { ok: true, message: `Note ${note.id} synced and indexed` };
  }
  return { ok: false, message: 'Invalid note' };
});

const PORT = process.env.PORT || 10000;

// Add endpoint to check server status and index stats
fastify.get('/stats', async (request, reply) => {
  return {
    totalNotes: serverNotes.length,
    indexReady: serverIndex.lunr !== null,
    vectorsCount: Object.keys(serverIndex.vectors).length,
    sentimentsCount: Object.keys(serverIndex.sentiments).length,
  };
});

if (require.main === module) {
  fastify.listen({ port: PORT, host: '0.0.0.0' }, async () => {
    logger.info('Fastify server listening on', PORT);
    await loadNotesFromDisk();
  });
}

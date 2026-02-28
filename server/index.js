const Fastify = require('fastify');
const fastify = Fastify({ logger: true });

// Enable CORS so the frontend at different port can call /reply during development
fastify.register(require('@fastify/cors'), { origin: true });

function containsAny(text, keywords) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// simple reply generator that accepts a memory snapshot from client
function generateReplyFromMemory(message, memory, persona) {
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

  return { reply, mood };
}

fastify.post('/reply', async (request, reply) => {
  const body = request.body || {};
  const { message, memory } = body;
  // load persona defaults from a minimal definition
  const persona = require('../lib/characterData').persona;
  const result = generateReplyFromMemory(message || '', memory || {}, persona);
  return result;
});

const PORT = process.env.PORT || 4000;
fastify.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log('Fastify server listening on', PORT);
});

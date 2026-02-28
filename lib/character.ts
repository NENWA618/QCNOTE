import { initWindowStorage, NoteItem } from './storage';
import IDB from './idb';
import { Mood } from '../components/Character';
import persona from './characterData';

// helper to get storage instance
function getStorage() {
  return initWindowStorage() || new (require('./storage').default)();
}

export interface ChatEntry {
  userMessage: string;
  aiMessage: string;
  timestamp: number;
  mood?: Mood;
}

export interface Memory {
  totalNotes: number;
  tagFreq: Record<string, number>;
  categoryFreq: Record<string, number>;
}

const CHAT_KEY = 'NOTE_CHAT_HISTORY';

export async function loadChatHistory(): Promise<ChatEntry[]> {
  const data = await IDB.getItem<ChatEntry[]>(CHAT_KEY);
  return data || [];
}

export async function saveChatEntry(entry: ChatEntry) {
  const history = await loadChatHistory();
  history.push(entry);
  // cap history to 100 entries
  if (history.length > 100) history.splice(0, history.length - 100);
  await IDB.setItem(CHAT_KEY, history);
}

export async function clearChatHistory() {
  await IDB.deleteItem(CHAT_KEY);
}

export async function computeMemory(): Promise<Memory> {
  const notes = (await getStorage().getDataAsync()) || [];
  const mem: Memory = {
    totalNotes: notes.length,
    tagFreq: {},
    categoryFreq: {},
  };
  notes.forEach((n: NoteItem) => {
    (n.tags || []).forEach((t: string) => {
      mem.tagFreq[t] = (mem.tagFreq[t] || 0) + 1;
    });
    mem.categoryFreq[n.category] = (mem.categoryFreq[n.category] || 0) + 1;
  });
  return mem;
}

// simple text matching util
function containsAny(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

export async function generateReply(userMessage: string): Promise<{ reply: string; mood: Mood }> {
  const history = await loadChatHistory();
  const mem = await computeMemory();

  // default
  let reply = persona.fallbackReplies[0];
  let mood: Mood = 'idle';

  const lowerMsg = userMessage.toLowerCase();
  if (containsAny(userMessage, ['记了什么', '笔记', '内容'])) {
    if (mem.totalNotes === 0) {
      reply = persona.templates.noNotes;
      mood = 'playful';
    } else {
      const topTag = Object.entries(mem.tagFreq).sort((a, b) => b[1] - a[1])[0];
      const topCat = Object.entries(mem.categoryFreq).sort((a, b) => b[1] - a[1])[0];
      reply = persona.templates.summary(mem.totalNotes, topTag ? topTag[0] : undefined, topCat ? topCat[0] : undefined);
      mood = 'happy';
    }
  } else if (containsAny(userMessage, ['你好', '嗨', '在吗'])) {
    reply = persona.greetings[Math.floor(Math.random() * persona.greetings.length)];
    mood = 'happy';
  } else if (containsAny(userMessage, ['难过', '悲伤', '烦', '哭'])) {
    reply = persona.sadReplies[Math.floor(Math.random() * persona.sadReplies.length)];
    mood = 'sad';
  } else if (containsAny(userMessage, ['喜欢', '爱', '开心', '好'])) {
    reply = persona.happyReplies[Math.floor(Math.random() * persona.happyReplies.length)];
    mood = 'happy';
  } else if (containsAny(userMessage, ['调皮', '捣蛋', '恶作剧'])) {
    reply = persona.playfulReplies[Math.floor(Math.random() * persona.playfulReplies.length)];
    mood = 'playful';
  } else {
    if (history.length > 0) {
      reply = persona.fallbackReplies[Math.floor(Math.random() * persona.fallbackReplies.length)];
      mood = 'thinking';
    }
  }

  const entry: ChatEntry = { userMessage, aiMessage: reply, timestamp: Date.now(), mood };
  await saveChatEntry(entry);
  return { reply, mood };
}

export default {
  loadChatHistory,
  saveChatEntry,
  clearChatHistory,
  computeMemory,
  generateReply,
};

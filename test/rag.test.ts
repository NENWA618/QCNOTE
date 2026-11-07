import { describe, it, expect, vi } from 'vitest';
import {
  chunkNote,
  estimateTokens,
  retrieveChunks,
  type RagCache,
  type RagCacheStore,
} from '../lib/rag';
import type { NoteItem } from '../lib/storage';

function makeNote(id: string, title: string, content: string, updatedAt = 1): NoteItem {
  return {
    id,
    title,
    content,
    category: '',
    tags: [],
    color: '#fff',
    createdAt: 1,
    updatedAt,
  };
}

// 确定性的假 embedding：按关键词出现与否生成单位向量，最后一维兜底，保证不出现零向量。
const VOCAB = ['苹果', '香蕉', 'python', 'react', '睡眠'];
function fakeVector(text: string): number[] {
  const lower = text.toLowerCase();
  const v = VOCAB.map((w) => (lower.includes(w) ? 1 : 0));
  v.push(0.05);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

function makeEmbed() {
  return vi.fn(async (texts: string[]) => texts.map(fakeVector));
}

function makeStore(initial: RagCache | null = null) {
  let data: RagCache | null = initial;
  const store: RagCacheStore & { peek: () => RagCache | null } = {
    loadRagCache: async () => (data ? structuredClone(data) : null),
    saveRagCache: async (cache) => {
      data = structuredClone(cache);
    },
    peek: () => data,
  };
  return store;
}

describe('estimateTokens', () => {
  it('中文按字估算比英文更贵', () => {
    expect(estimateTokens('你'.repeat(100))).toBeGreaterThan(estimateTokens('a'.repeat(100)));
    expect(estimateTokens('')).toBe(0);
  });
});

describe('chunkNote', () => {
  it('短笔记只有一块，embedText 带标题', () => {
    const chunks = chunkNote(makeNote('a', '水果', '我喜欢吃苹果。'));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('我喜欢吃苹果。');
    expect(chunks[0].embedText).toContain('水果');
  });

  it('按 Markdown 标题分节，块不跨节并记录小节标题', () => {
    const note = makeNote('a', '笔记', '# 水果\n苹果很甜\n\n## 蔬菜\n白菜很脆');
    const chunks = chunkNote(note);
    expect(chunks.map((c) => c.heading)).toEqual(['水果', '蔬菜']);
    expect(chunks[0].text).toBe('苹果很甜');
    expect(chunks[1].embedText).toContain('笔记 > 蔬菜');
  });

  it('长文本被切成多块，每块不超过预算，且块序号连续', () => {
    const sentence = '这是一个用来测试分块的句子。';
    const note = makeNote('a', 't', sentence.repeat(60));
    const chunks = chunkNote(note, { maxTokens: 40, overlapTokens: 8 });
    expect(chunks.length).toBeGreaterThan(3);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(estimateTokens(c.text)).toBeLessThanOrEqual(40);
    });
  });

  it('相邻块有重叠，答案落在切口处两边都能检索到', () => {
    const sentences = Array.from({ length: 12 }, (_, i) => `第${i}句内容在这里。`).join('');
    const chunks = chunkNote(makeNote('a', 't', sentences), { maxTokens: 30, overlapTokens: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    const lastSentenceOfFirst = chunks[0].text.match(/第\d+句内容在这里。/g)!.pop()!;
    expect(chunks[1].text.startsWith(lastSentenceOfFirst)).toBe(true);
  });

  it('没有标点的超长文字也能被硬切，不会产生超限的块', () => {
    const chunks = chunkNote(makeNote('a', 't', '字'.repeat(1000)), { maxTokens: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(estimateTokens(c.text)).toBeLessThanOrEqual(50));
  });

  it('剔除内嵌 base64 图片，避免巨大的 data URI 进入 embedding', () => {
    const note = makeNote('a', 't', `前文 ![图](data:image/png;base64,${'A'.repeat(50000)}) 后文`);
    const chunks = chunkNote(note);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).not.toContain('base64');
    expect(chunks[0].text.length).toBeLessThan(50);
  });

  it('链接只保留文字', () => {
    const chunks = chunkNote(makeNote('a', 't', '见[官网](https://example.com/very/long)了解'));
    expect(chunks[0].text).toBe('见官网了解');
  });

  it('正文为空时用标题作为唯一一块；标题也为空则没有块', () => {
    expect(chunkNote(makeNote('a', '只有标题', '')).map((c) => c.text)).toEqual(['只有标题']);
    expect(chunkNote(makeNote('a', '', ''))).toEqual([]);
  });

  it('是确定性的', () => {
    const note = makeNote('a', 't', '# 标题\n' + '内容。'.repeat(100));
    expect(chunkNote(note)).toEqual(chunkNote(note));
  });
});

describe('retrieveChunks', () => {
  const notes = [
    makeNote('n1', '水果笔记', '# 苹果\n我今天吃了苹果。\n\n# 香蕉\n香蕉也不错。'),
    makeNote('n2', '编程笔记', '学习 Python 的基础语法。'),
    makeNote('n3', '前端', '用 React 写组件。'),
  ];

  it('返回最相关的块，并带上所属笔记与小节标题', async () => {
    const hits = await retrieveChunks('苹果', notes, makeStore(), { embed: makeEmbed() });
    expect(hits[0].noteId).toBe('n1');
    expect(hits[0].heading).toBe('苹果');
    expect(hits[0].text).toContain('苹果');
    expect(hits.every((h) => h.noteId === 'n1' || h.score >= 0.35)).toBe(true);
  });

  it('是块级检索：同一篇笔记里能精确定位到对应小节', async () => {
    const hits = await retrieveChunks('香蕉', notes, makeStore(), { embed: makeEmbed() });
    expect(hits[0].noteId).toBe('n1');
    expect(hits[0].heading).toBe('香蕉');
  });

  it('低于阈值的结果被丢弃', async () => {
    const hits = await retrieveChunks('睡眠', notes, makeStore(), { embed: makeEmbed() });
    expect(hits).toEqual([]);
  });

  it('空问题或空笔记池直接返回空，且不触发 embedding', async () => {
    const embed = makeEmbed();
    expect(await retrieveChunks('  ', notes, makeStore(), { embed })).toEqual([]);
    expect(await retrieveChunks('苹果', [], makeStore(), { embed })).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it('第二次检索命中缓存：只需要为问题本身做一次 embedding', async () => {
    const store = makeStore();
    const embed = makeEmbed();
    await retrieveChunks('苹果', notes, store, { embed });
    embed.mockClear();

    await retrieveChunks('react', notes, store, { embed });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed.mock.calls[0][0]).toEqual(['react']);
  });

  it('只重算改动过的笔记', async () => {
    const store = makeStore();
    const embed = makeEmbed();
    await retrieveChunks('苹果', notes, store, { embed });
    embed.mockClear();

    const edited = notes.map((n) =>
      n.id === 'n2' ? { ...n, content: '改成香蕉', updatedAt: 2 } : n,
    );
    await retrieveChunks('香蕉', edited, store, { embed });

    const embedded = embed.mock.calls.flatMap((c) => c[0]);
    expect(embedded.some((t) => t.includes('改成香蕉'))).toBe(true);
    expect(embedded.some((t) => t.includes('React'))).toBe(false);
  });

  it('分块参数变化会让旧缓存失效', async () => {
    const store = makeStore();
    const embed = makeEmbed();
    await retrieveChunks('苹果', notes, store, { embed });
    embed.mockClear();

    await retrieveChunks('苹果', notes, store, { embed, maxTokens: 60 });
    expect(embed.mock.calls.flatMap((c) => c[0]).length).toBeGreaterThan(1);
  });

  it('清理已删除笔记的缓存', async () => {
    const store = makeStore();
    await retrieveChunks('苹果', notes, store, { embed: makeEmbed() });
    expect(Object.keys(store.peek()!)).toHaveLength(3);

    await retrieveChunks('苹果', notes.slice(0, 1), store, { embed: makeEmbed() });
    expect(Object.keys(store.peek()!)).toEqual(['n1']);
  });

  it('maxPerNote 限制单篇笔记占用的结果数', async () => {
    const many = [makeNote('n1', '水果', '# a\n苹果一\n\n# b\n苹果二\n\n# c\n苹果三')];
    const hits = await retrieveChunks('苹果', many, makeStore(), {
      embed: makeEmbed(),
      maxPerNote: 2,
      topK: 10,
    });
    expect(hits).toHaveLength(2);
  });

  it('topK 限制总数，结果按相关度降序', async () => {
    const pool = Array.from({ length: 8 }, (_, i) => makeNote(`n${i}`, `n${i}`, '苹果'));
    const hits = await retrieveChunks('苹果', pool, makeStore(), { embed: makeEmbed(), topK: 3 });
    expect(hits).toHaveLength(3);
    for (let i = 1; i < hits.length; i++)
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
  });

  it('索引进度回调：总数等于待处理块数，最终 done === total', async () => {
    const onProgress = vi.fn();
    await retrieveChunks('苹果', notes, makeStore(), { embed: makeEmbed(), onProgress });
    const last = onProgress.mock.calls.at(-1)![0];
    expect(last.total).toBeGreaterThan(0);
    expect(last.done).toBe(last.total);
  });

  it('缓存已完整时不会触发索引进度回调', async () => {
    const store = makeStore();
    await retrieveChunks('苹果', notes, store, { embed: makeEmbed() });
    const onProgress = vi.fn();
    await retrieveChunks('苹果', notes, store, { embed: makeEmbed(), onProgress });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('索引中途失败：已落盘的批次不用重算，重试只补剩下的', async () => {
    const store = makeStore();
    // 300 篇各 1 块 → 10 批（每批 32）。每 8 批落盘一次，第 10 批失败时前 256 篇已保存。
    const big = Array.from({ length: 300 }, (_, i) => makeNote(`n${i}`, `t${i}`, '苹果'));
    let calls = 0;
    const flaky = vi.fn(async (texts: string[]) => {
      if (++calls === 10) throw new Error('boom');
      return texts.map(fakeVector);
    });
    await expect(retrieveChunks('苹果', big, store, { embed: flaky })).rejects.toThrow('boom');
    expect(Object.keys(store.peek() ?? {})).toHaveLength(256);

    const embed = makeEmbed();
    const hits = await retrieveChunks('苹果', big, store, { embed });
    const reEmbedded = embed.mock.calls.flatMap((c) => c[0]);
    expect(reEmbedded.length).toBe(300 - 256 + 1); // 剩下的 44 篇 + 问题本身
    expect(hits.length).toBeGreaterThan(0);
  });

  it('并发检索被串行化：同一批笔记只会被 embedding 一次', async () => {
    const store = makeStore();
    const embed = makeEmbed();
    await Promise.all([
      retrieveChunks('苹果', notes, store, { embed }),
      retrieveChunks('react', notes, store, { embed }),
    ]);
    const noteTexts = embed.mock.calls.flatMap((c) => c[0]).filter((t) => t.includes('\n'));
    const unique = new Set(noteTexts);
    expect(noteTexts.length).toBe(unique.size);
  });
});

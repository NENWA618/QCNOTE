/**
 * 纯前端 RAG 检索：把笔记切成小块（chunk），对每块做本地 embedding，
 * 提问时返回最相关的若干块及其所属笔记。
 *
 * 全程在浏览器内完成：复用 embeddings.ts 的本地 Worker 模型，
 * 笔记内容不会发往任何服务器，也不会调用任何外部 AI 接口。
 *
 * 这是应用里唯一的一套本地向量索引：一篇笔记对应多个块向量。
 * - retrieveChunks：返回最相关的段落（「段落」视图用）；
 * - findNotesByMeaning：返回最相关的笔记（侧边栏「语义搜索」用，取每篇笔记里得分最高的块）。
 * 两者共用同一份块向量缓存，长笔记不会因为内容太杂而被稀释。
 */
import type { NoteItem } from './storage';
import { embedTexts, cosineSimilarity } from './embeddings';

/* ------------------------------------------------------------------ */
/* 类型                                                                */
/* ------------------------------------------------------------------ */

export interface RagChunk {
  noteId: string;
  noteTitle: string;
  /** 在该笔记内的序号，从 0 开始 */
  index: number;
  /** 该块所在的最近一级标题（没有则为空串） */
  heading: string;
  /** 展示给用户的原文片段 */
  text: string;
  /** 送去 embedding 的文本：标题 + 小节标题 + 片段，给模型更多上下文 */
  embedText: string;
}

export interface RagHit {
  noteId: string;
  noteTitle: string;
  chunkIndex: number;
  heading: string;
  text: string;
  /** 余弦相似度，越大越相关 */
  score: number;
}

export interface ChunkOptions {
  /** 每块的 token 预算（估算值），默认 100 */
  maxTokens?: number;
  /** 相邻块的重叠 token 数（估算值），默认 15 */
  overlapTokens?: number;
}

export interface RetrieveOptions extends ChunkOptions {
  /** 最多返回多少块，默认 5 */
  topK?: number;
  /** 相似度下限，低于它的块直接丢弃，默认 0.35 */
  threshold?: number;
  /** 同一篇笔记最多返回几块，避免一篇笔记占满结果，默认 2 */
  maxPerNote?: number;
  /** 索引进度回调（以块为单位），只有存在需要新计算 embedding 的笔记时才会触发 */
  onProgress?: (progress: RagIndexProgress) => void;
  /** 测试或替换模型时注入；默认使用本地 Worker 模型 */
  embed?: (texts: string[]) => Promise<number[][]>;
}

export interface RagIndexProgress {
  done: number;
  total: number;
}

interface RagCacheEntry {
  updatedAt: number;
  /** 分块参数与算法版本；不一致说明缓存的向量对应的是另一种切法，必须重算 */
  sig: string;
  vectors: number[][];
}

export type RagCache = Record<string, RagCacheEntry>;

/**
 * 块向量缓存放在哪里。和语义搜索缓存一样，由 NoteStorage 按用户存放并加密——
 * 向量会泄露笔记大意，不能明文落盘。
 */
export interface RagCacheStore {
  loadRagCache(): Promise<RagCache | null>;
  saveRagCache(cache: RagCache): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* 分块                                                                */
/* ------------------------------------------------------------------ */

/** 改动分块算法时递增，让旧缓存自动失效 */
const RAG_INDEX_VERSION = 1;

const DEFAULT_MAX_TOKENS = 100;
const DEFAULT_OVERLAP_TOKENS = 15;
/** embedding 时标题前缀最多保留的字数 */
const TITLE_PREFIX_CHARS = 30;
const EMBED_BATCH_SIZE = 32;
/** 每处理这么多批就落盘一次，被中断后下次可以接着算 */
const SAVE_EVERY_BATCHES = 8;
/** 缓存里向量保留的小数位；4 位对余弦排序没有可感知影响，体积约减半 */
const VECTOR_DECIMALS = 4;

function isCjk(code: number): boolean {
  return (
    (code >= 0x3040 && code <= 0x30ff) || // 日文假名
    (code >= 0x3400 && code <= 0x9fff) || // CJK 统一表意文字
    (code >= 0xac00 && code <= 0xd7af) // 韩文
  );
}

/**
 * 粗略估算 token 数。
 *
 * 本地模型（paraphrase-multilingual-MiniLM-L12-v2）单次最多读 128 个 token，超出部分
 * 会被直接截断、不参与向量。这里不引入 tokenizer，用经验系数估算：中日韩字符约 0.7 token，
 * 其余字符约 0.28 token（英文约 3.5 字符 / token）。这是启发式，目的是让块"大致不超限"，
 * 所以默认预算 100 留了余量。
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    tokens += isCjk(text.charCodeAt(i)) ? 0.7 : 0.28;
  }
  return Math.ceil(tokens);
}

/**
 * 去掉对检索没有价值、甚至有害的 Markdown 内容。
 * 尤其是图片：笔记里可能内嵌 base64 data URI，动辄几百 KB，不能进 embedding。
 */
function cleanMarkdown(content: string): string {
  return content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接只保留文字
    .replace(/^\s*(```|~~~).*$/gm, '') // 代码围栏标记行（保留代码本身）
    .replace(/<[^>]+>/g, ''); // 行内 HTML 标签
}

interface Unit {
  text: string;
  tokens: number;
  startsBlock: boolean;
}

const SENTENCE_MARK = '\u0000';

function splitSentences(block: string): string[] {
  return block
    .replace(/([。！？!?；;])/g, `$1${SENTENCE_MARK}`)
    .replace(/(\.)(\s)/g, `$1${SENTENCE_MARK}$2`)
    .split(SENTENCE_MARK)
    .filter((s) => s.trim() !== '');
}

/** 单个句子仍超预算时（比如一整段没有标点的文字），按字符硬切 */
function hardSplit(text: string, maxTokens: number): string[] {
  const parts: string[] = [];
  let current = '';
  let currentTokens = 0;
  for (const ch of text) {
    const cost = isCjk(ch.charCodeAt(0)) ? 0.7 : 0.28;
    if (currentTokens + cost > maxTokens && current) {
      parts.push(current);
      current = '';
      currentTokens = 0;
    }
    current += ch;
    currentTokens += cost;
  }
  if (current) parts.push(current);
  return parts;
}

function blockToUnits(block: string, maxTokens: number): Unit[] {
  if (estimateTokens(block) <= maxTokens) {
    return [{ text: block, tokens: estimateTokens(block), startsBlock: true }];
  }
  const units: Unit[] = [];
  let first = true;
  for (const sentence of splitSentences(block)) {
    const pieces =
      estimateTokens(sentence) <= maxTokens ? [sentence] : hardSplit(sentence, maxTokens);
    for (const piece of pieces) {
      units.push({ text: piece, tokens: estimateTokens(piece), startsBlock: first });
      first = false;
    }
  }
  return units;
}

function joinUnits(units: Unit[]): string {
  let out = '';
  units.forEach((u, i) => {
    out += i > 0 && u.startsBlock ? `\n${u.text}` : u.text;
  });
  return out.trim();
}

interface Section {
  heading: string;
  lines: string[];
}

/** 按 Markdown 标题把正文切成小节；标题之前的内容 heading 为空串 */
function splitSections(content: string): Section[] {
  const sections: Section[] = [{ heading: '', lines: [] }];
  for (const line of content.split('\n')) {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      sections.push({ heading: match[1], lines: [] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }
  return sections;
}

function chunkSignature(maxTokens: number, overlapTokens: number): string {
  return `v${RAG_INDEX_VERSION}:${maxTokens}:${overlapTokens}`;
}

/**
 * 把一篇笔记切成块。规则：
 * 1. 先按 Markdown 标题分节，块不会跨节（主题边界天然是好的切点）；
 * 2. 节内按空行分段，段落尽量整段放进同一块；
 * 3. 段落太长就按句子切，句子还太长就按字符硬切；
 * 4. 同一节内相邻块会重叠一小段，避免答案恰好落在切口上而两边都检索不到。
 *
 * 结果只依赖笔记内容和参数，是确定性的——所以缓存里不用存文本，要用时重新切即可。
 */
export function chunkNote(note: NoteItem, options: ChunkOptions = {}): RagChunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = Math.min(options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS, maxTokens - 1);
  const title = (note.title ?? '').trim();
  const titlePrefix = title.slice(0, TITLE_PREFIX_CHARS);

  const chunks: RagChunk[] = [];
  const pushChunk = (heading: string, text: string) => {
    const head = heading ? `${titlePrefix} > ${heading}` : titlePrefix;
    chunks.push({
      noteId: note.id,
      noteTitle: title,
      index: chunks.length,
      heading,
      text,
      embedText: head ? `${head}\n${text}` : text,
    });
  };

  for (const section of splitSections(cleanMarkdown(note.content ?? ''))) {
    const blocks = section.lines
      .join('\n')
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    const units = blocks.flatMap((b) => blockToUnits(b, maxTokens));
    if (units.length === 0) continue;

    let current: Unit[] = [];
    let currentTokens = 0;
    for (const unit of units) {
      if (current.length > 0 && currentTokens + unit.tokens > maxTokens) {
        pushChunk(section.heading, joinUnits(current));
        // 只在最后一个单元本身不大时才带到下一块，保证重叠部分不会吃掉整块预算
        const tail = current[current.length - 1];
        current = tail.tokens <= overlapTokens ? [{ ...tail, startsBlock: false }] : [];
        currentTokens = current.reduce((sum, u) => sum + u.tokens, 0);
      }
      current.push(unit);
      currentTokens += unit.tokens;
    }
    if (current.length > 0) pushChunk(section.heading, joinUnits(current));
  }

  // 空正文（或只有图片）的笔记：用标题当唯一一块，这样至少能按标题检索到
  if (chunks.length === 0 && title) {
    pushChunk('', title);
  }

  return chunks;
}

/* ------------------------------------------------------------------ */
/* 索引与检索                                                          */
/* ------------------------------------------------------------------ */

function roundVector(vector: number[]): number[] {
  const factor = 10 ** VECTOR_DECIMALS;
  return vector.map((x) => Math.round(x * factor) / factor);
}

// embedding Worker 是单线程的；若两次检索并发，会对同一批笔记重复算向量并互相覆盖缓存。
// 串行化可以让后一次直接命中前一次写好的缓存。
let queue: Promise<unknown> = Promise.resolve();

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

/**
 * 在笔记中检索与 query 最相关的块。
 *
 * 首次调用会为所有笔记建立块索引（需要加载模型并逐批计算，进度见 onProgress）；
 * 之后只会重算新增或改动过的笔记。
 *
 * 注意：notes 应传入完整的候选池。缓存里不在 notes 中的笔记会被当作已删除而清掉，
 * 如果每次传入的是筛选后的子集，缓存会反复被清空再重建。
 */
export function retrieveChunks(
  query: string,
  notes: NoteItem[],
  cacheStore: RagCacheStore,
  options: RetrieveOptions = {},
): Promise<RagHit[]> {
  const trimmed = query.trim();
  if (!trimmed || notes.length === 0) return Promise.resolve([]);
  return runExclusive(() => doRetrieve(trimmed, notes, cacheStore, options));
}

interface PreparedIndex {
  plan: { note: NoteItem; chunks: RagChunk[] }[];
  cache: RagCache;
  queryVector: number[] | undefined;
}

/**
 * 保证 notes 的块向量都在缓存里（只重算新增或改动过的笔记），并算出 query 的向量。
 * 两种检索共用它，所以建索引的行为（进度、中断续算、清理已删除笔记）只有一份。
 */
async function prepareIndex(
  query: string,
  notes: NoteItem[],
  cacheStore: RagCacheStore,
  options: RetrieveOptions,
): Promise<PreparedIndex> {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const embed = options.embed ?? embedTexts;
  const sig = chunkSignature(maxTokens, Math.min(overlapTokens, maxTokens - 1));
  const cache: RagCache = (await cacheStore.loadRagCache()) ?? {};
  const plan = notes.map((note) => ({
    note,
    chunks: chunkNote(note, { maxTokens, overlapTokens }),
  }));

  const stale = plan.filter(({ note, chunks }) => {
    const entry = cache[note.id];
    return (
      !entry ||
      entry.updatedAt !== note.updatedAt ||
      entry.sig !== sig ||
      entry.vectors.length !== chunks.length
    );
  });

  let dirty = false;

  if (stale.length > 0) {
    const total = stale.reduce((sum, p) => sum + p.chunks.length, 0);
    let done = 0;
    options.onProgress?.({ done, total });

    // 把待处理笔记的块按批次送去 embedding；批次可以跨笔记，但结果要按笔记归位。
    let batch: { noteId: string; chunkIndex: number; text: string }[] = [];
    const pending = new Map<string, { vectors: number[][]; filled: number }>(
      stale.map((p) => [p.note.id, { vectors: [], filled: 0 }]),
    );
    const committed = new Set<string>();
    let batchesSinceSave = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      const vectors = await embed(batch.map((b) => b.text));
      if (vectors.length !== batch.length) {
        throw new Error('embedding 数量与输入不一致');
      }
      batch.forEach((b, i) => {
        const slot = pending.get(b.noteId)!;
        slot.vectors[b.chunkIndex] = roundVector(vectors[i]);
        slot.filled++;
      });
      done += batch.length;
      batch = [];
      options.onProgress?.({ done, total });

      // 已经凑齐所有块的笔记立刻写进缓存，这样即使中途中断，下次也不用重算
      for (const { note, chunks } of stale) {
        if (committed.has(note.id)) continue;
        const slot = pending.get(note.id)!;
        if (slot.filled === chunks.length) {
          cache[note.id] = { updatedAt: note.updatedAt, sig, vectors: slot.vectors };
          committed.add(note.id);
          dirty = true;
        }
      }
      batchesSinceSave++;
      if (dirty && batchesSinceSave >= SAVE_EVERY_BATCHES) {
        batchesSinceSave = 0;
        await saveQuietly(cacheStore, cache);
        dirty = false;
      }
    };

    for (const { note, chunks } of stale) {
      if (chunks.length === 0) {
        cache[note.id] = { updatedAt: note.updatedAt, sig, vectors: [] };
        committed.add(note.id);
        dirty = true;
        continue;
      }
      for (const chunk of chunks) {
        batch.push({ noteId: note.id, chunkIndex: chunk.index, text: chunk.embedText });
        if (batch.length >= EMBED_BATCH_SIZE) await flush();
      }
    }
    await flush();
  }

  // 清掉已不存在的笔记，避免缓存无限增长
  const currentIds = new Set(notes.map((n) => n.id));
  for (const id of Object.keys(cache)) {
    if (!currentIds.has(id)) {
      delete cache[id];
      dirty = true;
    }
  }
  if (dirty) await saveQuietly(cacheStore, cache);

  const [queryVector] = await embed([query]);
  return { plan, cache, queryVector };
}

async function doRetrieve(
  query: string,
  notes: NoteItem[],
  cacheStore: RagCacheStore,
  options: RetrieveOptions,
): Promise<RagHit[]> {
  const topK = options.topK ?? 5;
  const threshold = options.threshold ?? 0.35;
  const maxPerNote = options.maxPerNote ?? 2;

  const { plan, cache, queryVector } = await prepareIndex(query, notes, cacheStore, options);
  if (!queryVector) return [];

  const scored: RagHit[] = [];
  for (const { note, chunks } of plan) {
    const vectors = cache[note.id]?.vectors;
    if (!vectors) continue;
    for (const chunk of chunks) {
      const vector = vectors[chunk.index];
      if (!vector || vector.length !== queryVector.length) continue;
      const score = cosineSimilarity(queryVector, vector);
      if (score < threshold) continue;
      scored.push({
        noteId: note.id,
        noteTitle: note.title,
        chunkIndex: chunk.index,
        heading: chunk.heading,
        text: chunk.text,
        score,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  const perNote = new Map<string, number>();
  const hits: RagHit[] = [];
  for (const hit of scored) {
    const count = perNote.get(hit.noteId) ?? 0;
    if (count >= maxPerNote) continue;
    perNote.set(hit.noteId, count + 1);
    hits.push(hit);
    if (hits.length >= topK) break;
  }
  return hits;
}

/**
 * 侧边栏「语义搜索」用的笔记级匹配阈值。
 * 比段落检索（0.35）高：这里是在已有关键词结果之外再追加笔记，宁缺毋滥。
 * 这是经验值，没有用真实模型调过；觉得追加的结果太杂或太少，就调这里。
 */
export const NOTE_MATCH_THRESHOLD = 0.45;

export interface MatchNotesOptions extends ChunkOptions {
  threshold?: number;
  onProgress?: (progress: RagIndexProgress) => void;
  embed?: (texts: string[]) => Promise<number[][]>;
}

/**
 * 按意思找笔记：返回得分超过阈值的笔记 id，按相关度从高到低。
 * 笔记的得分 = 它所有块里与 query 最相似的那一块。
 * 和 retrieveChunks 共用块向量缓存，所以 notes 同样应传入完整的候选池。
 */
export function findNotesByMeaning(
  query: string,
  notes: NoteItem[],
  cacheStore: RagCacheStore,
  options: MatchNotesOptions = {},
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed || notes.length === 0) return Promise.resolve([]);
  return runExclusive(() => doFindNotes(trimmed, notes, cacheStore, options));
}

async function doFindNotes(
  query: string,
  notes: NoteItem[],
  cacheStore: RagCacheStore,
  options: MatchNotesOptions,
): Promise<string[]> {
  const threshold = options.threshold ?? NOTE_MATCH_THRESHOLD;
  const { plan, cache, queryVector } = await prepareIndex(query, notes, cacheStore, options);
  if (!queryVector) return [];

  const scored: { id: string; score: number }[] = [];
  for (const { note } of plan) {
    const vectors = cache[note.id]?.vectors;
    if (!vectors) continue;
    let best = -Infinity;
    for (const vector of vectors) {
      if (!vector || vector.length !== queryVector.length) continue;
      best = Math.max(best, cosineSimilarity(queryVector, vector));
    }
    if (best >= threshold) scored.push({ id: note.id, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}

async function saveQuietly(store: RagCacheStore, cache: RagCache): Promise<void> {
  try {
    await store.saveRagCache(cache);
  } catch (e) {
    // 缓存写失败不影响本次检索结果，只是下次要重算
    console.warn('unable to save RAG chunk cache', e);
  }
}

const Rag = { chunkNote, estimateTokens, retrieveChunks, findNotesByMeaning };

export default Rag;

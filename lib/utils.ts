/**
 * 工具函数模块 (TypeScript)
 */
import type { NoteItem } from './storage';
import lunr from 'lunr';
import vector, { type Vector as VectorType } from './vector';

/**
 * 词袋相似度补充结果的下限。中文按单字切词，短查询只要有一个字重叠就会拿到 0.15~0.2 的分，
 * 所以下限不能太低，否则会带出只是共用一个字的无关笔记。
 */
const VECTOR_MATCH_THRESHOLD = 0.25;

/** 可以用 `字段:值` 限定的字段；其它 `xxx:yyy` 按普通文本处理（比如网址 http://...） */
const SEARCH_FIELDS = new Set(['title', 'content', 'tag', 'category', 'date']);

/* ------------------------------------------------------------------ */
/* 搜索缓存：边输入边搜时，笔记没变就不重复建索引、重算向量                */
/* ------------------------------------------------------------------ */

interface NoteCacheEntry {
  title: string;
  content: string;
  vec?: VectorType;
  lowerTitle?: string;
  lowerContent?: string;
}

/** 每篇笔记的词袋向量和小写文本。用标题和正文做有效性校验（相同引用的字符串比较是 O(1)），不依赖 updatedAt */
const noteCache = new Map<string, NoteCacheEntry>();
const NOTE_CACHE_LIMIT = 10000;

function getNoteEntry(note: NoteItem): NoteCacheEntry {
  const hit = noteCache.get(note.id);
  if (hit && hit.title === note.title && hit.content === note.content) return hit;

  if (hit) {
    noteCache.delete(note.id);
  } else if (noteCache.size >= NOTE_CACHE_LIMIT) {
    // Map 按插入顺序迭代，删掉最早写入的
    const oldest = noteCache.keys().next().value;
    if (oldest !== undefined) noteCache.delete(oldest);
  }
  const entry: NoteCacheEntry = { title: note.title, content: note.content };
  noteCache.set(note.id, entry);
  return entry;
}

function getNoteVector(note: NoteItem): VectorType {
  const entry = getNoteEntry(note);
  if (!entry.vec) entry.vec = vector.computeVector(`${note.title} ${note.content}`);
  return entry.vec;
}

function getLowerText(note: NoteItem): { title: string; content: string } {
  const entry = getNoteEntry(note);
  if (entry.lowerTitle === undefined) entry.lowerTitle = note.title.toLowerCase();
  if (entry.lowerContent === undefined) entry.lowerContent = note.content.toLowerCase();
  return { title: entry.lowerTitle, content: entry.lowerContent };
}

interface IndexedNoteSnapshot {
  title: string;
  content: string;
  tags: string[];
  category: string;
}

interface LunrShard {
  snapshot: Map<string, IndexedNoteSnapshot>;
  index: lunr.Index;
}

/**
 * lunr 索引建好后不能增删文档，一次全量重建在 3000 篇笔记上要近 1 秒。
 * 所以把笔记按 id 哈希分成许多小片（每片约 SEARCH_SHARD_TARGET 篇），每片一个独立索引：
 * 保存/删除一篇笔记只会让它所在的那一片失效，重建只要几十毫秒；搜索时对每片分别查询再合并。
 */
const SEARCH_SHARD_TARGET = 200;
const SEARCH_SHARD_MAX_COUNT = 256;
const SEARCH_SHARD_CACHE_LIMIT = 1024;
const WARM_START_DELAY_MS = 300;
const shardCache = new Map<string, LunrShard>();

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

/** 分片数取 2 的幂：笔记数在同一量级内增减时，分片数（和每篇笔记所属的片）保持不变 */
function shardCountFor(noteCount: number): number {
  if (noteCount <= SEARCH_SHARD_TARGET) return 1;
  const wanted = Math.ceil(noteCount / SEARCH_SHARD_TARGET);
  return Math.min(SEARCH_SHARD_MAX_COUNT, 2 ** Math.ceil(Math.log2(wanted)));
}

/** FNV-1a：稳定、分布均匀，且不依赖 id 的格式 */
function shardOf(id: string, shardCount: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % shardCount;
}

function groupIntoShards(notes: NoteItem[]): Map<number, NoteItem[]> {
  const shardCount = shardCountFor(notes.length);
  const groups = new Map<number, NoteItem[]>();
  for (const note of notes) {
    const shard = shardOf(note.id, shardCount);
    const members = groups.get(shard);
    if (members) members.push(note);
    else groups.set(shard, [note]);
  }
  return groups;
}

function shardKey(shardCount: number, shard: number): string {
  return `${shardCount}:${shard}`;
}

function getShardIndex(shardCount: number, shard: number, members: NoteItem[]): lunr.Index {
  const key = shardKey(shardCount, shard);
  const cached = shardCache.get(key);
  if (
    cached &&
    cached.snapshot.size === members.length &&
    members.every((note) => {
      const snap = cached.snapshot.get(note.id);
      return (
        snap !== undefined &&
        snap.title === note.title &&
        snap.content === note.content &&
        snap.category === note.category &&
        sameTags(snap.tags, note.tags)
      );
    })
  ) {
    return cached.index;
  }

  const index = lunr(function (this: lunr.Builder) {
    this.ref('id');
    this.field('title');
    this.field('content');
    this.field('tags');
    this.field('category');

    members.forEach((note) => {
      this.add({
        id: note.id,
        title: note.title,
        content: note.content,
        tags: note.tags.join(' '),
        category: note.category,
      });
    });
  });

  // 删了再写，让这一项排到 Map 迭代顺序的末尾（最近使用）
  shardCache.delete(key);
  if (shardCache.size >= SEARCH_SHARD_CACHE_LIMIT) {
    const oldest = shardCache.keys().next().value;
    if (oldest !== undefined) shardCache.delete(oldest);
  }
  shardCache.set(key, {
    // tags 拷一份：之后有人原地改数组也能被发现
    snapshot: new Map(
      members.map((note) => [
        note.id,
        { title: note.title, content: note.content, tags: [...note.tags], category: note.category },
      ]),
    ),
    index,
  });
  return index;
}

/**
 * 在所有分片里查询，返回 id → 相关度。分片各自算 idf，分数只是近似可比 —— 用来排序足够，
 * 命中集合与单个大索引一致。
 */
function searchShards(notes: NoteItem[], queryString: string): Map<string, number> {
  const shardCount = shardCountFor(notes.length);
  const scores = new Map<string, number>();
  for (const [shard, members] of groupIntoShards(notes)) {
    for (const r of getShardIndex(shardCount, shard, members).search(queryString)) {
      scores.set(r.ref, r.score);
    }
  }
  return scores;
}

/**
 * 在浏览器空闲时把还没建好（或已失效）的分片补上，每个时间片只建一片，不会长时间卡住界面。
 * 搜索本身遇到缺的分片也会当场补建，所以预热只是把这笔开销挪到后台，结果不受影响。
 * 返回取消函数；笔记又变了就先取消再重新调用。
 */
function warmSearchIndex(notes: NoteItem[]): () => void {
  if (typeof window === 'undefined') return () => {};
  const shardCount = shardCountFor(notes.length);
  const pending = [...groupIntoShards(notes)];
  let cancelled = false;
  let handle: number | undefined;

  const schedule = (fn: () => void, delay = 0) => {
    handle = window.setTimeout(fn, delay);
  };
  const step = () => {
    if (cancelled) return;
    const next = pending.shift();
    if (!next) return;
    try {
      getShardIndex(shardCount, next[0], next[1]);
    } catch (e) {
      console.warn('[Utils.warmSearchIndex] failed to build search index shard', e);
      return;
    }
    schedule(step);
  };
  // 先等一小会儿：连续保存（自动保存）时，上一次的预热会被取消，只有停下来才真正开始
  schedule(step, WARM_START_DELAY_MS);

  return () => {
    cancelled = true;
    if (handle !== undefined) window.clearTimeout(handle);
  };
}

/* ------------------------------------------------------------------ */
/* 查询语法                                                             */
/* ------------------------------------------------------------------ */

export type SearchField = 'title' | 'content' | 'tag' | 'category' | 'date';

export interface SearchTerm {
  field?: SearchField;
  value: string;
  /** 用英文双引号括起来的：只按原文子串匹配，不走 lunr 的词干 */
  phrase: boolean;
  negated: boolean;
}

/** 一组用 AND 连起来的条件；多组之间是 OR */
export type SearchGroup = SearchTerm[];

interface QueryToken {
  raw: string;
  quoted: boolean;
  /** 整个 token 以引号开头：是字面文本，不按 `字段:值` 解析 */
  literal: boolean;
}

/** 按空白切词，双引号内的空白不切（`title:"weekly report"`、`"to be or not"`） */
function tokenizeQuery(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let raw = '';
  let inQuote = false;
  let quoted = false;
  let literal = false;
  let started = false;
  const flush = () => {
    if (started) tokens.push({ raw, quoted, literal });
    raw = '';
    quoted = false;
    literal = false;
    started = false;
  };
  for (const ch of query) {
    if (ch === '"') {
      if (!started) literal = true;
      started = true;
      quoted = true;
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      flush();
      continue;
    }
    started = true;
    raw += ch;
  }
  flush();
  return tokens;
}

function parseTerm(token: QueryToken): Omit<SearchTerm, 'negated'> | null {
  if (!token.literal) {
    const m = token.raw.match(/^(\w+):([\s\S]*)$/);
    if (m && SEARCH_FIELDS.has(m[1].toLowerCase())) {
      // `tag:` 后面还没写内容（正在输入）：先忽略这一项
      if (m[2] === '') return null;
      return { field: m[1].toLowerCase() as SearchField, value: m[2], phrase: token.quoted };
    }
  }
  if (token.raw === '') return null;
  return { value: token.raw, phrase: token.quoted };
}

/**
 * 词袋相似度补充只用于“单个普通词”的查询：它的作用是给没有空格分词的中文做模糊匹配
 * （词只重合一部分字也能找到）。多个词、带字段或 NOT 的查询要精确，不能让只满足一部分条件的笔记混进来。
 */
function allowsSimilarityFallback(groups: SearchGroup[]): boolean {
  if (groups.length !== 1 || groups[0].length !== 1) return false;
  const [term] = groups[0];
  return !term.field && !term.negated && !term.phrase;
}

function textMatchesTerm(note: NoteItem, term: SearchTerm, needle: string): boolean {
  const matchTags = () => note.tags.some((tag) => tag.toLowerCase().includes(needle));
  const matchCategory = () => (note.category ?? '').toLowerCase().includes(needle);
  switch (term.field) {
    case 'title':
      return getLowerText(note).title.includes(needle);
    case 'content':
      return getLowerText(note).content.includes(needle);
    case 'tag':
      return matchTags();
    case 'category':
      return matchCategory();
    case 'date':
      return matchesDateRange(note.createdAt, needle);
    default: {
      const lower = getLowerText(note);
      return (
        lower.title.includes(needle) ||
        lower.content.includes(needle) ||
        matchTags() ||
        matchCategory()
      );
    }
  }
}

/**
 * 把 `YYYY-MM-DD` 解析成当天**本地**零点。不能用 `new Date('2024-03-10')`：
 * 它按 UTC 零点解析，在 UTC 以西的时区会变成前一天的本地日期，搜出来差一天。
 * 只接受完整的年-月-日（分隔符可以是 - / .）；日期不存在（2024-02-31）或还没写完返回 null。
 */
function parseLocalDay(text: string): Date | null {
  const m = text.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // new Date 会把 2024-02-31 滚到 3 月 2 日；滚了就说明日期不存在
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
    ? date
    : null;
}

function nextDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
}

/**
 * 笔记时间戳是否落在日期条件内（按本地日期，起止两天都包含整天）。支持：
 *   2024-01-01              那一天
 *   2024-01-01..2024-12-31  从第一天零点到最后一天结束
 *   2024-01-01..            这一天及以后；..2024-12-31 这一天及以前
 * 写不全或不存在的日期不匹配任何笔记。
 */
function matchesDateRange(timestamp: number, dateRange: string): boolean {
  const sep = dateRange.indexOf('..');
  if (sep === -1) {
    const day = parseLocalDay(dateRange);
    return day !== null && timestamp >= day.getTime() && timestamp < nextDay(day).getTime();
  }

  const startText = dateRange.slice(0, sep);
  const endText = dateRange.slice(sep + 2);
  if (startText.trim() === '' && endText.trim() === '') return false;

  const start = startText.trim() === '' ? null : parseLocalDay(startText);
  const end = endText.trim() === '' ? null : parseLocalDay(endText);
  if ((startText.trim() !== '' && !start) || (endText.trim() !== '' && !end)) return false;

  if (start && timestamp < start.getTime()) return false;
  if (end && timestamp >= nextDay(end).getTime()) return false;
  return true;
}

function sanitizeLunrTerm(term: string): string {
  return term
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * 用 lunr 补充一项的命中：词干匹配（running ↔ run）和相关度分数。
 * 子串匹配已经覆盖了“原样出现”，所以 lunr 只是锦上添花：不适合交给 lunr 的项
 * （引号短语、日期、sanitize 后不是单个词）返回 null，lunr 出错也返回 null。
 */
function lunrHitsForTerm(notes: NoteItem[], term: SearchTerm): Map<string, number> | null {
  if (term.phrase || term.field === 'date') return null;
  // 去掉开头的 -：lunr 会把它当成“排除”
  const word = sanitizeLunrTerm(term.value).replace(/^-+/, '');
  if (!word || word.includes(' ')) return null;
  const field = term.field === 'tag' ? 'tags' : term.field;
  try {
    return searchShards(notes, field ? `${field}:${word}` : word);
  } catch (e) {
    console.warn('[Utils.searchNotes] lunr search failed for a term, using substring match', e);
    return null;
  }
}

export const Utils = {
  /** 空闲时预建搜索索引，返回取消函数；见 warmSearchIndex */
  warmSearchIndex(notes: NoteItem[]): () => void {
    return warmSearchIndex(notes);
  },

  /** 清掉搜索用的内存缓存（索引分片、词袋向量）。缓存里有笔记正文的衍生数据，退出登录/锁定时应当调用 */
  clearSearchCaches() {
    shardCache.clear();
    noteCache.clear();
  },

  /** 当前缓存的索引分片数和笔记向量数（给测试和调试用） */
  searchCacheStats() {
    return { shards: shardCache.size, vectors: noteCache.size };
  },

  formatDate(timestamp: number) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨天';
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  },

  getRelativeTime(timestamp: number) {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;

    return this.formatDate(timestamp);
  },

  truncateText(text: string, length = 100) {
    if (!text) return '';
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
  },

  getColorPalette() {
    return ['#dc96b4', '#b0a8c0', '#d8cbcf', '#f6e0e7', '#9fb1d0', '#c9a8cc', '#d4b5d1', '#e5d1e0'];
  },

  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * 高级搜索。语法：
   *   title:周报  content:React  tag:读书  category:工作  date:2024-01-01..2024-12-31
   *   词与词之间空格 = AND；`OR` 隔开几组条件；`NOT` 排除后面那一项；"双引号" 按原文匹配
   *   例：tag:读书 周报 OR title:总结 NOT 草稿
   * 每一项按“子串出现，或 lunr 词干命中”判断；只有一个普通词的查询还会再补上词袋相似度较高的笔记。
   */
  searchNotes(notes: NoteItem[], query: string): NoteItem[] {
    if (!query.trim()) return notes;

    const groups = this.parseSearchQuery(query);
    if (!groups.length) return notes;

    // 每个不同的项只查一次 lunr
    const termKey = (t: SearchTerm) => `${t.field ?? ''}|${t.phrase ? 'p' : 'w'}|${t.value}`;
    const prepared = new Map<string, { needle: string; lunr: Map<string, number> | null }>();
    for (const group of groups) {
      for (const term of group) {
        const key = termKey(term);
        if (!prepared.has(key)) {
          prepared.set(key, {
            needle: term.value.toLowerCase(),
            lunr: lunrHitsForTerm(notes, term),
          });
        }
      }
    }

    const matched: Array<{ note: NoteItem; score: number }> = [];
    for (const note of notes) {
      let best = -1;
      for (const group of groups) {
        let score = 0;
        let ok = true;
        for (const term of group) {
          const p = prepared.get(termKey(term))!;
          const lunrScore = p.lunr?.get(note.id);
          const hit = lunrScore !== undefined || textMatchesTerm(note, term, p.needle);
          if (hit === term.negated) {
            ok = false;
            break;
          }
          if (!term.negated && lunrScore !== undefined) score += lunrScore;
        }
        if (ok && score > best) best = score;
      }
      if (best >= 0) matched.push({ note, score: best });
    }
    // 相关度高的在前；分数相同保持原来的顺序（Array.prototype.sort 是稳定的）
    matched.sort((a, b) => b.score - a.score);
    const result = matched.map((m) => m.note);

    if (allowsSimilarityFallback(groups)) {
      const seen = new Set(result.map((note) => note.id));
      const qvec = vector.computeVector(groups[0][0].value);
      const similar = notes
        .filter((note) => !seen.has(note.id))
        .map((note) => ({ note, score: vector.cosine(qvec, getNoteVector(note)) }))
        .filter((x) => x.score > VECTOR_MATCH_THRESHOLD);
      similar.sort((a, b) => b.score - a.score);
      for (const { note } of similar) result.push(note);
    }

    return result;
  },

  sanitizeLunrTerm(term: string): string {
    return sanitizeLunrTerm(term);
  },

  /**
   * 解析搜索查询：返回 OR 连接的若干组，每组内是 AND 连接的条件。
   * 没写 AND 的相邻条件按 AND 处理；`NOT` 只作用于紧跟的一项；
   * 开头/结尾悬空的 AND/OR/NOT、还没写完的 `tag:` 会被忽略（边输入边搜时不会出怪结果）。
   */
  parseSearchQuery(query: string): SearchGroup[] {
    const groups: SearchGroup[] = [];
    let current: SearchGroup = [];
    let negateNext = false;

    for (const token of tokenizeQuery(query)) {
      const op = token.quoted ? '' : token.raw.toUpperCase();
      if (op === 'AND') continue;
      if (op === 'OR') {
        if (current.length) {
          groups.push(current);
          current = [];
        }
        negateNext = false;
        continue;
      }
      if (op === 'NOT') {
        negateNext = true;
        continue;
      }
      const term = parseTerm(token);
      if (!term) continue;
      current.push({ ...term, negated: negateNext });
      negateNext = false;
    }
    if (current.length) groups.push(current);
    return groups;
  },

  matchesSingleToken(note: NoteItem, token: { field?: string; value: string }): boolean {
    const field = token.field?.toLowerCase();
    if (field !== undefined && !SEARCH_FIELDS.has(field)) return false;
    return textMatchesTerm(
      note,
      {
        field: field as SearchField | undefined,
        value: token.value,
        phrase: false,
        negated: false,
      },
      token.value.toLowerCase(),
    );
  },

  matchesDateRange(timestamp: number, dateRange: string): boolean {
    return matchesDateRange(timestamp, dateRange);
  },

  /**
   * 模糊搜索（简单实现）
   */
  fuzzySearch(text: string, query: string): boolean {
    if (!query) return true;
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    let queryIndex = 0;
    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === queryLower.length;
  },

  escapeHtml(text: string) {
    const div: HTMLDivElement =
      typeof document !== 'undefined'
        ? document.createElement('div')
        : ({ textContent: '' } as HTMLDivElement);
    if (typeof document !== 'undefined') div.textContent = text;
    return div.innerHTML || '';
  },

  copyToClipboard(text: string) {
    return navigator.clipboard.writeText(text).catch((err) => {
      console.error('复制失败:', err);
      return false;
    });
  },

  getTextSummary(html: string, length = 100) {
    if (typeof document === 'undefined') return '';
    // DOMParser 产出的文档是惰性的：不会加载图片、不会触发 onerror 等事件处理器，
    // 而给（即使游离的）元素赋 innerHTML 会
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = doc.body.textContent || '';
    return this.truncateText(text.replace(/\s+/g, ' '), length);
  },

  sortNotes(notes: NoteItem[], sortBy = 'date') {
    const sorted = [...notes];

    switch (sortBy) {
      case 'date':
        sorted.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
        break;
      case 'color':
        sorted.sort((a, b) => a.color.localeCompare(b.color));
        break;
      default:
        sorted.sort((a, b) => b.createdAt - a.createdAt);
    }

    return sorted;
  },

  prefersDarkMode() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  },

  debounce<T extends (...args: unknown[]) => void>(func: T, wait = 300) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return function executedFunction(..._args: Parameters<T>) {
      const later = () => {
        if (timeout) clearTimeout(timeout);
        func(...(_args as Parameters<T>));
      };
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  throttle<T extends (...args: unknown[]) => void>(func: T, limit = 300) {
    let inThrottle = false;
    return function (this: unknown, ..._args: Parameters<T>) {
      if (!inThrottle) {
        func.apply(this, _args as Parameters<T>);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },

  estimateReadingTime(text: string) {
    const wordsPerMinute = 200;
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.ceil(words / wordsPerMinute);
    return minutes > 0 ? minutes : 1;
  },

  getWordFrequency(texts: string[], limit = 20) {
    const freq: Record<string, number> = {};
    texts.forEach((text) => {
      const words = text.toLowerCase().match(/[\u4e00-\u9fa5\w]+/g) || [];
      words.forEach((word) => {
        if (word.length > 1) {
          freq[word] = (freq[word] || 0) + 1;
        }
      });
    });

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  },
} as const;

export default Utils;

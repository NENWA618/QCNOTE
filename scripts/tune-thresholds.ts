/**
 * 在你自己的笔记上调语义搜索的相似度阈值。
 *
 * 用法：
 *   npx tsx scripts/tune-thresholds.ts --notes 备份.json --cases 查询标注.json
 *
 *   --notes   应用里“导出数据”得到的 JSON 备份（笔记数组）
 *   --cases   你标注的查询，格式：
 *               [
 *                 { "query": "我之前是怎么配置 WebDAV 同步的？", "relevant": ["WebDAV 同步配置"] },
 *                 { "query": "火星殖民计划", "relevant": [] }
 *               ]
 *             relevant 里写应该被找到的笔记，可以是笔记 id，也可以是笔记的完整标题；
 *             留空表示“这个问题在笔记里没有答案”——这类查询最能检验阈值挡不挡得住无关结果。
 *   --from / --to / --step   扫描的阈值范围，默认 0.2 / 0.8 / 0.05
 *   --fake-embed             用字符哈希代替真实模型，只用来检查流程能不能跑通，得分没有参考价值
 *
 * 用的是和线上完全相同的模型（lib/embeddingModel.ts）、分块和排序代码（lib/rag.ts 的 searchByMeaning），
 * 所以结论可以直接用。第一次运行会从 Hugging Face 下载模型（约 100 多 MB），之后走本地缓存。
 *
 * 标注 20～30 个查询（其中几个没有答案的）就够看出趋势；只有几个查询时，F1 会很不稳，
 * 以输出末尾的得分分布为准：相关笔记的得分和无关笔记的得分分得越开，阈值越好定。
 */
import { readFileSync } from 'node:fs';
import { EMBEDDING_MODEL_ID } from '../lib/embeddingModel';
import {
  NOTE_MATCH_THRESHOLD,
  PASSAGE_MATCH_THRESHOLD,
  searchByMeaning,
  type RagCache,
  type RagCacheStore,
} from '../lib/rag';
import {
  bestRow,
  summarizeScores,
  sweepThresholds,
  thresholdRange,
  type ScoreSummary,
  type SweepRow,
  type TuningCase,
} from '../lib/ragTuning';
import type { NoteItem } from '../lib/storage';

type Embed = (texts: string[]) => Promise<number[][]>;

interface Args {
  notes: string;
  cases: string;
  from: number;
  to: number;
  step: number;
  fake: boolean;
}

function fail(message: string): never {
  console.error(`错误：${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { notes: '', cases: '', from: 0.2, to: 0.8, step: 0.05, fake: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i] ?? fail(`${flag} 后面缺少参数`);
    switch (flag) {
      case '--notes':
        args.notes = value();
        break;
      case '--cases':
        args.cases = value();
        break;
      case '--from':
      case '--to':
      case '--step': {
        const n = Number(value());
        if (!Number.isFinite(n)) fail(`${flag} 需要一个数字`);
        args[flag.slice(2) as 'from' | 'to' | 'step'] = n;
        break;
      }
      case '--fake-embed':
        args.fake = true;
        break;
      default:
        fail(`不认识的参数 ${flag}（见脚本开头的用法说明）`);
    }
  }
  if (!args.notes || !args.cases) fail('需要 --notes 和 --cases，见脚本开头的用法说明');
  return args;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    return fail(`读取 ${path} 失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

function loadNotes(path: string): NoteItem[] {
  const raw = readJson(path);
  if (!Array.isArray(raw)) fail(`${path} 不是笔记数组（请用应用里“导出数据”得到的备份）`);
  const notes = (raw as Partial<NoteItem>[])
    .filter((n) => n && typeof n.id === 'string' && !n.isDeleted)
    .map((n): NoteItem => ({
      id: n.id!,
      title: typeof n.title === 'string' ? n.title : '',
      content: typeof n.content === 'string' ? n.content : '',
      category: n.category ?? '',
      tags: Array.isArray(n.tags) ? n.tags : [],
      color: n.color ?? '',
      createdAt: n.createdAt ?? 0,
      updatedAt: n.updatedAt ?? 0,
    }));
  if (notes.length === 0) fail(`${path} 里没有可用的笔记`);
  return notes;
}

function loadCases(path: string, notes: NoteItem[]): TuningCase[] {
  const raw = readJson(path);
  if (!Array.isArray(raw)) fail(`${path} 应该是一个数组`);
  const byId = new Map(notes.map((n) => [n.id, n]));
  return (raw as { query?: unknown; relevant?: unknown }[]).map((c, i) => {
    if (typeof c?.query !== 'string' || !c.query.trim()) fail(`第 ${i + 1} 个查询缺少 query`);
    if (!Array.isArray(c.relevant)) fail(`第 ${i + 1} 个查询（${c.query}）缺少 relevant 数组`);
    const relevant = new Set<string>();
    for (const ref of c.relevant as unknown[]) {
      if (typeof ref !== 'string') fail(`第 ${i + 1} 个查询的 relevant 只能写笔记 id 或标题`);
      if (byId.has(ref)) {
        relevant.add(ref);
        continue;
      }
      const titled = notes.filter((n) => n.title === ref);
      if (titled.length === 0)
        fail(`查询“${c.query}”里的“${ref}”既不是笔记 id，也不是任何笔记的标题`);
      titled.forEach((n) => relevant.add(n.id));
    }
    return { query: c.query.trim(), relevant: [...relevant] };
  });
}

/** 字符二元组哈希：只为了让脚本在没有模型时也能跑通，得分没有语义含义 */
function fakeEmbed(texts: string[]): Promise<number[][]> {
  const DIM = 96;
  return Promise.resolve(
    texts.map((text) => {
      const v = new Array<number>(DIM).fill(0);
      const chars = Array.from(text);
      for (let i = 0; i < chars.length - 1; i++) {
        const code = chars[i].codePointAt(0)! * 31 + chars[i + 1].codePointAt(0)!;
        v[code % DIM] += 1;
      }
      v[0] += 0.01; // 避免零向量
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return v.map((x) => x / norm);
    }),
  );
}

async function loadRealEmbed(): Promise<Embed> {
  const { pipeline } = await import('@huggingface/transformers');
  console.error(`正在加载模型 ${EMBEDDING_MODEL_ID}（第一次需要下载）…`);
  let extractor;
  try {
    extractor = await pipeline('feature-extraction', EMBEDDING_MODEL_ID);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return fail(
      `加载模型失败（${reason}）。第一次运行需要能访问 huggingface.co 下载模型；` +
        '网络受限的话，可以先在能联网的机器上跑一次，让模型缓存下来。',
    );
  }
  return async (texts) => {
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist() as number[][];
  };
}

/** 同一段文本只算一次：扫描时同一个查询会被检索很多遍 */
function memoize(embed: Embed): Embed {
  const memo = new Map<string, number[]>();
  return async (texts) => {
    const misses = [...new Set(texts.filter((t) => !memo.has(t)))];
    if (misses.length > 0) {
      const vectors = await embed(misses);
      misses.forEach((t, i) => memo.set(t, vectors[i]));
    }
    return texts.map((t) => memo.get(t)!);
  };
}

function memoryStore(): RagCacheStore {
  let cache: RagCache | null = null;
  return {
    loadRagCache: async () => (cache ? structuredClone(cache) : null),
    saveRagCache: async (c) => {
      cache = structuredClone(c);
    },
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(4);

function printTable(title: string, rows: SweepRow[], current: number) {
  const best = bestRow(rows);
  console.log(`\n${title}`);
  console.log('阈值   返回  找对  找错  漏掉  精确率  召回率    F1');
  for (const r of rows) {
    const marks = [
      r === best ? '← F1 最高' : '',
      Math.abs(r.threshold - current) < 1e-9 ? '← 当前线上值' : '',
    ]
      .filter(Boolean)
      .join(' ');
    console.log(
      `${r.threshold.toFixed(2)}  ${String(r.returned).padStart(4)}  ${String(r.truePositives).padStart(4)}  ` +
        `${String(r.falsePositives).padStart(4)}  ${String(r.falseNegatives).padStart(4)}  ` +
        `${pct(r.precision).padStart(6)}  ${pct(r.recall).padStart(6)}  ${r.f1.toFixed(2)}  ${marks}`,
    );
  }
  if (best)
    console.log(`建议：${best.threshold.toFixed(2)}（F1 ${best.f1.toFixed(2)}；并列时取更高的）`);
}

function printSummary(label: string, s: ScoreSummary | null) {
  if (!s) return console.log(`  ${label}：（没有数据）`);
  const f = (x: number) => x.toFixed(2);
  console.log(
    `  ${label}（${s.n} 个）：最小 ${f(s.min)}  25% ${f(s.p25)}  中位 ${f(s.median)}  75% ${f(s.p75)}  最大 ${f(s.max)}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const notes = loadNotes(args.notes);
  const cases = loadCases(args.cases, notes);
  const thresholds = thresholdRange(args.from, args.to, args.step);

  if (args.fake) {
    console.warn('⚠ 正在使用 --fake-embed：得分没有语义含义，只能用来检查脚本能不能跑通。\n');
  }
  const embed = memoize(args.fake ? fakeEmbed : await loadRealEmbed());
  const store = memoryStore();
  console.log(
    `${notes.length} 篇笔记，${cases.length} 个查询（其中 ${cases.filter((c) => c.relevant.length === 0).length} 个没有答案）`,
  );

  // 先建一次索引；之后每次检索都命中内存缓存，只剩打分
  await searchByMeaning(cases[0].query, notes, store, { embed });

  // 笔记级：线上列表追加“语义相关”笔记用的是 noteThreshold
  const noteRows = await sweepThresholds(
    cases,
    thresholds,
    async (query, t) =>
      (await searchByMeaning(query, notes, store, { embed, noteThreshold: t })).noteIds,
  );
  printTable(
    `笔记级阈值（线上 NOTE_MATCH_THRESHOLD，列表里的“语义相关”）`,
    noteRows,
    NOTE_MATCH_THRESHOLD,
  );

  // 段落级：沿用线上默认的 topK / 每篇上限，只改 threshold。
  // 按“段落所属笔记有没有被带出来”评估，所以这里的指标是笔记粒度，不是段落粒度
  const passageRows = await sweepThresholds(cases, thresholds, async (query, t) =>
    (await searchByMeaning(query, notes, store, { embed, threshold: t })).hits.map((h) => h.noteId),
  );
  printTable(
    `段落级阈值（线上 PASSAGE_MATCH_THRESHOLD，“相关段落”面板）`,
    passageRows,
    PASSAGE_MATCH_THRESHOLD,
  );

  // 得分分布：每个查询对每篇笔记取最相关那一块的得分，按标注分成“相关”和“无关”
  const relevantScores: number[] = [];
  const irrelevantScores: number[] = [];
  for (const c of cases) {
    const relevant = new Set(c.relevant);
    const { hits } = await searchByMeaning(c.query, notes, store, {
      embed,
      threshold: -1,
      topK: Infinity,
      maxPerNote: Infinity,
    });
    const best = new Map<string, number>();
    for (const h of hits) best.set(h.noteId, Math.max(best.get(h.noteId) ?? -1, h.score));
    for (const [id, score] of best)
      (relevant.has(id) ? relevantScores : irrelevantScores).push(score);
  }
  console.log('\n得分分布（每个查询 × 每篇笔记取最相关的一块）');
  printSummary('相关笔记', summarizeScores(relevantScores));
  printSummary('无关笔记', summarizeScores(irrelevantScores));
  console.log(
    '  相关的“最小/25%”高于无关的“75%/最大”越多，阈值越好定；两组大幅重叠说明单靠阈值分不开。',
  );

  console.log(
    '\n改完阈值后：把建议值填回 lib/rag.ts 的 PASSAGE_MATCH_THRESHOLD / NOTE_MATCH_THRESHOLD，并重新跑 npm test。',
  );
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

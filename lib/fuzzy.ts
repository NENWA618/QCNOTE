/**
 * 轻量模糊匹配，用于命令面板 / 双链补全。
 *
 * - 查询按空白拆成多个词，每个词都要命中（AND），顺序无关；
 * - 一个词优先按“连续子串”匹配，其次按“子序列”（`pjt` 命中 `project`）；
 * - 对词首、连续命中给加分；目标越短、命中越靠前，分数越高。
 *
 * 返回命中的字符下标，用于高亮。下标是 UTF-16 下标，可直接用于 `slice`。
 */

export interface FuzzyMatch {
  score: number;
  /** 命中字符的下标，升序、去重 */
  indices: number[];
}

const isBoundary = (text: string, i: number) => {
  if (i === 0) return true;
  const prev = text[i - 1];
  return /[\s\-_/.,:;()[\]【】（）]/.test(prev);
};

function matchToken(text: string, token: string): FuzzyMatch | null {
  const sub = text.indexOf(token);
  if (sub !== -1) {
    const indices = Array.from({ length: token.length }, (_, k) => sub + k);
    const score = 100 + token.length * 4 - sub * 0.5 + (isBoundary(text, sub) ? 25 : 0);
    return { score, indices };
  }

  // 子序列：贪心取最靠左的命中
  const indices: number[] = [];
  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of token) {
    const idx = text.indexOf(ch, from);
    if (idx === -1) return null;
    score += 10;
    if (idx === prev + 1) score += 15;
    else if (prev >= 0) score -= Math.min(idx - prev - 1, 8);
    if (isBoundary(text, idx)) score += 8;
    for (let k = 0; k < ch.length; k++) indices.push(idx + k);
    prev = idx + ch.length - 1;
    from = idx + ch.length;
  }
  return { score, indices };
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { score: 0, indices: [] };

  const text = target.toLowerCase();
  let total = 0;
  const all = new Set<number>();
  for (const token of tokens) {
    const m = matchToken(text, token);
    if (!m) return null;
    total += m.score;
    m.indices.forEach((i) => all.add(i));
  }
  // 越短的标题越“精确”；惩罚很轻，只用来打破平局
  total -= target.length * 0.05;
  return { score: total, indices: [...all].sort((a, b) => a - b) };
}

export interface Ranked<T> {
  item: T;
  match: FuzzyMatch;
}

/** 按分数从高到低排；分数相同保持原顺序（稳定），所以调用方可以先按“最近”排好再传进来 */
export function rankByFuzzy<T>(
  items: readonly T[],
  query: string,
  getText: (item: T) => string,
): Ranked<T>[] {
  const ranked: (Ranked<T> & { order: number })[] = [];
  items.forEach((item, order) => {
    const match = fuzzyMatch(query, getText(item));
    if (match) ranked.push({ item, match, order });
  });
  ranked.sort((a, b) => b.match.score - a.match.score || a.order - b.order);
  return ranked.map(({ item, match }) => ({ item, match }));
}

export interface Segment {
  text: string;
  match: boolean;
}

/** 把文本按命中下标切成交替的“命中 / 未命中”片段，用于渲染高亮 */
export function highlightSegments(text: string, indices: readonly number[]): Segment[] {
  if (indices.length === 0) return [{ text, match: false }];
  const hit = new Set(indices);
  const segments: Segment[] = [];
  let buf = '';
  let current = hit.has(0);
  for (let i = 0; i < text.length; i++) {
    const isHit = hit.has(i);
    if (isHit !== current) {
      segments.push({ text: buf, match: current });
      buf = '';
      current = isHit;
    }
    buf += text[i];
  }
  if (buf) segments.push({ text: buf, match: current });
  return segments;
}

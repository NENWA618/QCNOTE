/**
 * 调相似度阈值用的评估函数（被 scripts/tune-thresholds.ts 使用）。
 *
 * 做法：给一批查询标好“应该找到哪些笔记”，对一串候选阈值各跑一遍检索，
 * 数出找对了多少、找错了多少、漏了多少，从而选出平衡点。
 * 检索本身由调用方传入（脚本里传的是线上用的 searchByMeaning），这里只管算指标，
 * 所以调阈值走的排序、topK、每篇上限逻辑和线上完全是同一份代码。
 */

export interface TuningCase {
  query: string;
  /** 应该被找到的笔记 id。留空表示“这个查询在笔记里没有答案”，用来检验阈值能不能挡住无关结果 */
  relevant: string[];
}

export interface SweepRow {
  threshold: number;
  /** 所有查询里返回的笔记数之和（同一查询内按笔记去重） */
  returned: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface ScoreSummary {
  n: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
}

/** 闭区间 [from, to]，按 step 递增；小数位修正到 4 位，避免 0.1 + 0.2 这类累加误差 */
export function thresholdRange(from: number, to: number, step: number): number[] {
  if (!(step > 0)) throw new Error('step 必须大于 0');
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const value = Math.round((from + i * step) * 1e4) / 1e4;
    if (value > to + 1e-9) break;
    out.push(value);
  }
  return out;
}

/**
 * 对每个候选阈值，用 run(query, threshold) 取回返回的笔记 id，和标注对照后汇总（微平均）。
 * run 返回的 id 可以有重复（比如一篇笔记命中了两个段落），这里按查询去重：
 * 衡量的是“有没有把这篇笔记带出来”，而不是段落条数。
 */
export async function sweepThresholds(
  cases: TuningCase[],
  thresholds: number[],
  run: (query: string, threshold: number) => Promise<string[]>,
): Promise<SweepRow[]> {
  const rows: SweepRow[] = [];
  for (const threshold of thresholds) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const c of cases) {
      const relevant = new Set(c.relevant);
      const returned = new Set(await run(c.query, threshold));
      for (const id of returned) {
        if (relevant.has(id)) tp++;
        else fp++;
      }
      for (const id of relevant) if (!returned.has(id)) fn++;
    }
    const returned = tp + fp;
    const denominator = 2 * tp + fp + fn;
    rows.push({
      threshold,
      returned,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision: returned === 0 ? 0 : tp / returned,
      recall: tp + fn === 0 ? 0 : tp / (tp + fn),
      // 没有任何标注的相关笔记、也什么都没返回：挡得干干净净，算满分
      f1: denominator === 0 ? 1 : (2 * tp) / denominator,
    });
  }
  return rows;
}

/** F1 最高的一行；并列时取阈值更高的——这个产品里“宁缺毋滥” */
export function bestRow(rows: SweepRow[]): SweepRow | null {
  let best: SweepRow | null = null;
  for (const row of rows) {
    if (
      !best ||
      row.f1 > best.f1 + 1e-12 ||
      (Math.abs(row.f1 - best.f1) <= 1e-12 && row.threshold > best.threshold)
    ) {
      best = row;
    }
  }
  return best;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** 一组相似度得分的分布。标注太少、F1 不稳时，看“相关”和“无关”两组分布是否分得开更可靠 */
export function summarizeScores(values: number[]): ScoreSummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0],
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };
}

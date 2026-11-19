import { describe, expect, it, vi } from 'vitest';
import {
  bestRow,
  summarizeScores,
  sweepThresholds,
  thresholdRange,
  type SweepRow,
  type TuningCase,
} from '../lib/ragTuning';

describe('thresholdRange', () => {
  it('闭区间、按步长递增，没有浮点累加误差', () => {
    expect(thresholdRange(0.3, 0.5, 0.05)).toEqual([0.3, 0.35, 0.4, 0.45, 0.5]);
    expect(thresholdRange(0.1, 0.4, 0.1)).toEqual([0.1, 0.2, 0.3, 0.4]);
  });
  it('步长非法时报错', () => {
    expect(() => thresholdRange(0.1, 0.5, 0)).toThrow();
    expect(() => thresholdRange(0.1, 0.5, -0.1)).toThrow();
  });
});

describe('sweepThresholds', () => {
  // 假检索：每个笔记有固定得分，返回得分 >= 阈值的笔记
  const SCORES: Record<string, Record<string, number>> = {
    苹果: { a: 0.9, b: 0.6, noise: 0.4 },
    睡眠: { c: 0.7, noise: 0.5 },
    火星: { noise: 0.45 }, // 没有答案的查询
  };
  const run = async (q: string, t: number) =>
    Object.entries(SCORES[q])
      .filter(([, s]) => s >= t)
      .map(([id]) => id);
  const cases: TuningCase[] = [
    { query: '苹果', relevant: ['a', 'b'] },
    { query: '睡眠', relevant: ['c'] },
    { query: '火星', relevant: [] },
  ];

  it('低阈值召回全但混进噪声，高阈值干净但漏掉', async () => {
    const [low, mid, high] = await sweepThresholds(cases, [0.3, 0.55, 0.8], run);

    expect(low).toMatchObject({ truePositives: 3, falsePositives: 3, falseNegatives: 0 });
    expect(low.recall).toBe(1);
    expect(low.precision).toBeCloseTo(0.5);

    expect(mid).toMatchObject({ truePositives: 3, falsePositives: 0, falseNegatives: 0 });
    expect(mid.f1).toBe(1);

    expect(high).toMatchObject({ truePositives: 1, falsePositives: 0, falseNegatives: 2 });
    expect(high.precision).toBe(1);
    expect(high.recall).toBeCloseTo(1 / 3);
  });

  it('同一查询里重复返回的笔记只算一次（段落命中同一篇不重复计）', async () => {
    const rows = await sweepThresholds([{ query: 'q', relevant: ['a'] }], [0.5], async () => [
      'a',
      'a',
      'a',
      'x',
      'x',
    ]);
    expect(rows[0]).toMatchObject({ returned: 2, truePositives: 1, falsePositives: 1 });
  });

  it('每个阈值、每个查询各检索一次，并把阈值传给 run', async () => {
    const spy = vi.fn(async () => [] as string[]);
    await sweepThresholds(cases, [0.4, 0.6], spy);
    expect(spy).toHaveBeenCalledTimes(6);
    expect(spy).toHaveBeenCalledWith('苹果', 0.4);
    expect(spy).toHaveBeenCalledWith('火星', 0.6);
  });

  it('什么都没返回时精确率记 0，不会除零；没有任何应找到的笔记且挡得干净时 F1 记 1', async () => {
    const [row] = await sweepThresholds([{ query: 'q', relevant: ['a'] }], [0.9], async () => []);
    expect(row).toMatchObject({ precision: 0, recall: 0, f1: 0, falseNegatives: 1 });

    const [clean] = await sweepThresholds([{ query: 'q', relevant: [] }], [0.9], async () => []);
    expect(clean.f1).toBe(1);
  });
});

describe('bestRow', () => {
  const row = (threshold: number, f1: number): SweepRow => ({
    threshold,
    returned: 0,
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    precision: 0,
    recall: 0,
    f1,
  });

  it('取 F1 最高的一行', () => {
    expect(bestRow([row(0.3, 0.5), row(0.4, 0.8), row(0.5, 0.6)])?.threshold).toBe(0.4);
  });
  it('并列时取阈值更高的（宁缺毋滥）', () => {
    expect(bestRow([row(0.3, 0.8), row(0.4, 0.8), row(0.5, 0.7)])?.threshold).toBe(0.4);
  });
  it('空输入返回 null', () => {
    expect(bestRow([])).toBeNull();
  });
});

describe('summarizeScores', () => {
  it('给出最小、四分位、中位数、最大值', () => {
    expect(summarizeScores([0.2, 0.4, 0.6, 0.8, 1])).toEqual({
      n: 5,
      min: 0.2,
      p25: 0.4,
      median: 0.6,
      p75: 0.8,
      max: 1,
    });
  });
  it('单个值与空输入', () => {
    expect(summarizeScores([0.5])).toMatchObject({ n: 1, min: 0.5, median: 0.5, max: 0.5 });
    expect(summarizeScores([])).toBeNull();
  });
});

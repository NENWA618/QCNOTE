import { describe, it, expect } from 'vitest';
import { fuzzyMatch, highlightSegments, rankByFuzzy } from '../lib/fuzzy';

describe('fuzzyMatch', () => {
  it('空查询匹配一切，没有高亮', () => {
    expect(fuzzyMatch('', '任何标题')).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch('   ', 'x')?.indices).toEqual([]);
  });

  it('连续子串命中，返回准确下标', () => {
    expect(fuzzyMatch('计划', '项目计划书')?.indices).toEqual([2, 3]);
  });

  it('不区分大小写', () => {
    expect(fuzzyMatch('READ', 'readme')?.indices).toEqual([0, 1, 2, 3]);
  });

  it('子序列命中：pjt → project', () => {
    expect(fuzzyMatch('pjt', 'project')?.indices).toEqual([0, 3, 6]);
  });

  it('子序列顺序必须一致', () => {
    expect(fuzzyMatch('tjp', 'project')).toBeNull();
  });

  it('多个词都要命中，顺序无关', () => {
    expect(fuzzyMatch('计划 项目', '项目计划书')).not.toBeNull();
    expect(fuzzyMatch('计划 周报', '项目计划书')).toBeNull();
  });

  it('连续子串得分高于零散子序列；词首命中得分更高', () => {
    const exact = fuzzyMatch('note', 'my note')!;
    const scattered = fuzzyMatch('note', 'n-o-t-e')!;
    expect(exact.score).toBeGreaterThan(scattered.score);
    expect(fuzzyMatch('note', 'note book')!.score).toBeGreaterThan(
      fuzzyMatch('note', 'a footnote')!.score,
    );
  });
});

describe('rankByFuzzy', () => {
  const items = ['周报 2024', '项目周报', '读书笔记', '周'];

  it('按分数排序并过滤不命中的', () => {
    const ranked = rankByFuzzy(items, '周报', (s) => s).map((r) => r.item);
    expect(ranked).toEqual(['周报 2024', '项目周报']);
  });

  it('分数相同保持原顺序（稳定），调用方可以先按“最近”排好', () => {
    const ranked = rankByFuzzy(['bb', 'ab', 'cb'], 'b', (s) => s).map((r) => r.item);
    expect(ranked.slice().sort()).toEqual(['ab', 'bb', 'cb']);
    expect(rankByFuzzy(['x1', 'x2', 'x3'], 'x', (s) => s).map((r) => r.item)).toEqual([
      'x1',
      'x2',
      'x3',
    ]);
  });
});

describe('highlightSegments', () => {
  it('没有命中 → 整段未命中', () => {
    expect(highlightSegments('abc', [])).toEqual([{ text: 'abc', match: false }]);
  });

  it('交替切分命中与未命中片段', () => {
    expect(highlightSegments('项目计划书', [2, 3])).toEqual([
      { text: '项目', match: false },
      { text: '计划', match: true },
      { text: '书', match: false },
    ]);
  });

  it('命中在开头 / 结尾', () => {
    expect(highlightSegments('abc', [0, 2])).toEqual([
      { text: 'a', match: true },
      { text: 'b', match: false },
      { text: 'c', match: true },
    ]);
  });
});

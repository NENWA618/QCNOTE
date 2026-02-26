import { describe, it, expect } from 'vitest';
import Utils from '../lib/utils';

describe('Utils', () => {
  it('truncateText short text unchanged', () => {
    const t = '短文本';
    expect(Utils.truncateText(t, 10)).toBe(t);
  });

  it('truncateText long text truncated', () => {
    const t = '这是一段很长的文本，用来测试截断函数是否工作正常。';
    const r = Utils.truncateText(t, 10);
    expect(r.length).toBeLessThanOrEqual(13); // 10 + '...'
    expect(r.endsWith('...')).toBe(true);
  });

  it('estimateReadingTime returns at least 1', () => {
    const minutes = Utils.estimateReadingTime('一二三');
    expect(minutes).toBeGreaterThanOrEqual(1);
  });
});

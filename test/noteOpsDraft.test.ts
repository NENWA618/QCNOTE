import { describe, it, expect } from 'vitest';
import { createNote } from '../lib/storage/noteOps';

describe('createNote（草稿第一次保存）', () => {
  it('保留文字着色区间', () => {
    const ranges = [{ startIndex: 0, endIndex: 2, color: '#ff6b6b' }];
    expect(
      createNote({ title: 'a', content: 'abcd', coloredRanges: ranges }).coloredRanges,
    ).toEqual(ranges);
  });

  it('没有着色时不带 coloredRanges 字段', () => {
    expect('coloredRanges' in createNote({ title: 'a' })).toBe(false);
    expect('coloredRanges' in createNote({ title: 'a', coloredRanges: [] })).toBe(false);
  });

  it('空标题存为“无标题”，分类和颜色取默认值', () => {
    const n = createNote({ title: '', content: 'x' });
    expect(n.title).toBe('无标题');
    expect(n.category).toBe('生活');
    expect(n.color).toBe('#dc96b4');
  });
});

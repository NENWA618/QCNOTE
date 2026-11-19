import { describe, it, expect } from 'vitest';
import { computeTextStats } from '../lib/textStats';

describe('computeTextStats', () => {
  it('空文本全是 0', () => {
    expect(computeTextStats('')).toEqual({ words: 0, chars: 0, readingMinutes: 0 });
    expect(computeTextStats('  \n\t ')).toMatchObject({ words: 0, chars: 0, readingMinutes: 0 });
  });

  it('中文按字计数，不受空白和标点影响字数的口径', () => {
    expect(computeTextStats('你好，世界').words).toBe(4);
    expect(computeTextStats('你 好\n世 界').words).toBe(4);
  });

  it('英文按单词计数，连字符/撇号连成一个词', () => {
    expect(computeTextStats('Hello world').words).toBe(2);
    expect(computeTextStats("don't state-of-the-art").words).toBe(2);
  });

  it('中英文混排：连在一起写也能分开数', () => {
    expect(computeTextStats('用React写Notes应用').words).toBe(2 + 1 + 1 + 2);
  });

  it('日文假名和韩文也算字', () => {
    expect(computeTextStats('こんにちは').words).toBe(5);
    expect(computeTextStats('안녕').words).toBe(2);
  });

  it('chars 不含空白，emoji 算一个字符', () => {
    expect(computeTextStats('a b\nc').chars).toBe(3);
    expect(computeTextStats('😀😀').chars).toBe(2);
  });

  it('有内容时阅读时间至少 1 分钟，长文按速度累加', () => {
    expect(computeTextStats('短').readingMinutes).toBe(1);
    expect(computeTextStats('字'.repeat(400)).readingMinutes).toBe(1);
    expect(computeTextStats('字'.repeat(401)).readingMinutes).toBe(2);
    expect(computeTextStats('word '.repeat(440)).readingMinutes).toBe(2);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import Utils from '../lib/utils';

const mk = (
  id: string,
  title: string,
  content: string,
  tags: string[] = [],
  category = 'misc',
  createdAt = new Date(2024, 2, 10, 12).getTime(),
) => ({ id, title, content, tags, category, color: '#fff', createdAt, updatedAt: createdAt });

const notes = [
  mk('1', 'weekly report', 'apple pie plan', ['work'], 'job'),
  mk('2', 'plan draft', 'apple orchard', ['work', 'draft'], 'job'),
  mk('3', '周报', '今天学习了神经网络和梯度下降', ['读书'], '学习'),
  mk(
    '4',
    '会议记录',
    '讨论项目进度和下周计划',
    ['work'],
    'job',
    new Date(2024, 4, 1, 12).getTime(),
  ),
  mk('5', 'link', 'see http://example.com now', [], 'misc'),
  mk('6', 'to be or not', 'salt and pepper', [], 'misc'),
];
const search = (q: string) =>
  Utils.searchNotes(notes as any, q)
    .map((n) => n.id)
    .sort();

describe('parseSearchQuery', () => {
  const term = (value: string, extra: object = {}) => ({
    value,
    phrase: false,
    negated: false,
    ...extra,
  });

  it('相邻条件按 AND 处理：字段和自由文本可以混写', () => {
    expect(Utils.parseSearchQuery('tag:work title:plan')).toEqual([
      [term('work', { field: 'tag' }), term('plan', { field: 'title' })],
    ]);
    expect(Utils.parseSearchQuery('date:2024-03-01..2024-03-31 zebra')).toEqual([
      [term('2024-03-01..2024-03-31', { field: 'date' }), term('zebra')],
    ]);
  });

  it('OR 把查询分成几组，NOT 只作用于紧跟的一项', () => {
    expect(Utils.parseSearchQuery('a b OR c NOT d')).toEqual([
      [term('a'), term('b')],
      [term('c'), term('d', { negated: true })],
    ]);
    expect(Utils.parseSearchQuery('a AND b')).toEqual([[term('a'), term('b')]]);
  });

  it('双引号内的空白不切开，字段值也可以带引号', () => {
    expect(Utils.parseSearchQuery('"to be" title:"weekly report"')).toEqual([
      [term('to be', { phrase: true }), term('weekly report', { field: 'title', phrase: true })],
    ]);
  });

  it('引号里的 AND/OR/NOT 和 字段:值 是普通文字', () => {
    expect(Utils.parseSearchQuery('"OR" "title:x"')).toEqual([
      [term('OR', { phrase: true }), term('title:x', { phrase: true })],
    ]);
  });

  it('悬空的操作符、还没写完的字段会被忽略；未知字段名当普通文字', () => {
    expect(Utils.parseSearchQuery('apple AND')).toEqual([[term('apple')]]);
    expect(Utils.parseSearchQuery('OR apple NOT')).toEqual([[term('apple')]]);
    expect(Utils.parseSearchQuery('tag:')).toEqual([]);
    expect(Utils.parseSearchQuery('foo:bar')).toEqual([[term('foo:bar')]]);
    expect(Utils.parseSearchQuery('   ')).toEqual([]);
  });
});

describe('searchNotes 查询语义', () => {
  beforeEach(() => Utils.clearSearchCaches());

  it('字段和自由文本混写，等同于 AND', () => {
    expect(search('tag:work plan')).toEqual(['1', '2']);
    expect(search('tag:work title:plan')).toEqual(['2']);
    expect(search('tag:work 周报')).toEqual([]);
  });

  it('日期范围可以和关键词直接写在一起，写在前后都行', () => {
    expect(search('date:2024-03-01..2024-03-31 apple')).toEqual(['1', '2']);
    expect(search('apple date:2024-03-01..2024-03-31')).toEqual(['1', '2']);
    expect(search('category:job date:2024-05-01')).toEqual(['4']);
  });

  it('多个词必须都出现（AND），而不是出现任何一个', () => {
    expect(search('apple pie')).toEqual(['1']);
    expect(search('apple orchard')).toEqual(['2']);
    expect(search('apple AND pie')).toEqual(['1']);
    expect(search('pie orchard')).toEqual([]);
  });

  it('OR 是并集，AND 比 OR 结合得更紧', () => {
    expect(search('apple OR 神经网络')).toEqual(['1', '2', '3']);
    expect(search('pie plan OR orchard')).toEqual(['1', '2']);
    expect(search('tag:work OR 读书')).toEqual(['1', '2', '3', '4']);
  });

  it('NOT 排除后面那一项，可以带字段', () => {
    expect(search('tag:work NOT draft')).toEqual(['1', '4']);
    expect(search('tag:work NOT tag:draft')).toEqual(['1', '4']);
    expect(search('NOT apple')).toEqual(['3', '4', '5', '6']);
  });

  it('双引号按原文匹配：词序不对就不命中；引号里的 or/not 是普通文字', () => {
    expect(search('"apple pie"')).toEqual(['1']);
    expect(search('"pie apple"')).toEqual([]);
    expect(search('title:"weekly report"')).toEqual(['1']);
    expect(search('"to be or not"')).toEqual(['6']);
  });

  it('含冒号的网址、未知字段名当普通文字搜', () => {
    expect(search('http://example.com')).toEqual(['5']);
    expect(search('foo:bar')).toEqual([]);
  });

  it('边输入边搜：悬空的操作符、写了一半的字段不会让结果变空', () => {
    expect(search('apple AND')).toEqual(['1', '2']);
    expect(search('apple NOT')).toEqual(['1', '2']);
    expect(search('OR apple')).toEqual(['1', '2']);
    expect(search('tag:')).toHaveLength(notes.length);
  });

  it('lunr 词干仍然有效（apples 能找到 apple）', () => {
    expect(search('apples')).toEqual(['1', '2']);
  });

  it('单个词的查询保留模糊回退：中文只重合一部分字也能找到', () => {
    expect(search('神经网络络')).toEqual(['3']);
    // 但只共用一个字的无关笔记不会被带出来
    expect(search('梯度')).toEqual(['3']);
  });

  it('多个词的查询不做模糊回退', () => {
    // “神经网络” 和 “络络络” 缺一不可：没有笔记同时满足，不会因为相似度被补进来
    expect(search('神经网络 络络络')).toEqual([]);
  });
});

describe('date: 条件（按本地日期）', () => {
  const at = (y: number, m: number, d: number, h = 12, min = 0, sec = 0) =>
    new Date(y, m - 1, d, h, min, sec).getTime();

  it('单个日期：当天零点到 23:59:59 都算，前后一天不算', () => {
    expect(Utils.matchesDateRange(at(2024, 3, 10, 0, 0, 0), '2024-03-10')).toBe(true);
    expect(Utils.matchesDateRange(at(2024, 3, 10, 23, 59, 59), '2024-03-10')).toBe(true);
    expect(Utils.matchesDateRange(at(2024, 3, 9, 23, 59, 59), '2024-03-10')).toBe(false);
    expect(Utils.matchesDateRange(at(2024, 3, 11, 0, 0, 0), '2024-03-10')).toBe(false);
  });

  it('日期范围：起止两天都包含整天', () => {
    const range = '2024-03-01..2024-03-31';
    expect(Utils.matchesDateRange(at(2024, 3, 1, 0, 0, 0), range)).toBe(true);
    expect(Utils.matchesDateRange(at(2024, 3, 31, 15), range)).toBe(true); // 结束日白天
    expect(Utils.matchesDateRange(at(2024, 3, 31, 23, 59, 59), range)).toBe(true);
    expect(Utils.matchesDateRange(at(2024, 2, 29, 23, 59, 59), range)).toBe(false);
    expect(Utils.matchesDateRange(at(2024, 4, 1, 0, 0, 0), range)).toBe(false);
  });

  it('只写一端的范围是开区间', () => {
    expect(Utils.matchesDateRange(at(2030, 1, 1), '2024-03-15..')).toBe(true);
    expect(Utils.matchesDateRange(at(2024, 3, 14), '2024-03-15..')).toBe(false);
    expect(Utils.matchesDateRange(at(2000, 1, 1), '..2024-03-15')).toBe(true);
    expect(Utils.matchesDateRange(at(2024, 3, 15, 20), '..2024-03-15')).toBe(true);
    expect(Utils.matchesDateRange(at(2024, 3, 16), '..2024-03-15')).toBe(false);
    expect(Utils.matchesDateRange(at(2024, 3, 16), '..')).toBe(false);
  });

  it('不存在或没写完的日期不匹配任何笔记', () => {
    const ts = at(2024, 3, 2);
    for (const bad of [
      '2024-02-31',
      '2024-03',
      '2024-0',
      '2024-13-01',
      'abc',
      '2024-03-01..2024-13-40',
    ]) {
      expect(Utils.matchesDateRange(ts, bad)).toBe(false);
    }
  });

  it('日期分隔符可以是 - / .', () => {
    expect(Utils.matchesDateRange(at(2024, 3, 10), '2024/03/10')).toBe(true);
    expect(Utils.matchesDateRange(at(2024, 3, 10), '2024.3.10')).toBe(true);
    expect(Utils.matchesDateRange(at(2024, 3, 10), '2024-3-10')).toBe(true);
  });

  it('和关键词一起搜：结束日当天创建的笔记能被找到', () => {
    const lastDay = [mk('d1', 'month end', 'report', [], 'misc', at(2024, 3, 31, 16))];
    expect(Utils.searchNotes(lastDay as any, 'report date:2024-03-01..2024-03-31')).toHaveLength(1);
    expect(Utils.searchNotes(lastDay as any, 'report date:2024-03-31')).toHaveLength(1);
    expect(Utils.searchNotes(lastDay as any, 'report date:2024-03-01..2024-03-30')).toHaveLength(0);
  });
});

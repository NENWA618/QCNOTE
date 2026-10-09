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

  it('searchNotes supports category field filtering', () => {
    const notes = [
      {
        id: '1',
        title: '工作总结',
        content: '今天完成了任务 A',
        category: 'work',
        tags: ['summary'],
        color: '#fff',
        isFavorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isArchived: false,
      },
      {
        id: '2',
        title: '购物清单',
        content: '牛奶，面包，水果',
        category: 'personal',
        tags: ['todo'],
        color: '#000',
        isFavorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isArchived: false,
      },
    ];

    const results = Utils.searchNotes(notes as any, 'category:work');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('searchNotes combines structured filtering and lunr/vector full-text search', () => {
    const notes = [
      {
        id: '1',
        title: 'JavaScript 学习笔记',
        content: '深入理解闭包和异步',
        category: 'study',
        tags: ['js'],
        color: '#ff0',
        isFavorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isArchived: false,
      },
      {
        id: '2',
        title: 'Python 教程',
        content: '解释器和生成器',
        category: 'study',
        tags: ['python'],
        color: '#0f0',
        isFavorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isArchived: false,
      },
    ];

    const results = Utils.searchNotes(notes as any, '学习 OR Python');
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.map((note) => note.id)).toEqual(expect.arrayContaining(['1', '2']));
  });
});

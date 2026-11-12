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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: '2',
        title: '购物清单',
        content: '牛奶，面包，水果',
        category: 'personal',
        tags: ['todo'],
        color: '#000',
        createdAt: Date.now(),
        updatedAt: Date.now(),
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: '2',
        title: 'Python 教程',
        content: '解释器和生成器',
        category: 'study',
        tags: ['python'],
        color: '#0f0',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const results = Utils.searchNotes(notes as any, '学习 OR Python');
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.map((note) => note.id)).toEqual(expect.arrayContaining(['1', '2']));
  });
  describe('searchNotes regressions', () => {
    const mk = (id: string, title: string, content: string) => ({
      id,
      title,
      content,
      category: 'x',
      tags: [] as string[],
      color: '#fff',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    it('NOT 排除的笔记不会被相似度补充加回来', () => {
      const notes = [
        mk('1', 'apple pie recipe', 'bake apples with sugar and cinnamon'),
        mk('2', 'apple orchard visit', 'picking apples and fruit at the farm'),
      ];
      const ids = Utils.searchNotes(notes as any, 'apple NOT pie').map((n) => n.id);
      expect(ids).toEqual(['2']);
    });

    it('带冒号但不是已知字段的查询（如网址）按普通文本搜索', () => {
      const notes = [
        mk('1', 'link note', 'see http://example.com for details'),
        mk('2', 'other', 'nothing here'),
      ];
      const ids = Utils.searchNotes(notes as any, 'http://example.com').map((n) => n.id);
      expect(ids).toEqual(['1']);
    });

    describe('缓存失效', () => {
      it('原地修改正文后，同一批笔记的搜索结果随之更新', () => {
        const notes = [mk('c1', 'doc one', 'about bananas'), mk('c2', 'doc two', 'about cherries')];
        expect(Utils.searchNotes(notes as any, 'bananas').map((n) => n.id)).toEqual(['c1']);
        notes[0].content = 'about mangoes';
        expect(Utils.searchNotes(notes as any, 'bananas').map((n) => n.id)).toEqual([]);
        expect(Utils.searchNotes(notes as any, 'mangoes').map((n) => n.id)).toEqual(['c1']);
      });

      it('原地修改标签后，tag: 搜索结果随之更新', () => {
        const notes = [mk('t1', 'plain', 'x'), mk('t2', 'other', 'y')];
        notes[0].tags.push('urgent');
        expect(Utils.searchNotes(notes as any, 'tag:urgent').map((n) => n.id)).toEqual(['t1']);
        notes[0].tags.length = 0;
        notes[1].tags.push('urgent');
        expect(Utils.searchNotes(notes as any, 'tag:urgent').map((n) => n.id)).toEqual(['t2']);
      });

      it('新增或删除笔记后结果正确，且同一批笔记重复搜索结果稳定', () => {
        const notes = [mk('n1', 'alpha', 'kiwi smoothie')];
        const first = Utils.searchNotes(notes as any, 'kiwi').map((n) => n.id);
        expect(Utils.searchNotes([...notes] as any, 'kiwi').map((n) => n.id)).toEqual(first);
        const grown = [...notes, mk('n2', 'beta', 'kiwi tart')];
        expect(
          Utils.searchNotes(grown as any, 'kiwi')
            .map((n) => n.id)
            .sort(),
        ).toEqual(['n1', 'n2']);
        expect(Utils.searchNotes([grown[1]] as any, 'kiwi').map((n) => n.id)).toEqual(['n2']);
      });

      it('同一篇笔记改正文后，语义相似度补充也用新内容', () => {
        const notes = [mk('v1', 'travel', 'flights hotels itinerary packing')];
        notes[0].content = 'compilers parsers lexers grammars';
        const ids = Utils.searchNotes(notes as any, 'flights hotels itinerary').map((n) => n.id);
        expect(ids).toEqual([]);
      });
    });

    it('只共用一个汉字的无关笔记不会被带出来', () => {
      const notes = [
        mk('1', '机器学习笔记', '今天学习了神经网络和梯度下降'),
        mk('2', '会议记录', '讨论项目进度和下周计划'),
      ];
      const ids = Utils.searchNotes(notes as any, '梯度').map((n) => n.id);
      expect(ids).toEqual(['1']);
    });
  });
});

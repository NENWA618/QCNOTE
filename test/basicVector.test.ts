import { buildVocab, vectorize } from '../lib/basicVector';

describe('basicVector optimizations', () => {
  it('vectorize returns correct counts', () => {
    const vocab = ['a', 'b', 'c'];
    const vec = vectorize('a b a c', vocab);
    expect(vec).toEqual([2, 1, 1]);
  });

  it('buildVocab generates unique words', () => {
    const notes = [
      { id: '1', title: 'Hello world', content: 'hello again', category: '', tags: [], color: '', isFavorite: false, createdAt: 0, updatedAt: 0, isArchived: false },
    ];
    const vocab = buildVocab(notes as any);
    expect(vocab.sort()).toEqual(['again', 'hello', 'world']);
  });
});

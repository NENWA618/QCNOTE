import { describe, it, expect } from 'vitest';
import {
  MAX_COLORED_RANGES,
  MAX_CONTENT_BYTES,
  MAX_TAGS,
  MAX_TITLE_LENGTH,
  isValidLocalNoteId,
  makePreview,
  validatePublishPayload,
} from '../server/public-notes';

const valid = {
  title: '  我的笔记 ',
  content: '# 标题\n正文',
  tags: ['a', ' b ', 'a', ''],
  coloredRanges: [{ startIndex: 0, endIndex: 2, color: '#ff6b6b' }],
  sourceUpdatedAt: 1700000000000,
};

describe('validatePublishPayload', () => {
  it('接受合法请求，并整理标题与标签', () => {
    const result = validatePublishPayload(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('我的笔记');
      expect(result.value.tags).toEqual(['a', 'b']);
      expect(result.value.coloredRanges).toHaveLength(1);
    }
  });

  it('拒绝非对象、缺失字段和空内容', () => {
    expect(validatePublishPayload(null).ok).toBe(false);
    expect(validatePublishPayload({ ...valid, title: '   ' }).ok).toBe(false);
    expect(validatePublishPayload({ ...valid, content: '  \n ' }).ok).toBe(false);
    expect(validatePublishPayload({ ...valid, sourceUpdatedAt: 'x' }).ok).toBe(false);
  });

  it('限制标题长度和正文字节数（按 UTF-8 计）', () => {
    expect(validatePublishPayload({ ...valid, title: 'a'.repeat(MAX_TITLE_LENGTH + 1) }).ok).toBe(
      false,
    );
    // 中文每个字 3 字节：字符数未超限，字节数超限
    const cjk = '汉'.repeat(Math.ceil(MAX_CONTENT_BYTES / 3) + 1);
    expect(cjk.length).toBeLessThan(MAX_CONTENT_BYTES);
    expect(validatePublishPayload({ ...valid, content: cjk }).ok).toBe(false);
  });

  it('限制标签数量和类型', () => {
    const tooMany = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`);
    expect(validatePublishPayload({ ...valid, tags: tooMany }).ok).toBe(false);
    expect(validatePublishPayload({ ...valid, tags: [1] }).ok).toBe(false);
    expect(validatePublishPayload({ ...valid, tags: 'x' }).ok).toBe(false);
  });

  it('丢弃不安全的颜色和非法范围，而不是原样保存', () => {
    const result = validatePublishPayload({
      ...valid,
      coloredRanges: [
        { startIndex: 0, endIndex: 1, color: 'red; position:fixed' },
        { startIndex: 0, endIndex: 1, color: 'url(javascript:alert(1))' },
        { startIndex: 5, endIndex: 2, color: '#fff' },
        { startIndex: -1, endIndex: 2, color: '#fff' },
        { startIndex: 1.5, endIndex: 3, color: '#fff' },
        'bad',
        { startIndex: 0, endIndex: 3, color: ' rgb(1, 2, 3) ' },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.coloredRanges).toEqual([
        { startIndex: 0, endIndex: 3, color: 'rgb(1, 2, 3)' },
      ]);
    }
  });

  it('限制彩色范围数量', () => {
    const many = Array.from({ length: MAX_COLORED_RANGES + 1 }, () => ({
      startIndex: 0,
      endIndex: 1,
      color: '#fff',
    }));
    expect(validatePublishPayload({ ...valid, coloredRanges: many }).ok).toBe(false);
  });

  it('忽略请求里的多余字段', () => {
    const result = validatePublishPayload({ ...valid, userId: 'evil', id: 'x', isHidden: true });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(Object.keys(result.value).sort()).toEqual([
        'coloredRanges',
        'content',
        'sourceUpdatedAt',
        'tags',
        'title',
      ]);
  });
});

describe('isValidLocalNoteId', () => {
  it('只接受 1~128 长度的字符串', () => {
    expect(isValidLocalNoteId('abc')).toBe(true);
    expect(isValidLocalNoteId('')).toBe(false);
    expect(isValidLocalNoteId('a'.repeat(129))).toBe(false);
    expect(isValidLocalNoteId(123)).toBe(false);
  });
});

describe('makePreview', () => {
  it('去掉 Markdown 标记和代码块，并截断过长内容', () => {
    expect(makePreview('# 标题\n**加粗** `code`\n```js\nsecret()\n```\n尾巴')).toBe(
      '标题 加粗 code 尾巴',
    );
    const long = makePreview('字'.repeat(500));
    expect(long.length).toBe(141);
    expect(long.endsWith('…')).toBe(true);
  });
});

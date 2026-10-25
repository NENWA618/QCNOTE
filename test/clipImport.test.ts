import { describe, it, expect } from 'vitest';
import {
  CLIP_HASH_KEY,
  MAX_CLIP_CONTENT_LENGTH,
  clipToNote,
  parseClipFromHash,
} from '../lib/clipImport';

function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const valid = {
  title: '网页剪藏: 示例',
  content: '来源: https://example.com\n\n正文 🎉',
  url: 'https://example.com/a',
  tags: ['网页剪藏', 'example.com'],
};

describe('parseClipFromHash', () => {
  it('parses a valid payload, including non-ASCII text', () => {
    expect(parseClipFromHash(`#${CLIP_HASH_KEY}=${encode(valid)}`)).toEqual(valid);
  });

  it('returns null when the hash has no clip parameter', () => {
    expect(parseClipFromHash('')).toBeNull();
    expect(parseClipFromHash('#other=1')).toBeNull();
  });

  it('returns null for malformed base64 / JSON / UTF-8', () => {
    expect(parseClipFromHash(`#${CLIP_HASH_KEY}=%%%`)).toBeNull();
    expect(parseClipFromHash(`#${CLIP_HASH_KEY}=${encode('not json')}`)).toBeNull();
    expect(parseClipFromHash(`#${CLIP_HASH_KEY}=${btoa('\xff\xfe')}`)).toBeNull();
  });

  it('rejects non-http(s) source urls', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'not a url']) {
      expect(parseClipFromHash(`#${CLIP_HASH_KEY}=${encode({ ...valid, url })}`)).toBeNull();
    }
  });

  it('rejects missing title and oversized content or tag lists', () => {
    const cases = [
      { ...valid, title: '  ' },
      { ...valid, content: 'x'.repeat(MAX_CLIP_CONTENT_LENGTH + 1) },
      { ...valid, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
    ];
    for (const c of cases) {
      expect(parseClipFromHash(`#${CLIP_HASH_KEY}=${encode(c)}`)).toBeNull();
    }
  });
});

describe('clipToNote', () => {
  it('maps a clip to note fields with defaults', () => {
    expect(clipToNote(valid)).toMatchObject({
      title: valid.title,
      category: '网页剪藏',
      tags: valid.tags,
    });
    expect(clipToNote({ ...valid, tags: undefined }).tags).toEqual(['网页剪藏']);
  });
});

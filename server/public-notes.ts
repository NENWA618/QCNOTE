import { isSafeCssColor } from '../lib/markdownSafety';

export const MAX_PUBLIC_NOTES_PER_USER = 100;
export const MAX_TITLE_LENGTH = 200;
export const MAX_CONTENT_BYTES = 100 * 1024;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 50;
export const MAX_COLORED_RANGES = 500;
const MAX_LOCAL_NOTE_ID_LENGTH = 128;
const PREVIEW_LENGTH = 140;

export interface PublishPayload {
  title: string;
  content: string;
  tags: string[];
  coloredRanges: Array<{ startIndex: number; endIndex: number; color: string }>;
  sourceUpdatedAt: number;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isValidLocalNoteId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_LOCAL_NOTE_ID_LENGTH;
}

/**
 * 校验发布请求体。内容会被匿名访客渲染，所以这里只放行已知字段，
 * 并把彩色范围里不合法的颜色直接丢弃，而不是原样存下来。
 */
export function validatePublishPayload(body: unknown): ValidationResult<PublishPayload> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const { title, content, tags, coloredRanges, sourceUpdatedAt } = body as Record<string, unknown>;

  if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: 'Invalid title' };
  }
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
    return { ok: false, error: 'Content too large' };
  }
  if (!content.trim()) return { ok: false, error: 'Content is empty' };
  if (typeof sourceUpdatedAt !== 'number' || !Number.isFinite(sourceUpdatedAt)) {
    return { ok: false, error: 'Invalid sourceUpdatedAt' };
  }

  const cleanTags: string[] = [];
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.length > MAX_TAGS) return { ok: false, error: 'Invalid tags' };
    for (const tag of tags) {
      if (typeof tag !== 'string' || tag.length > MAX_TAG_LENGTH) {
        return { ok: false, error: 'Invalid tags' };
      }
      const trimmed = tag.trim();
      if (trimmed && !cleanTags.includes(trimmed)) cleanTags.push(trimmed);
    }
  }

  const cleanRanges: PublishPayload['coloredRanges'] = [];
  if (coloredRanges !== undefined) {
    if (!Array.isArray(coloredRanges) || coloredRanges.length > MAX_COLORED_RANGES) {
      return { ok: false, error: 'Invalid coloredRanges' };
    }
    for (const range of coloredRanges) {
      if (!range || typeof range !== 'object') continue;
      const { startIndex, endIndex, color } = range as Record<string, unknown>;
      if (
        Number.isInteger(startIndex) &&
        Number.isInteger(endIndex) &&
        (startIndex as number) >= 0 &&
        (endIndex as number) > (startIndex as number) &&
        isSafeCssColor(color)
      ) {
        cleanRanges.push({
          startIndex: startIndex as number,
          endIndex: endIndex as number,
          color: color.trim(),
        });
      }
    }
  }

  return {
    ok: true,
    value: {
      title: title.trim(),
      content,
      tags: cleanTags,
      coloredRanges: cleanRanges,
      sourceUpdatedAt,
    },
  };
}

/** 列表页摘要：去掉常见 Markdown 标记，截断到固定长度 */
export function makePreview(content: string): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>_~[\]()!|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > PREVIEW_LENGTH ? `${plain.slice(0, PREVIEW_LENGTH)}…` : plain;
}

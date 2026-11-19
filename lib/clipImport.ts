/**
 * 网页剪藏导入 - 解析浏览器扩展通过 URL hash 传来的剪藏数据。
 *
 * 扩展打开 `<应用地址>/dashboard#qcnote-clip=<base64url(JSON)>`。hash 不会发往服务器，
 * 数据只在浏览器里被本页读取。但任何链接都能带这个 hash，所以这里的数据一律当作不可信输入：
 * 严格校验并限制大小，且调用方必须先让用户确认再写入笔记。
 */
import { z } from 'zod';
import type { NoteItem } from './storage';

export const CLIP_HASH_KEY = 'qcnote-clip';

/** 扩展端在编码前也按此上限截断，避免超出浏览器 URL 长度限制 */
export const MAX_CLIP_CONTENT_LENGTH = 100_000;

const clipSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().max(MAX_CLIP_CONTENT_LENGTH),
  url: z
    .string()
    .max(2048)
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    }, 'url must be http(s)'),
  category: z.string().trim().max(50).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  clippedAt: z.string().max(64).optional(),
});

export type ClipPayload = z.infer<typeof clipSchema>;

function decodeBase64UrlJson(encoded: string): unknown {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** 从 `location.hash` 解析剪藏数据；没有剪藏参数或数据无效时返回 null */
export function parseClipFromHash(hash: string): ClipPayload | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const encoded = new URLSearchParams(fragment).get(CLIP_HASH_KEY);
  if (!encoded) return null;

  try {
    const result = clipSchema.safeParse(decodeBase64UrlJson(encoded));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function clipToNote(clip: ClipPayload): Partial<NoteItem> {
  return {
    title: clip.title,
    content: clip.content,
    category: clip.category || '网页剪藏',
    tags: clip.tags && clip.tags.length > 0 ? clip.tags : ['网页剪藏'],
  };
}

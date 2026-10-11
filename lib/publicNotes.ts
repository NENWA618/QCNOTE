import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { withApiBaseUrl } from './api-client';
import type { NoteItem } from './storage';
import type { PublishedNoteInfo } from '../types/ugc-types';

export type PublishResult = { ok: true } | { ok: false; error: string };

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const serverError = err.response?.data?.error;
    if (typeof serverError === 'string' && serverError) return serverError;
  }
  return fallback;
}

/** 拉取当前用户已发布的笔记（以本地笔记 ID 为键）；失败返回 null */
async function fetchPublished(): Promise<Record<string, PublishedNoteInfo> | null> {
  try {
    const response = await axios.get(withApiBaseUrl('/api/ugc/notes/public'));
    const list: PublishedNoteInfo[] = response.data.published ?? [];
    return Object.fromEntries(list.map((info) => [info.localNoteId, info]));
  } catch {
    // 拿不到发布状态只影响"已公开"标记，不影响笔记本身
    return null;
  }
}

const NO_PUBLISHED: Record<string, PublishedNoteInfo> = {};

/** 笔记自上次发布以来是否又改过 */
export function hasUnpublishedChanges(note: NoteItem, info: PublishedNoteInfo | undefined) {
  return Boolean(info) && note.updatedAt > (info as PublishedNoteInfo).sourceUpdatedAt;
}

/**
 * 当前登录用户已发布的笔记（以本地笔记 ID 为键），以及发布 / 取消发布操作。
 * 发布的是笔记当时的一份明文快照，本地笔记不受影响。
 */
export function usePublishedNotes(enabled: boolean) {
  const [published, setPublished] = useState<Record<string, PublishedNoteInfo>>(NO_PUBLISHED);

  const refresh = useCallback(async () => {
    const next = await fetchPublished();
    if (next) setPublished(next);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchPublished().then((next) => {
      if (!cancelled && next) setPublished(next);
    });
    return () => {
      cancelled = true;
      // 登出 / 换账号时丢弃上一个用户的数据
      setPublished(NO_PUBLISHED);
    };
  }, [enabled]);

  const publish = useCallback(
    async (note: NoteItem): Promise<PublishResult> => {
      try {
        await axios.put(withApiBaseUrl(`/api/ugc/notes/public/${encodeURIComponent(note.id)}`), {
          title: note.title,
          content: note.content,
          tags: note.tags ?? [],
          coloredRanges: note.coloredRanges ?? [],
          sourceUpdatedAt: note.updatedAt,
        });
        await refresh();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errorMessage(err, '发布失败，请稍后再试') };
      }
    },
    [refresh],
  );

  const unpublish = useCallback(
    async (localNoteId: string): Promise<PublishResult> => {
      try {
        await axios.post(
          withApiBaseUrl(`/api/ugc/notes/public/${encodeURIComponent(localNoteId)}/unpublish`),
          {},
        );
        await refresh();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errorMessage(err, '取消发布失败，请稍后再试') };
      }
    },
    [refresh],
  );

  const unpublishAll = useCallback(async (): Promise<PublishResult> => {
    try {
      await axios.post(withApiBaseUrl('/api/ugc/notes/public/unpublish-all'), {});
      await refresh();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errorMessage(err, '取消发布失败，请稍后再试') };
    }
  }, [refresh]);

  return { published: enabled ? published : NO_PUBLISHED, publish, unpublish, unpublishAll };
}

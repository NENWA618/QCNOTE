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

/** 笔记自上次发布以来是否又改过 */
export function hasUnpublishedChanges(note: NoteItem, info: PublishedNoteInfo | undefined) {
  return Boolean(info) && note.updatedAt > (info as PublishedNoteInfo).sourceUpdatedAt;
}

/**
 * 当前登录用户已发布的笔记（以本地笔记 ID 为键），以及发布 / 取消发布操作。
 * 发布的是笔记当时的一份明文快照，本地笔记不受影响。
 */
export function usePublishedNotes(enabled: boolean) {
  const [published, setPublished] = useState<Record<string, PublishedNoteInfo>>({});

  const refresh = useCallback(async () => {
    try {
      const response = await axios.get(withApiBaseUrl('/api/ugc/notes/public'));
      const list: PublishedNoteInfo[] = response.data.published ?? [];
      setPublished(Object.fromEntries(list.map((info) => [info.localNoteId, info])));
    } catch {
      // 拿不到发布状态只影响"已公开"标记，不影响笔记本身
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      void refresh();
    } else {
      setPublished({});
    }
  }, [enabled, refresh]);

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

  return { published, publish, unpublish, unpublishAll };
}

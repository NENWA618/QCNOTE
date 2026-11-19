import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { withApiBaseUrl } from './api-client';
import type { NoteItem } from './storage';
import type { PublicSuspension, PublishedNoteInfo } from '../types/ugc-types';

export type PublishResult = { ok: true } | { ok: false; error: string };

/** 管理员关闭了本人主页和公开笔记时，服务端告诉作者的信息（不含操作人） */
export type PublicSuspensionNotice = Pick<PublicSuspension, 'suspendedAt' | 'reason'>;

interface PublishedState {
  published: Record<string, PublishedNoteInfo>;
  suspension: PublicSuspensionNotice | null;
}

/** 被关闭时给用户看的统一说明；公开副本仍保留在服务器上，由管理员处理 */
export function suspensionMessage(suspension: PublicSuspensionNotice): string {
  const base = '你的个人主页和公开笔记已被管理员关闭，暂时无法发布、更新或取消发布公开笔记。';
  return suspension.reason ? `${base}原因：${suspension.reason}` : base;
}

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const serverError = err.response?.data?.error;
    if (typeof serverError === 'string' && serverError) return serverError;
  }
  return fallback;
}

/** 拉取当前用户已发布的笔记（以本地笔记 ID 为键）和关闭状态；失败返回 null */
async function fetchPublished(): Promise<PublishedState | null> {
  try {
    const response = await axios.get(withApiBaseUrl('/api/ugc/notes/public'));
    const list: PublishedNoteInfo[] = response.data.published ?? [];
    return {
      published: Object.fromEntries(list.map((info) => [info.localNoteId, info])),
      suspension: response.data.suspension ?? null,
    };
  } catch {
    // 拿不到发布状态只影响"已公开"标记，不影响笔记本身
    return null;
  }
}

const NO_PUBLISHED: PublishedState = { published: {}, suspension: null };

/** 笔记自上次发布以来是否又改过 */
export function hasUnpublishedChanges(note: NoteItem, info: PublishedNoteInfo | undefined) {
  return Boolean(info) && note.updatedAt > (info as PublishedNoteInfo).sourceUpdatedAt;
}

/**
 * 当前登录用户已发布的笔记（以本地笔记 ID 为键），以及发布 / 取消发布操作。
 * 发布的是笔记当时的一份明文快照，本地笔记不受影响。
 * suspension 非空表示管理员关闭了他的主页和公开笔记：此时发布、更新发布、取消发布
 * 都会被服务端拒绝，界面应据此禁用这些操作。
 */
export function usePublishedNotes(enabled: boolean) {
  const [state, setState] = useState<PublishedState>(NO_PUBLISHED);

  const refresh = useCallback(async () => {
    const next = await fetchPublished();
    if (next) setState(next);
  }, []);

  // 页面开着的时候被管理员关闭：被服务端拒绝后重新拉一次，界面才会切换到“已关闭”状态
  const refreshIfSuspended = useCallback(
    async (err: unknown) => {
      if (axios.isAxiosError(err) && err.response?.data?.code === 'public_suspended') {
        await refresh();
      }
    },
    [refresh],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchPublished().then((next) => {
      if (!cancelled && next) setState(next);
    });
    return () => {
      cancelled = true;
      // 登出 / 换账号时丢弃上一个用户的数据
      setState(NO_PUBLISHED);
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
        await refreshIfSuspended(err);
        return { ok: false, error: errorMessage(err, '发布失败，请稍后再试') };
      }
    },
    [refresh, refreshIfSuspended],
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
        await refreshIfSuspended(err);
        return { ok: false, error: errorMessage(err, '取消发布失败，请稍后再试') };
      }
    },
    [refresh, refreshIfSuspended],
  );

  const unpublishAll = useCallback(async (): Promise<PublishResult> => {
    try {
      await axios.post(withApiBaseUrl('/api/ugc/notes/public/unpublish-all'), {});
      await refresh();
      return { ok: true };
    } catch (err) {
      await refreshIfSuspended(err);
      return { ok: false, error: errorMessage(err, '取消发布失败，请稍后再试') };
    }
  }, [refresh, refreshIfSuspended]);

  const current = enabled ? state : NO_PUBLISHED;
  return {
    published: current.published,
    suspension: current.suspension,
    publish,
    unpublish,
    unpublishAll,
  };
}

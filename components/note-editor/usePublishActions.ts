import { useCallback, useState } from 'react';
import { confirmDialog } from '../../lib/dialog';
import type { PublishResult } from '../../lib/publicNotes';
import type { NoteItem } from '../../lib/storage';
import type { PublicSuspensionNotice } from '../../lib/publicNotes';
import type { PublishedNoteInfo } from '../../types/ugc-types';

interface Options {
  note: NoteItem | null;
  onPublish?: (note: NoteItem) => Promise<PublishResult>;
  onUnpublish?: (localNoteId: string) => Promise<PublishResult>;
  publishInfo?: PublishedNoteInfo;
  suspension?: PublicSuspensionNotice | null;
}

/** 发布 / 取消发布：确认框、忙碌状态和错误文案 */
export function usePublishActions({
  note,
  onPublish,
  onUnpublish,
  publishInfo,
  suspension,
}: Options) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const publish = async () => {
    if (!note || !onPublish || suspension) return;
    if (!note.content.trim()) {
      setError('笔记内容为空，无法发布');
      return;
    }
    const message = publishInfo
      ? '将用当前内容更新已公开的版本。\n更新后，任何人都能在你的个人主页看到新内容。是否继续？'
      : '发布后，这篇笔记的标题和正文会以明文保存在服务器上，并显示在你的个人主页，任何人（包括未登录的访客）都能看到。\n\n发布的是此刻内容的一份副本，之后修改本地笔记不会自动同步；你可以随时取消发布并删除这份副本。\n\n确定要发布吗？';
    const ok = await confirmDialog({
      title: publishInfo ? '更新已公开的版本' : '发布到个人主页',
      description: message,
      confirmLabel: publishInfo ? '更新发布' : '发布',
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    const result = await onPublish(note);
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  const unpublish = async () => {
    if (!note || !onUnpublish || suspension) return;
    const ok = await confirmDialog({
      title: '取消发布？',
      description: '取消发布后，服务器上的公开副本会被删除，别人将无法再访问。是否继续？',
      confirmLabel: '取消发布',
      cancelLabel: '保留',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const result = await onUnpublish(note.id);
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return { busy, error, clearError, publish, unpublish };
}

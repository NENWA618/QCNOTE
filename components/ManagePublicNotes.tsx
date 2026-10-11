import React, { useState } from 'react';
import Link from 'next/link';
import { usePublishedNotes } from '../lib/publicNotes';

interface ManagePublicNotesProps {
  userId: string;
}

/**
 * 管理已公开的笔记。取消发布不依赖本地笔记是否还在，
 * 所以即使本地笔记已被永久删除，也能在这里清理服务器上的公开副本。
 */
const ManagePublicNotes: React.FC<ManagePublicNotesProps> = ({ userId }) => {
  const { published, unpublish, unpublishAll } = usePublishedNotes(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = Object.values(published).sort((a, b) => b.publishedAt - a.publishedAt);

  const handleUnpublish = async (localNoteId: string, title: string) => {
    if (!window.confirm(`取消发布《${title}》？服务器上的公开副本会被删除，别人将无法再访问。`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await unpublish(localNoteId);
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  const handleUnpublishAll = async () => {
    if (
      !window.confirm(
        `取消发布全部 ${items.length} 篇公开笔记？服务器上的公开副本会被删除，本地笔记不受影响。`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await unpublishAll();
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <section className="bg-white/95 dark:bg-dark-surface rounded-2xl border border-primary-light/40 dark:border-dark-border p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-semibold text-ink dark:text-dark-text">
          我的公开笔记
          {items.length > 0 && (
            <span className="ml-2 text-sm font-normal text-text-light tabular-nums">
              {items.length} 篇
            </span>
          )}
        </h2>
        {items.length > 1 && (
          <button
            className="btn btn-secondary btn-sm shrink-0"
            disabled={busy}
            onClick={handleUnpublishAll}
          >
            全部取消发布
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-xl text-sm bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-primary-dark/40 dark:border-dark-border px-4 py-8 text-center">
          <p className="text-sm text-text-light">你还没有公开任何笔记</p>
          <p className="mt-1 text-xs text-text-light">
            在控制台打开一篇笔记，点“发布到主页”即可公开它的一份副本
          </p>
          <Link href="/dashboard" className="btn btn-sm btn-secondary mt-4">
            前往控制台
          </Link>
        </div>
      ) : (
        <ul className="-mx-5 sm:-mx-6 divide-y divide-gray-100 dark:divide-dark-border border-t border-gray-100 dark:border-dark-border">
          {items.map((item) => (
            <li
              key={item.id}
              className="px-5 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink dark:text-dark-text truncate">
                  {item.title}
                </div>
                <div className="text-xs text-text-light tabular-nums">
                  发布于 {new Date(item.publishedAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link
                  href={`/u/${encodeURIComponent(userId)}/n/${encodeURIComponent(item.id)}`}
                  target="_blank"
                  className="btn btn-secondary btn-sm flex-1 sm:flex-none"
                >
                  查看
                </Link>
                <button
                  className="btn btn-secondary btn-sm flex-1 sm:flex-none"
                  disabled={busy}
                  onClick={() => handleUnpublish(item.localNoteId, item.title)}
                >
                  取消发布
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ManagePublicNotes;

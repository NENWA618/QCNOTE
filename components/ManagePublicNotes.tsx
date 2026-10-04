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
    <section className="card dark:bg-dark-surface dark:border-dark-border mt-8">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-2xl font-bold text-primary-dark dark:text-dark-text">
          我的公开笔记{items.length > 0 ? `（${items.length}）` : ''}
        </h2>
        {items.length > 1 && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={handleUnpublishAll}>
            全部取消发布
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-text-light dark:text-dark-text-secondary">
          你还没有公开任何笔记。在控制台打开一篇笔记，点“发布到主页”即可公开它的一份副本。
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-dark-border">
          {items.map((item) => (
            <li key={item.id} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium text-primary-dark dark:text-dark-text truncate">
                  {item.title}
                </div>
                <div className="text-xs text-text-light dark:text-dark-text-secondary">
                  发布于 {new Date(item.publishedAt).toLocaleDateString('zh-CN')}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link
                  href={`/u/${encodeURIComponent(userId)}/n/${encodeURIComponent(item.id)}`}
                  target="_blank"
                  className="btn btn-secondary btn-sm"
                >
                  查看
                </Link>
                <button
                  className="btn btn-secondary btn-sm"
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

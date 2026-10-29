import React, { useMemo } from 'react';
import ColoredMarkdown from '../ColoredMarkdown';
import type { NoteItem } from '../../lib/storage';

interface PreviewPanelProps {
  note: NoteItem;
  relatedNotes: NoteItem[];
  onOpenRelatedNote?: (note: NoteItem) => void;
}

const CARD =
  'rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface-light p-4';
const EMPTY = 'text-gray-500 dark:text-dark-text-secondary';

const NoteLinkButton: React.FC<{
  note: NoteItem;
  onOpen?: (note: NoteItem) => void;
}> = ({ note, onOpen }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onOpen?.(note);
    }}
    className="text-ink hover:text-ink-pink transition"
  >
    {note.title || '无标题'}
  </button>
);

/** 全屏预览：正文 + 引用 / 被引用 / 相关笔记 */
export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  note,
  relatedNotes,
  onOpenRelatedNote,
}) => {
  // 按标题 / id 建索引：原来每条链接都在 relatedNotes 里线性查找
  const { forwardLinks, backlinkNotes, unresolvedForwardLinks } = useMemo(() => {
    const byTitle = new Map<string, NoteItem>();
    const byId = new Map<string, NoteItem>();
    for (const n of relatedNotes) {
      // 与 Array.find 一致：同名取第一篇
      if (!byTitle.has(n.title)) byTitle.set(n.title, n);
      if (!byId.has(n.id)) byId.set(n.id, n);
    }
    const links = note.links || [];
    const forward: NoteItem[] = [];
    const unresolved: string[] = [];
    for (const title of links) {
      const hit = byTitle.get(title);
      if (hit) forward.push(hit);
      else unresolved.push(title);
    }
    const back = (note.backlinks || [])
      .map((id) => byId.get(id))
      .filter((n): n is NoteItem => Boolean(n));
    return { forwardLinks: forward, backlinkNotes: back, unresolvedForwardLinks: unresolved };
  }, [note.links, note.backlinks, relatedNotes]);

  return (
    <div className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto overscroll-contain dark:text-dark-text">
      {/* 笔记颜色用作左侧色条：直接当文字色时，浅黄等颜色在白底上几乎看不见 */}
      <h1
        className="text-2xl sm:text-3xl font-bold mb-4 wrap-break-word border-l-4 pl-3 text-ink dark:text-dark-text"
        style={{ borderColor: note.color }}
      >
        {note.title || '无标题'}
      </h1>

      <div className="mb-3 text-sm text-gray-600 dark:text-dark-text-secondary">
        <span className="inline-flex items-center gap-1 mr-3">
          🔗 引用: {note.links?.length ?? 0}
        </span>
        <span className="inline-flex items-center gap-1">
          ↩️ 被引用: {note.backlinks?.length ?? 0}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <div className={CARD}>
          <div className="text-sm font-semibold mb-2">引用笔记</div>
          {forwardLinks.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {forwardLinks.map((linked) => (
                <li key={linked.id}>
                  <NoteLinkButton note={linked} onOpen={onOpenRelatedNote} />
                </li>
              ))}
              {unresolvedForwardLinks.length > 0 && (
                <li className={EMPTY}>未匹配笔记: {unresolvedForwardLinks.join('、')}</li>
              )}
            </ul>
          ) : (
            <div className={EMPTY}>还未引用其他笔记。</div>
          )}
        </div>
        <div className={CARD}>
          <div className="text-sm font-semibold mb-2">被引用笔记</div>
          {backlinkNotes.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {backlinkNotes.map((linked) => (
                <li key={linked.id}>
                  <NoteLinkButton note={linked} onOpen={onOpenRelatedNote} />
                </li>
              ))}
            </ul>
          ) : (
            <div className={EMPTY}>暂时没有其他笔记引用此笔记。</div>
          )}
        </div>
      </div>
      {note.versions && note.versions.length > 0 && (
        <div className="mb-4 p-3 border border-gray-200 dark:border-dark-border rounded bg-gray-50 dark:bg-dark-surface-light text-xs">
          最近版本：{note.versions.length} 次，最早版本{' '}
          {new Date(note.versions[0].updatedAt).toLocaleString()}
        </div>
      )}

      <div className="prose dark:prose-invert md:prose-lg max-w-none wrap-break-word overflow-x-auto">
        <ColoredMarkdown content={note.content} coloredRanges={note.coloredRanges} />
      </div>

      <div className="mt-6 pt-4 border-t dark:border-dark-border text-sm text-gray-500 dark:text-dark-text-secondary">
        {note.category && <span className="mr-4">📁 {note.category}</span>}
        {note.tags.length > 0 && <span className="mr-4">🏷️ {note.tags.join(', ')}</span>}
      </div>

      {relatedNotes.length > 0 && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-dark-surface-light rounded border border-gray-200 dark:border-dark-border">
          <p className="text-sm font-semibold mb-2">相关笔记</p>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {relatedNotes.slice(0, 5).map((related) => (
              <li key={related.id}>{related.title || '无标题'}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

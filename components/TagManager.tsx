import React, { useState, useMemo } from 'react';
import { NoteItem } from '../lib/storage';
import { confirmDialog } from '../lib/dialog';
import { isImeComposing } from '../lib/ime';

interface TagManagerProps {
  notes: NoteItem[];
  onTagRename: (oldTag: string, newTag: string) => void;
  onTagDelete: (tag: string) => void;
  onBulkTagOperation: (operation: 'add' | 'remove', tag: string, noteIds: string[]) => void;
  /** 点击标签详情里的笔记时打开它 */
  onSelectNote?: (note: NoteItem) => void;
}

const panelClass =
  'rounded-2xl border border-primary-light/40 bg-white/95 dark:border-dark-border dark:bg-dark-surface';

const hueOf = (tag: string) =>
  tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;

const TagManager: React.FC<TagManagerProps> = ({
  notes,
  onTagRename,
  onTagDelete,
  onBulkTagOperation,
  onSelectNote,
}) => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [bulkOperation, setBulkOperation] = useState<'add' | 'remove' | null>(null);
  const [bulkTag, setBulkTag] = useState('');
  const [filter, setFilter] = useState('');

  // 计算标签统计（回收站里的笔记不算）
  const tagStats = useMemo(() => {
    const stats: Record<string, NoteItem[]> = {};
    notes
      .filter((n) => !n.isDeleted)
      .forEach((note) => {
        (note.tags || []).forEach((tag) => {
          (stats[tag] ??= []).push(note);
        });
      });
    return Object.entries(stats)
      .map(([tag, list]) => ({ tag, count: list.length, notes: list }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [notes]);

  const maxCount = tagStats[0]?.count ?? 1;
  const visibleStats = filter.trim()
    ? tagStats.filter((s) => s.tag.toLowerCase().includes(filter.trim().toLowerCase()))
    : tagStats;

  // 批量操作作用于“带有任一所选标签”的笔记
  const affectedNoteIds = useMemo(() => {
    const ids = new Set<string>();
    selectedTags.forEach((tag) =>
      tagStats.find((s) => s.tag === tag)?.notes.forEach((n) => ids.add(n.id)),
    );
    return [...ids];
  }, [selectedTags, tagStats]);

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );

  const startRename = (tag: string) => {
    setRenamingTag(tag);
    setNewTagName(tag);
  };

  const finishRename = (oldTag: string) => {
    const next = newTagName.trim();
    if (next && next !== oldTag) onTagRename(oldTag, next);
    setRenamingTag(null);
    setNewTagName('');
  };

  const handleDeleteTag = async (tag: string) => {
    const ok = await confirmDialog({
      title: `删除标签 #${tag}？`,
      description: '这将从所有笔记中移除此标签。',
      confirmLabel: '删除标签',
      tone: 'danger',
    });
    if (ok) {
      onTagDelete(tag);
      setSelectedTags((prev) => prev.filter((t) => t !== tag));
    }
  };

  const handleBulkOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkOperation || !bulkTag.trim() || affectedNoteIds.length === 0) return;
    onBulkTagOperation(bulkOperation, bulkTag.trim(), affectedNoteIds);
    setBulkOperation(null);
    setBulkTag('');
    setSelectedTags([]);
  };

  if (tagStats.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-primary-dark/40 px-4 py-14 text-center dark:border-dark-border">
        <div className="mb-3 text-4xl" aria-hidden="true">
          🏷️
        </div>
        <p className="font-medium text-ink dark:text-dark-text">还没有标签</p>
        <p className="mt-1 text-sm text-text-light">在编辑笔记时填写标签，它们会出现在这里</p>
      </div>
    );
  }

  const detail =
    selectedTags.length === 1 ? tagStats.find((s) => s.tag === selectedTags[0]) : undefined;

  return (
    <div className="space-y-4">
      {/* 标签云：点选后可批量操作 */}
      <section className={`${panelClass} p-4 sm:p-6`} aria-labelledby="tag-cloud-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="tag-cloud-title"
            className="text-lg font-bold text-ink sm:text-xl dark:text-dark-text"
          >
            标签
            <span className="ml-2 text-sm font-normal text-text-light">{tagStats.length} 个</span>
          </h2>
          <p className="text-xs text-text-light">点选标签后可批量操作</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tagStats.map(({ tag, count }) => {
            const hue = hueOf(tag);
            const active = selectedTags.includes(tag);
            // 字号 0.8 ~ 1.4rem，窄屏上不至于一个标签占满一行
            const size = 0.8 + (count / maxCount) * 0.6;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-3 py-1 transition-all hover:opacity-85 ${
                  active ? 'ring-2 ring-ink-pink ring-offset-1 dark:ring-offset-dark-surface' : ''
                }`}
                style={{
                  fontSize: `${size}rem`,
                  backgroundColor: `hsl(${hue} 70% var(--tag-bg-l, 88%))`,
                  color: `hsl(${hue} 60% var(--tag-fg-l, 28%))`,
                }}
              >
                {tag} <span className="text-[0.75em] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 批量操作 */}
      {selectedTags.length > 0 && (
        <section
          className="rounded-2xl border border-accent-pink/40 bg-primary-light/40 p-4 dark:bg-accent-pink/10"
          aria-label="批量操作"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink dark:text-dark-text">
              已选 {selectedTags.length} 个标签，涉及 <strong>{affectedNoteIds.length}</strong>{' '}
              篇笔记
            </p>
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="text-xs text-ink-pink hover:underline"
            >
              取消选择
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => setBulkOperation('add')}
              aria-pressed={bulkOperation === 'add'}
              className={`btn btn-sm ${bulkOperation === 'add' ? 'btn-primary' : 'btn-secondary'}`}
            >
              给这些笔记加标签
            </button>
            <button
              type="button"
              onClick={() => setBulkOperation('remove')}
              aria-pressed={bulkOperation === 'remove'}
              className={`btn btn-sm ${bulkOperation === 'remove' ? 'btn-primary' : 'btn-secondary'}`}
            >
              从这些笔记移除标签
            </button>
          </div>
          {bulkOperation && (
            <form onSubmit={handleBulkOperation} className="mt-3 flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder={`要${bulkOperation === 'add' ? '添加' : '移除'}的标签`}
                aria-label={`要${bulkOperation === 'add' ? '添加' : '移除'}的标签`}
                value={bulkTag}
                onChange={(e) => setBulkTag(e.target.value)}
                className="input min-w-0 flex-1 py-2 text-sm"
              />
              <button type="submit" disabled={!bulkTag.trim()} className="btn btn-primary shrink-0">
                执行
              </button>
            </form>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* 标签列表 */}
        <section className={`${panelClass} overflow-hidden`} aria-labelledby="tag-list-title">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-dark-border">
            <h3 id="tag-list-title" className="font-semibold text-ink dark:text-dark-text">
              管理
            </h3>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="筛选标签"
              aria-label="筛选标签"
              className="ml-auto h-9 w-36 rounded-full border border-gray-200 bg-white px-3 text-sm focus:border-accent-pink focus:outline-hidden sm:w-44 dark:border-dark-border dark:bg-dark-surface-light dark:text-dark-text"
            />
          </div>
          <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto dark:divide-dark-border">
            {visibleStats.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-text-light">没有匹配的标签</li>
            )}
            {visibleStats.map(({ tag, count }) => (
              <li key={tag} className="flex items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                  aria-label={`选择标签 ${tag}`}
                  className="h-4 w-4 shrink-0 accent-[#dc96b4]"
                />
                {renamingTag === tag ? (
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onBlur={() => finishRename(tag)}
                    onKeyDown={(e) => {
                      // 输入法选词时的 Enter/Esc 是在操作候选，不能当成“完成/取消重命名”
                      if (isImeComposing(e.nativeEvent)) return;
                      if (e.key === 'Enter') finishRename(tag);
                      if (e.key === 'Escape') {
                        setRenamingTag(null);
                        setNewTagName('');
                      }
                    }}
                    aria-label={`重命名标签 ${tag}`}
                    className="input min-w-0 flex-1 py-1 text-sm"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedTags([tag])}
                    className="min-w-0 flex-1 truncate text-left font-medium text-ink hover:text-ink-pink dark:text-dark-text"
                    title="查看这个标签下的笔记"
                  >
                    {tag}
                    <span className="ml-2 text-xs font-normal text-text-light">{count} 篇</span>
                  </button>
                )}
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => startRename(tag)}
                    className="rounded-full px-2.5 py-1 text-xs text-ink-pink hover:bg-primary-light dark:hover:bg-accent-pink/15"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTag(tag)}
                    className="rounded-full px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 标签详情 */}
        <section className={`${panelClass} p-4`} aria-live="polite">
          {detail ? (
            <>
              <h3 className="font-semibold text-ink dark:text-dark-text">
                #{detail.tag}
                <span className="ml-2 text-sm font-normal text-text-light">{detail.count} 篇</span>
              </h3>
              <ul className="mt-2 -mx-2 max-h-[55vh] space-y-0.5 overflow-y-auto">
                {detail.notes
                  .slice()
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map((note) => (
                    <li key={note.id}>
                      <button
                        type="button"
                        onClick={() => onSelectNote?.(note)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-primary-light/40 dark:hover:bg-dark-surface-light"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: note.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink dark:text-dark-text">
                          {note.title || '无标题'}
                        </span>
                        {note.category && (
                          <span className="shrink-0 text-xs text-text-light">{note.category}</span>
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center text-center text-sm text-text-light">
              {selectedTags.length > 1
                ? `已选 ${selectedTags.length} 个标签，可在上方批量操作`
                : '点击左侧的标签名，查看它下面的笔记'}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default TagManager;

import React from 'react';
import { NoteItem } from '../lib/storage';
import { hasUnpublishedChanges } from '../lib/publicNotes';
import type { PublishedNoteInfo } from '../types/ugc-types';

interface NoteListProps {
  notes: NoteItem[];
  onEdit: (note: NoteItem) => void;
  onTagClick: (tag: string) => void;
  /** 以本地笔记 ID 为键的已发布记录；用于显示"已公开"标记 */
  published?: Record<string, PublishedNoteInfo>;
  /** 当前有搜索/分类/标签筛选：空列表时显示“没有匹配”而不是“还没有笔记” */
  filtered?: boolean;
  onClearFilters?: () => void;
  onNewNote?: () => void;
  /** 当前选中的标签，卡片上对应的标签会高亮 */
  selectedTags?: string[];
}

const CATEGORY_COLORS: Record<string, string> = {
  生活: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  工作: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  学习: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  灵感: 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-300',
  其他: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
};

const SENTIMENT = {
  positive: {
    label: '正面',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  },
  negative: {
    label: '低落',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  },
  neutral: {
    label: '平静',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  },
} as const;

const chip = 'shrink-0 rounded-full px-2 py-0.5 text-xs';

/** 今天显示时间，今年显示月日，更早显示完整日期 */
function formatDate(timestamp: number) {
  const d = new Date(timestamp);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `今天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }
  return d.toLocaleDateString('zh-CN');
}

const NoteList: React.FC<NoteListProps> = ({
  notes,
  onEdit,
  onTagClick,
  published,
  filtered = false,
  onClearFilters,
  onNewNote,
  selectedTags = [],
}) => {
  if (notes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-primary-dark/40 px-4 py-14 text-center dark:border-dark-border">
        <div className="mb-3 text-5xl" aria-hidden="true">
          {filtered ? '🔍' : '📝'}
        </div>
        <h3 className="mb-1 text-lg font-semibold text-ink dark:text-dark-text">
          {filtered ? '没有匹配的笔记' : '还没有笔记'}
        </h3>
        <p className="text-sm text-text-light">
          {filtered ? '换个关键词，或清除筛选条件试试' : '点击“新建笔记”开始记录您的想法'}
        </p>
        {filtered && onClearFilters ? (
          <button type="button" onClick={onClearFilters} className="btn btn-secondary mt-5">
            清除筛选
          </button>
        ) : (
          !filtered &&
          onNewNote && (
            <button type="button" onClick={onNewNote} className="btn btn-primary mt-5">
              ➕ 写第一篇
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <ul className="grid items-stretch gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
      {notes.map((note, index) => {
        const sentiment = note.sentimentCategory ? SENTIMENT[note.sentimentCategory] : null;
        const preview = note.content.replace(/[#*`>]/g, '').trim();
        const linkCount = note.links?.length || 0;
        const backlinkCount = note.backlinks?.length || 0;
        return (
          <li
            key={note.id}
            // 点卡片任意位置打开；键盘用户通过标题按钮打开（Enter 触发的 click 会冒泡到这里）
            onClick={() => onEdit(note)}
            className="card group relative flex min-w-0 cursor-pointer flex-col p-4 animate-fade-in-up focus-within:ring-2 focus-within:ring-accent-pink/50 hover:-translate-y-0.5 sm:p-5"
            // 只给前几张错开入场，避免笔记多时最后一张要等好几秒才出现
            style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
          >
            {note.color && (
              <span
                aria-hidden="true"
                className="absolute inset-y-4 left-0 w-1 rounded-r-full"
                style={{ backgroundColor: note.color }}
              />
            )}
            <h3 className="min-w-0">
              <button
                type="button"
                className="block w-full truncate text-left text-base font-semibold text-ink transition-colors group-hover:text-ink-pink focus:outline-hidden sm:text-lg dark:text-dark-text"
              >
                {note.title || '无标题'}
              </button>
            </h3>

            <div className="mt-1.5 flex items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-text-light">
              <span className="shrink-0 tabular-nums">{formatDate(note.updatedAt)}</span>
              {note.category && (
                <span
                  className={`${chip} ${CATEGORY_COLORS[note.category] || CATEGORY_COLORS['其他']}`}
                >
                  {note.category}
                </span>
              )}
              {published?.[note.id] && (
                <span
                  className={`${chip} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`}
                >
                  {hasUnpublishedChanges(note, published[note.id]) ? '已公开·有更新' : '已公开'}
                </span>
              )}
              {sentiment && (
                <span className={`${chip} ${sentiment.className}`}>{sentiment.label}</span>
              )}
            </div>

            <p className="mt-2 mb-3 line-clamp-2 min-h-10 text-sm leading-relaxed text-text-light sm:line-clamp-3 sm:min-h-[3.75rem]">
              {preview || <span className="italic opacity-60">（无内容）</span>}
            </p>

            <div className="mt-auto flex min-h-7 items-center justify-between gap-2">
              <div className="relative z-10 flex min-w-0 gap-1 overflow-hidden">
                {note.tags.slice(0, 3).map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      title={active ? `取消按 #${tag} 筛选` : `按 #${tag} 筛选`}
                      className={`max-w-28 truncate rounded-full px-2 py-1 text-xs whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-accent-pink text-white'
                          : 'bg-accent-purple/10 text-ink-purple hover:bg-accent-purple/25'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTagClick(tag);
                      }}
                    >
                      #{tag}
                    </button>
                  );
                })}
                {note.tags.length > 3 && (
                  <span className="self-center text-xs text-text-light">
                    +{note.tags.length - 3}
                  </span>
                )}
              </div>
              {(linkCount > 0 || backlinkCount > 0) && (
                <div
                  className="flex shrink-0 gap-2 text-xs whitespace-nowrap text-text-light"
                  title={`链接 ${linkCount} · 被引用 ${backlinkCount}`}
                >
                  <span>🔗 {linkCount}</span>
                  <span>↩ {backlinkCount}</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default NoteList;

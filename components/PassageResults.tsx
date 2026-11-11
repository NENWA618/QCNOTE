import React from 'react';
import type { RagHit, RagIndexProgress } from '../lib/rag';
import type { SemanticStatus } from '../lib/hooks/useSemanticSearch';

const panelClass =
  'bg-white/95 dark:bg-dark-surface rounded-2xl border border-primary-light/40 dark:border-dark-border p-4 sm:p-5';

interface PassageResultsProps {
  /** `hits` 是针对哪个搜索词算出来的 */
  query: string;
  hits: RagHit[];
  status: SemanticStatus;
  /** 模型下载进度 0-100（只在首次使用时有意义） */
  progress: number;
  /** 建立块索引的进度；没有需要新建的索引时为 null */
  indexProgress: RagIndexProgress | null;
  error: string | null;
  /** 点击某条结果时打开它所属的笔记 */
  onOpenNote: (noteId: string) => void;
}

/**
 * 相关段落：开启「语义搜索」后，在笔记列表上方列出与搜索词最相关的笔记段落。
 * 只负责展示——检索由 useSemanticSearch 随搜索框输入防抖触发，和列表里追加的语义笔记同出一次查询。
 * 在本机用内置模型做语义匹配，点击结果打开原笔记，不会调用任何外部 AI 服务。
 */
const PassageResults: React.FC<PassageResultsProps> = ({
  query,
  hits,
  status,
  progress,
  indexProgress,
  error,
  onOpenNote,
}) => {
  // 没在检索，或环境不支持（没有 Worker）：侧边栏的状态行已经说明了，这里不占位
  if (status === 'idle' || (status === 'error' && !error)) return null;

  let progressText: string | null = null;
  if (status === 'loading-model') {
    progressText = `正在下载本地模型 ${progress.toFixed(0)}%（仅首次，之后会缓存在浏览器里）`;
  } else if (status === 'indexing' && indexProgress) {
    progressText = `正在为笔记建立索引 ${indexProgress.done} / ${indexProgress.total}（仅首次或笔记有改动时）`;
  } else if (status === 'searching') {
    progressText = '检索中…';
  }

  return (
    <section className={panelClass} aria-labelledby="passage-results-title">
      <h2
        id="passage-results-title"
        className="text-base font-semibold text-ink dark:text-dark-text"
      >
        相关段落
      </h2>
      <p className="mt-1 text-xs text-text-light">
        🔒 本地模型按语义检索，笔记内容不会离开浏览器。
      </p>

      {progressText && (
        <div role="status" className="mt-3 flex items-center gap-2 text-sm text-text-light">
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent-pink/30 border-t-accent-pink"
          />
          <span className="break-words">{progressText}</span>
        </div>
      )}

      {status === 'error' && error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 break-words dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          检索失败：{error}
        </div>
      )}

      {status === 'ready' && hits.length === 0 && (
        <p className="mt-3 text-sm text-text-light">
          没有找到语义相关的段落。可以换个说法再试，或者笔记里确实没有写过这方面的内容。
        </p>
      )}

      {hits.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 truncate text-xs text-text-light">
            与「{query}」最相关的 {hits.length} 段内容
          </p>
          <ol className="space-y-3">
            {hits.map((hit) => (
              <li
                key={`${hit.noteId}:${hit.chunkIndex}`}
                className="rounded-xl border border-primary-light/60 p-3 dark:border-dark-border"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 text-sm font-medium text-ink break-words dark:text-dark-text">
                    <button
                      type="button"
                      onClick={() => onOpenNote(hit.noteId)}
                      aria-label={`打开笔记：${hit.noteTitle || '无标题'}`}
                      className="text-left font-medium underline-offset-2 hover:underline focus-visible:underline"
                    >
                      {hit.noteTitle || '无标题'}
                    </button>
                    {hit.heading && (
                      <span className="font-normal text-text-light"> › {hit.heading}</span>
                    )}
                  </p>
                  <span
                    className="shrink-0 text-xs text-text-light"
                    title="余弦相似度，越接近 1 越相关"
                  >
                    相关度 {hit.score.toFixed(2)}
                  </span>
                </div>
                <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm text-ink dark:text-dark-text">
                  {hit.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
};

export default PassageResults;

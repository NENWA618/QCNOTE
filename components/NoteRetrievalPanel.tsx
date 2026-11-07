import React, { useState } from 'react';
import Link from 'next/link';
import NoteStorage, { NoteStorageError } from '../lib/storage';
import { useRagSearch, type RagSource } from '../lib/hooks/useRagSearch';
import { isImeComposing } from '../lib/ime';

const LOCKED_NOTES_HINT = '当前设备未解锁，无法读取笔记。请先打开「笔记」页完成设备验证后再回来。';

const panelClass =
  'bg-white/95 dark:bg-dark-surface rounded-2xl border border-primary-light/40 dark:border-dark-border p-5 sm:p-6';

interface NoteRetrievalPanelProps {
  /** 取得当前用户的 NoteStorage（同时作为笔记来源和块向量缓存） */
  getStorage: () => Promise<NoteStorage>;
}

/**
 * 笔记检索：纯前端 RAG 检索。
 * 在本机用内置模型把问题与笔记片段做语义匹配，返回最相关的段落。
 * 不依赖、也不会调用页面上配置的外部 AI 服务。
 */
const NoteRetrievalPanel: React.FC<NoteRetrievalPanelProps> = ({ getStorage }) => {
  const [question, setQuestion] = useState('');

  const loadSource = async (): Promise<RagSource> => {
    try {
      const storage = await getStorage();
      const notes = (await storage.loadNotesAsync()).filter((n) => !n.isDeleted);
      return { notes, cacheStore: storage };
    } catch (e) {
      if (e instanceof NoteStorageError && e.kind === 'locked') {
        throw new Error(LOCKED_NOTES_HINT, { cause: e });
      }
      throw e;
    }
  };

  const { status, hits, query, modelProgress, indexProgress, error, available, search } =
    useRagSearch({ loadSource });

  const busy = status === 'loading-model' || status === 'indexing' || status === 'searching';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !question.trim()) return;
    void search(question);
  };

  // 输入法选词时的回车不应提交
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isImeComposing(e.nativeEvent)) e.preventDefault();
  };

  let progressText: string | null = null;
  if (status === 'loading-model') {
    progressText = `正在下载本地模型 ${modelProgress.toFixed(0)}%（仅首次，之后会缓存在浏览器里）`;
  } else if (status === 'indexing' && indexProgress) {
    progressText = `正在为笔记建立索引 ${indexProgress.done} / ${indexProgress.total}（仅首次或笔记有改动时）`;
  } else if (status === 'searching') {
    progressText = '检索中…';
  }

  return (
    <section className={`${panelClass} mt-6`} aria-labelledby="note-retrieval-title">
      <h2 id="note-retrieval-title" className="text-lg font-semibold text-ink dark:text-dark-text">
        笔记检索
      </h2>
      <p className="mt-1 mb-5 text-sm text-text-light">
        🔒 完全在本设备上完成：用内置本地模型按语义找出最相关的笔记段落，不会调用上面的 AI
        服务，笔记内容不会离开浏览器。
      </p>

      {!available && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          当前浏览器不支持 Web Worker，无法使用本地检索。
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="rag-question" className="sr-only">
          输入你想在笔记里查找的内容
        </label>
        <input
          id="rag-question"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="例如：我之前是怎么配置 WebDAV 同步的？"
          autoComplete="off"
          disabled={!available}
          className="input py-2 text-sm sm:flex-1"
        />
        <button
          type="submit"
          className="btn btn-primary sm:min-w-[6rem]"
          disabled={!available || busy || !question.trim()}
        >
          {busy ? '检索中...' : '检索'}
        </button>
      </form>

      {progressText && (
        <div role="status" className="mt-4 flex items-center gap-2 text-sm text-text-light">
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent-pink/30 border-t-accent-pink"
          />
          <span className="break-words">{progressText}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 break-words dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          检索失败：{error}
        </div>
      )}

      {status === 'ready' && query && hits.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-primary-dark/40 dark:border-dark-border p-3 text-sm text-text-light">
          没有找到相关内容。可以换个说法再试，或者笔记里确实没有写过这方面的内容。
        </div>
      )}

      {hits.length > 0 && status !== 'error' && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-text-light truncate">
            与「{query}」最相关的 {hits.length} 段内容
          </p>
          <ol className="space-y-3">
            {hits.map((hit) => (
              <li
                key={`${hit.noteId}:${hit.chunkIndex}`}
                className="rounded-xl border border-primary-light/60 dark:border-dark-border p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 text-sm font-medium text-ink dark:text-dark-text break-words">
                    {hit.noteTitle || '无标题'}
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
                <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm text-ink dark:text-dark-text">
                  {hit.text}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-text-light">
            想打开原笔记？到{' '}
            <Link href="/dashboard" className="underline underline-offset-2">
              笔记页
            </Link>{' '}
            搜索标题即可。
          </p>
        </div>
      )}
    </section>
  );
};

export default NoteRetrievalPanel;

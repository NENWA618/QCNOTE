import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import axios from 'axios';
import Layout from '../../../../components/Layout';
import { ColoredMarkdown } from '../../../../components/ColoredMarkdown';
import { withApiBaseUrl } from '../../../../lib/api-client';
import type { PublicNote } from '../../../../types/ugc-types';

export default function PublicNotePage() {
  const router = useRouter();
  const noteId = typeof router.query.noteId === 'string' ? router.query.noteId : undefined;

  const [note, setNote] = useState<PublicNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setError(null);
    axios
      .get(withApiBaseUrl(`/api/ugc/public/notes/${encodeURIComponent(noteId)}`))
      .then((response) => {
        if (!cancelled) setNote(response.data.note);
      })
      .catch((err) => {
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setNotFound(true);
        } else {
          setError('加载笔记失败，请稍后再试');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  return (
    <>
      <Head>
        <title>{note ? `${note.title} - QCNOTE` : '公开笔记 - QCNOTE'}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Layout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="p-8 text-center text-primary-dark dark:text-dark-text">加载中...</div>
          ) : notFound ? (
            <div className="p-8 text-center text-primary-dark dark:text-dark-text">
              这篇笔记不存在，或已被作者取消发布
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : note ? (
            <article className="card dark:bg-dark-surface dark:border-dark-border">
              <h1 className="text-3xl font-bold text-primary-dark dark:text-dark-text">
                {note.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-text-light dark:text-dark-text-secondary">
                <Link
                  href={`/u/${encodeURIComponent(note.author.userId)}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <img
                    src={note.author.avatar || '/images/default-avatar.png'}
                    alt={`${note.author.username} 的头像`}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                  {note.author.username}
                </Link>
                <span>发布于 {new Date(note.publishedAt).toLocaleDateString('zh-CN')}</span>
                {note.updatedAt > note.publishedAt && (
                  <span>更新于 {new Date(note.updatedAt).toLocaleDateString('zh-CN')}</span>
                )}
                {note.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
              <div className="mt-6 text-primary-dark dark:text-dark-text">
                <ColoredMarkdown content={note.content} coloredRanges={note.coloredRanges} />
              </div>
            </article>
          ) : null}
        </div>
      </Layout>
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import Layout from '../../components/Layout';
import UserAvatar from '../../components/UserAvatar';
import CopyLinkButton from '../../components/CopyLinkButton';
import { withApiBaseUrl } from '../../lib/api-client';
import type { PublicNoteSummary, UserProfile } from '../../types/ugc-types';

const NOTES_PAGE_SIZE = 20;

type PublicProfile = Pick<UserProfile, 'userId' | 'username' | 'avatar' | 'bio' | 'joinedAt'>;

type NotesResult = { page: PublicNoteSummary[]; total: number };

const panelClass =
  'bg-white/95 dark:bg-dark-surface rounded-2xl border border-primary-light/40 dark:border-dark-border';

const formatDate = (ts: number) => new Date(ts).toLocaleDateString('zh-CN');

async function requestNotes(userId: string, offset: number): Promise<NotesResult | null> {
  try {
    const response = await axios.get(
      withApiBaseUrl(`/api/ugc/public/user/${encodeURIComponent(userId)}/notes`),
      { params: { limit: NOTES_PAGE_SIZE, offset } },
    );
    return { page: response.data.notes ?? [], total: response.data.total ?? 0 };
  } catch {
    return null;
  }
}

function ProfileHeaderSkeleton() {
  return (
    <div className={`${panelClass} overflow-hidden animate-pulse`} aria-hidden="true">
      <div className="h-24 sm:h-32 bg-primary-light dark:bg-dark-surface-light" />
      <div className="px-5 sm:px-8 pb-6 -mt-12 flex flex-col items-center gap-4 sm:flex-row sm:items-end">
        <div className="h-24 w-24 rounded-full border-4 border-white bg-primary-medium dark:border-dark-surface dark:bg-dark-border" />
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <div className="h-6 w-40 rounded bg-primary-light dark:bg-dark-surface-light" />
          <div className="h-4 w-28 rounded bg-primary-light/70 dark:bg-dark-surface-light" />
        </div>
      </div>
    </div>
  );
}

function NoteCardSkeleton() {
  return (
    <div className={`${panelClass} p-5 animate-pulse space-y-3`} aria-hidden="true">
      <div className="h-5 w-2/3 rounded bg-primary-light dark:bg-dark-surface-light" />
      <div className="h-4 w-full rounded bg-primary-light/70 dark:bg-dark-surface-light" />
      <div className="h-4 w-4/5 rounded bg-primary-light/70 dark:bg-dark-surface-light" />
    </div>
  );
}

export default function PublicProfilePage() {
  const router = useRouter();
  const userId = typeof router.query.userId === 'string' ? router.query.userId : undefined;
  const { data: session } = useSession();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 换一个用户时回到加载状态（渲染期调整，避免在 effect 里同步 setState）
  const [loadedFor, setLoadedFor] = useState(userId);
  if (loadedFor !== userId) {
    setLoadedFor(userId);
    setLoading(true);
    setNotFound(false);
    setError(null);
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    axios
      .get(withApiBaseUrl(`/api/ugc/public/user/${encodeURIComponent(userId)}`))
      .then((response) => {
        if (!cancelled) setProfile(response.data.profile);
      })
      .catch((err) => {
        if (cancelled) return;
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setNotFound(true);
        } else {
          setError('加载个人主页失败，请稍后再试');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const [notes, setNotes] = useState<PublicNoteSummary[]>([]);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  // 换一个用户时清空列表并进入加载状态（渲染期调整）
  const [notesFor, setNotesFor] = useState(userId);
  if (notesFor !== userId) {
    setNotesFor(userId);
    setNotes([]);
    setNotesTotal(0);
    setNotesLoading(true);
    setNotesError(null);
  }

  const applyNotesResult = useCallback((result: NotesResult | null, offset: number) => {
    if (result) {
      setNotes((prev) => (offset === 0 ? result.page : [...prev, ...result.page]));
      setNotesTotal(result.total);
    } else {
      setNotesError('加载公开笔记失败，请稍后再试');
    }
    setNotesLoading(false);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void requestNotes(userId, 0).then((result) => {
      if (!cancelled) applyNotesResult(result, 0);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, applyNotesResult]);

  const handleLoadMore = () => {
    if (!userId) return;
    const offset = notes.length;
    setNotesLoading(true);
    setNotesError(null);
    void requestNotes(userId, offset).then((result) => applyNotesResult(result, offset));
  };

  const title = profile ? `${profile.username} 的个人主页 - QCNOTE` : '个人主页 - QCNOTE';
  const isOwner = !!profile && session?.user?.id === profile.userId;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={profile?.bio || 'QCNOTE 用户个人主页'} />
        <meta name="robots" content="noindex" />
      </Head>
      <Layout>
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div role="status" className="space-y-6">
              <span className="sr-only">加载中…</span>
              <ProfileHeaderSkeleton />
              <div className="grid gap-4 sm:grid-cols-2">
                <NoteCardSkeleton />
                <NoteCardSkeleton />
              </div>
            </div>
          ) : notFound ? (
            <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 text-center">
              <div aria-hidden="true" className="mb-4 text-5xl">
                🔍
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-ink dark:text-dark-text">
                找不到这个主页
              </h1>
              <p className="mt-2 text-text-light">该用户不存在，或主页未公开</p>
              <Link href="/" className="btn btn-secondary mt-6">
                返回首页
              </Link>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex flex-col justify-between gap-3 rounded-xl bg-red-50 p-4 text-red-700 sm:flex-row sm:items-center dark:bg-red-950/40 dark:text-red-300"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => router.reload()}
                className="btn btn-sm btn-secondary shrink-0"
              >
                重新加载
              </button>
            </div>
          ) : profile ? (
            <div className="space-y-8">
              {/* 主页头部：渐变横幅 + 压在横幅上的头像。窄屏居中，宽屏左对齐 */}
              <header className={`${panelClass} overflow-hidden`}>
                <div
                  aria-hidden="true"
                  className="h-24 sm:h-32 bg-linear-to-r from-accent-pink/70 via-primary-dark/60 to-accent-purple/70"
                />
                <div className="px-5 sm:px-8 pb-6">
                  {/* 只有头像压在横幅上；名字始终在横幅下方，避免压在渐变上看不清 */}
                  <div className="flex flex-col items-center gap-3 pt-0 text-center sm:flex-row sm:items-end sm:gap-5 sm:pt-4 sm:text-left">
                    <span className="-mt-12 flex shrink-0 sm:-mt-16 sm:self-start">
                      <UserAvatar
                        src={profile.avatar}
                        name={profile.username}
                        size={96}
                        className="border-4 border-white shadow-md dark:border-dark-surface"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h1 className="break-words text-2xl font-bold text-ink sm:text-3xl dark:text-dark-text">
                        {profile.username}
                      </h1>
                      <p className="mt-1 text-sm text-text-light">
                        加入于 {formatDate(profile.joinedAt)}
                        <span aria-hidden="true"> · </span>
                        {notesTotal} 篇公开笔记
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      {isOwner && (
                        <Link
                          href="/profile"
                          className="btn btn-sm btn-primary flex-1 sm:flex-none"
                        >
                          编辑资料
                        </Link>
                      )}
                      <CopyLinkButton
                        path={`/u/${encodeURIComponent(profile.userId)}`}
                        className="btn btn-sm btn-secondary flex-1 sm:flex-none"
                      />
                    </div>
                  </div>
                  {profile.bio && (
                    <p className="mt-5 whitespace-pre-wrap break-words text-center leading-relaxed text-ink sm:text-left dark:text-dark-text">
                      {profile.bio}
                    </p>
                  )}
                </div>
              </header>

              <section aria-labelledby="public-notes-heading">
                <h2
                  id="public-notes-heading"
                  className="mb-4 text-lg font-bold text-ink sm:text-xl dark:text-dark-text"
                >
                  公开笔记
                  {notesTotal > 0 && (
                    <span className="ml-2 text-sm font-normal tabular-nums text-text-light">
                      {notesTotal} 篇
                    </span>
                  )}
                </h2>
                {notesError && (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  >
                    {notesError}
                  </div>
                )}
                {!notesLoading && !notesError && notes.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-primary-dark/40 px-4 py-12 text-center text-text-light dark:border-dark-border">
                    还没有公开的笔记
                  </div>
                )}
                <ul className="grid gap-4 sm:grid-cols-2">
                  {notes.map((note) => (
                    <li key={note.id} className="min-w-0">
                      <Link
                        href={`/u/${encodeURIComponent(profile.userId)}/n/${encodeURIComponent(note.id)}`}
                        className={`${panelClass} group flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-accent-pink/60 hover:shadow-(--shadow-3) focus-visible:outline-2 focus-visible:outline-accent-pink`}
                      >
                        <h3 className="line-clamp-2 break-words text-base font-semibold text-ink group-hover:text-ink-pink sm:text-lg dark:text-dark-text">
                          {note.title}
                        </h3>
                        {note.preview && (
                          <p className="mt-2 line-clamp-3 break-words text-sm text-text-light">
                            {note.preview}
                          </p>
                        )}
                        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 text-xs text-text-light">
                          <span className="mr-1 tabular-nums">{formatDate(note.publishedAt)}</span>
                          {note.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="max-w-[10rem] truncate rounded-full bg-primary-light/70 px-2 py-0.5 text-ink-purple dark:bg-dark-surface-light dark:text-dark-text-secondary"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </Link>
                    </li>
                  ))}
                  {notesLoading && notes.length === 0 && (
                    <>
                      <li>
                        <NoteCardSkeleton />
                      </li>
                      <li>
                        <NoteCardSkeleton />
                      </li>
                    </>
                  )}
                </ul>
                {notes.length < notesTotal && (
                  <div className="mt-6 flex justify-center">
                    <button
                      className="btn btn-secondary w-full sm:w-auto sm:min-w-[10rem]"
                      disabled={notesLoading}
                      onClick={handleLoadMore}
                    >
                      {notesLoading
                        ? '加载中...'
                        : `加载更多（还有 ${notesTotal - notes.length} 篇）`}
                    </button>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </Layout>
    </>
  );
}

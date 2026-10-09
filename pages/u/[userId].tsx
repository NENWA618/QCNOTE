import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import axios from 'axios';
import Layout from '../../components/Layout';
import UserAvatar from '../../components/UserAvatar';
import { withApiBaseUrl } from '../../lib/api-client';
import type { PublicNoteSummary, UserProfile } from '../../types/ugc-types';

const NOTES_PAGE_SIZE = 20;

type PublicProfile = Pick<UserProfile, 'userId' | 'username' | 'avatar' | 'bio' | 'joinedAt'>;

type NotesResult = { page: PublicNoteSummary[]; total: number };

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

export default function PublicProfilePage() {
  const router = useRouter();
  const userId = typeof router.query.userId === 'string' ? router.query.userId : undefined;

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

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={profile?.bio || 'QCNOTE 用户个人主页'} />
        <meta name="robots" content="noindex" />
      </Head>
      <Layout>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="p-8 text-center text-ink dark:text-dark-text">加载中...</div>
          ) : notFound ? (
            <div className="p-8 text-center text-ink dark:text-dark-text">
              该用户不存在，或主页未公开
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : profile ? (
            <div className="space-y-8">
              <div className="card dark:bg-dark-surface dark:border-dark-border space-y-6">
                <div className="flex items-center gap-4">
                  <UserAvatar
                    src={profile.avatar}
                    name={profile.username}
                    size={80}
                    className="border-2 border-white dark:border-dark-border"
                  />
                  <div>
                    <h1 className="text-3xl font-bold text-ink dark:text-dark-text">
                      {profile.username}
                    </h1>
                    <p className="text-sm text-text-light dark:text-dark-text-secondary">
                      加入于 {new Date(profile.joinedAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                </div>
                {profile.bio && (
                  <p className="whitespace-pre-wrap text-ink dark:text-dark-text">{profile.bio}</p>
                )}
              </div>

              <section>
                <h2 className="text-2xl font-bold mb-4 text-ink dark:text-dark-text">
                  公开笔记{notesTotal > 0 ? `（${notesTotal}）` : ''}
                </h2>
                {notesError && (
                  <div className="mb-4 p-4 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                    {notesError}
                  </div>
                )}
                {!notesLoading && !notesError && notes.length === 0 && (
                  <p className="text-text-light dark:text-dark-text-secondary">还没有公开的笔记</p>
                )}
                <ul className="space-y-4">
                  {notes.map((note) => (
                    <li key={note.id}>
                      <Link
                        href={`/u/${encodeURIComponent(profile.userId)}/n/${encodeURIComponent(note.id)}`}
                        className="card dark:bg-dark-surface dark:border-dark-border block hover:shadow-lg transition-shadow"
                      >
                        <h3 className="text-lg font-semibold text-ink dark:text-dark-text">
                          {note.title}
                        </h3>
                        {note.preview && (
                          <p className="mt-2 text-sm text-text-light dark:text-dark-text-secondary line-clamp-2">
                            {note.preview}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-light dark:text-dark-text-secondary">
                          <span>{new Date(note.publishedAt).toLocaleDateString('zh-CN')}</span>
                          {note.tags.slice(0, 5).map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                {notes.length < notesTotal && (
                  <div className="mt-4 text-center">
                    <button
                      className="btn btn-secondary"
                      disabled={notesLoading}
                      onClick={handleLoadMore}
                    >
                      {notesLoading ? '加载中...' : '加载更多'}
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

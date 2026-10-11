import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { useSession } from 'next-auth/react';
import type { LeaderboardEntry } from '../types/ugc-types';
import UserAvatar from './UserAvatar';

type SessionUserWithId = { id?: string };

type FetchResult =
  { ok: true; entries: LeaderboardEntry[]; day: string | null } | { ok: false; error: string };

async function fetchLeaderboard(): Promise<FetchResult> {
  try {
    const response = await axios.get(`/api/ugc/leaderboard/maze?limit=50`, {
      withCredentials: true,
    });
    if (response.data.success) {
      return { ok: true, entries: response.data.leaderboard ?? [], day: response.data.day ?? null };
    }
    return {
      ok: false,
      error: response.data.error || response.data.message || '加载排行榜失败',
    };
  } catch (error) {
    const message =
      axios.isAxiosError(error) && error.response
        ? `${error.response.status} ${error.response.statusText}`
        : error instanceof Error
          ? error.message
          : 'Unknown error';
    console.error('Failed to fetch leaderboard:', error);
    return { ok: false, error: `加载排行榜失败：${message}` };
  }
}

const formatTime = (timeMs: number) => {
  const seconds = Math.floor(timeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
};

/** 服务端返回 2026-10-12，显示成 10 月 12 日 */
const formatDay = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return m && d ? `${m} 月 ${d} 日` : day;
};

const panelClass =
  'rounded-2xl border border-primary-light/40 bg-white/95 dark:border-dark-border dark:bg-dark-surface';

// 前三名：浅色底 + 有色边框，文字保持正文色（原来白字压在黄/橙渐变上只有约 2:1 的对比度）
const PODIUM_STYLE = [
  {
    ring: 'border-amber-300 dark:border-amber-500/60',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    medal: '🥇',
    label: '冠军',
  },
  {
    ring: 'border-slate-300 dark:border-slate-400/50',
    bg: 'bg-slate-50 dark:bg-slate-400/10',
    medal: '🥈',
    label: '亚军',
  },
  {
    ring: 'border-orange-300 dark:border-orange-500/50',
    bg: 'bg-orange-50 dark:bg-orange-500/10',
    medal: '🥉',
    label: '季军',
  },
];

function Stats({
  entry,
  align = 'right',
}: {
  entry: LeaderboardEntry;
  align?: 'right' | 'center';
}) {
  return (
    <div className={`shrink-0 tabular-nums ${align === 'center' ? 'text-center' : 'text-right'}`}>
      <p className="text-lg font-bold text-ink sm:text-xl dark:text-dark-text">
        {entry.steps ?? '-'}
        <span className="ml-0.5 text-xs font-normal text-text-light">步</span>
      </p>
      <p className="text-xs text-text-light">⏱ {formatTime(entry.timeMs ?? 0)}</p>
    </div>
  );
}

function YouTag() {
  return (
    <span className="ml-1.5 shrink-0 rounded-full bg-accent-pink px-1.5 py-0.5 text-[10px] font-semibold text-white">
      你
    </span>
  );
}

function ListSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${panelClass} h-24 sm:h-44`} />
        ))}
      </div>
      <div className={`${panelClass} divide-y divide-gray-100 dark:divide-dark-border`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-5 w-6 rounded bg-primary-light dark:bg-dark-surface-light" />
            <div className="h-10 w-10 rounded-full bg-primary-light dark:bg-dark-surface-light" />
            <div className="h-4 flex-1 rounded bg-primary-light/70 dark:bg-dark-surface-light" />
          </div>
        ))}
      </div>
    </div>
  );
}

const Leaderboard: React.FC = () => {
  const { data: session } = useSession();
  const myId = (session?.user as SessionUserWithId | undefined)?.id;

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyResult = useCallback((result: FetchResult) => {
    if (result.ok) {
      setEntries(result.entries);
      setDay(result.day);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  // 首次加载显示骨架屏；之后的刷新（手动或提交成绩后）保留现有列表，只让按钮转圈
  const refresh = useCallback(async () => {
    setRefreshing(true);
    applyResult(await fetchLeaderboard());
    setRefreshing(false);
  }, [applyResult]);

  useEffect(() => {
    let cancelled = false;
    void fetchLeaderboard().then((result) => {
      if (cancelled) return;
      applyResult(result);
      setLoading(false);
    });
    const onSubmission = () => void refresh();
    window.addEventListener('maze-submission-updated', onSubmission);
    return () => {
      cancelled = true;
      window.removeEventListener('maze-submission-updated', onSubmission);
    };
  }, [applyResult, refresh]);

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const myEntry = myId ? entries.find((e) => e.userId === myId) : undefined;

  const profileHref = (entry: LeaderboardEntry) => `/u/${encodeURIComponent(entry.userId)}`;

  return (
    <div className="mx-auto max-w-3xl">
      {/* 头部 */}
      <div className="mb-6 rounded-2xl border border-accent-pink/20 bg-linear-to-br from-accent-pink/15 to-accent-purple/15 px-5 py-6 text-center sm:px-8 sm:py-8 dark:border-accent-purple/30 dark:from-accent-purple/20 dark:to-accent-pink/20">
        <h1 className="text-2xl font-bold text-ink sm:text-4xl dark:text-dark-text">
          🧭 叠界排行榜
        </h1>
        <p className="mt-2 text-sm text-text-light sm:text-base">
          {day ? `${formatDay(day)} · ` : ''}展示当天最佳通关记录
        </p>
        <p className="mt-1 text-xs text-text-light">
          <span className="block sm:inline">步数少者优先，步数相同比用时</span>
          <span aria-hidden="true" className="hidden sm:inline">
            {' · '}
          </span>
          <span className="block sm:inline">每天 0 点（UTC+8）重置</span>
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/diejie" className="btn btn-primary">
            去挑战
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || refreshing}
            className="btn btn-secondary"
            aria-label="刷新排行榜"
          >
            <span aria-hidden="true" className={refreshing ? 'inline-block animate-spin' : ''}>
              ↻
            </span>
            <span className="hidden sm:inline">{refreshing ? '刷新中…' : '刷新'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div role="status">
          <span className="sr-only">加载中…</span>
          <ListSkeleton />
        </div>
      ) : error && entries.length === 0 ? (
        <div className={`${panelClass} px-5 py-12 text-center`} role="alert">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button type="button" onClick={() => void refresh()} className="btn btn-secondary mt-4">
            重试
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className={`${panelClass} px-5 py-12 text-center`}>
          <p className="text-4xl" aria-hidden="true">
            🏁
          </p>
          <p className="mt-3 text-lg text-ink dark:text-dark-text">今天还没有人上榜</p>
          <p className="mt-1 text-sm text-text-light">来当第一个通关的人吧</p>
          <Link href="/diejie" className="btn btn-primary mt-5">
            开始挑战
          </Link>
        </div>
      ) : (
        <>
          {error && (
            <p role="alert" className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* 你的名次（在榜单靠后时，不用往下翻找） */}
          {myEntry && myEntry.rank > 3 && (
            <a
              href={`#rank-${myEntry.rank}`}
              className={`${panelClass} mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm`}
            >
              <span className="text-text-light">
                你今天排在 <strong className="text-ink-pink">第 {myEntry.rank} 名</strong>
              </span>
              <span className="text-ink-pink">查看 ↓</span>
            </a>
          )}

          {/* 前三名：宽屏是 2-1-3 领奖台，窄屏按名次纵向排列 */}
          <ol
            className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end"
            aria-label="前三名"
          >
            {podium.map((entry, i) => {
              const style = PODIUM_STYLE[i];
              const isMe = entry.userId === myId;
              const order = i === 0 ? 'sm:order-2' : i === 1 ? 'sm:order-1' : 'sm:order-3';
              return (
                <li
                  key={entry.userId}
                  id={`rank-${entry.rank}`}
                  className={`${order} min-w-0 scroll-mt-24`}
                >
                  <Link
                    href={profileHref(entry)}
                    className={`flex items-center gap-3 rounded-2xl border-2 p-4 transition-transform hover:-translate-y-0.5 sm:flex-col sm:gap-2 sm:text-center ${style.ring} ${style.bg} ${
                      i === 0 ? 'sm:pt-6 sm:pb-6' : ''
                    } ${isMe ? 'ring-2 ring-accent-pink ring-offset-2 dark:ring-offset-dark-bg' : ''}`}
                  >
                    <span className="text-3xl leading-none sm:order-first" aria-hidden="true">
                      {style.medal}
                    </span>
                    <span className="sr-only">
                      第 {entry.rank} 名（{style.label}）
                    </span>
                    <UserAvatar
                      src={entry.avatar}
                      name={entry.username}
                      size={i === 0 ? 64 : 52}
                      className="border-2 border-white shadow-sm dark:border-dark-border"
                    />
                    <div className="flex min-w-0 flex-1 items-center sm:w-full sm:flex-none sm:justify-center">
                      <span className="truncate font-semibold text-ink dark:text-dark-text">
                        {entry.username}
                      </span>
                      {isMe && <YouTag />}
                    </div>
                    <Stats entry={entry} align="center" />
                  </Link>
                </li>
              );
            })}
          </ol>

          {/* 第 4 名起 */}
          {rest.length > 0 && (
            <ol
              start={4}
              className={`${panelClass} divide-y divide-gray-100 overflow-hidden dark:divide-dark-border`}
            >
              {rest.map((entry) => {
                const isMe = entry.userId === myId;
                return (
                  <li key={entry.userId} id={`rank-${entry.rank}`} className="scroll-mt-24">
                    <Link
                      href={profileHref(entry)}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors sm:px-5 ${
                        isMe
                          ? 'bg-primary-light/60 dark:bg-accent-pink/10'
                          : 'hover:bg-primary-light/30 dark:hover:bg-dark-surface-light'
                      }`}
                    >
                      <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-text-light">
                        {entry.rank}
                      </span>
                      <UserAvatar
                        src={entry.avatar}
                        name={entry.username}
                        size={40}
                        className="border-2 border-white dark:border-dark-border"
                      />
                      <div className="flex min-w-0 flex-1 items-center">
                        <span className="truncate font-medium text-ink dark:text-dark-text">
                          {entry.username}
                        </span>
                        {isMe && <YouTag />}
                        {entry.badge && (
                          <span aria-hidden="true" className="ml-1.5 shrink-0 text-sm">
                            {entry.badge}
                          </span>
                        )}
                      </div>
                      <Stats entry={entry} />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
};

export default Leaderboard;

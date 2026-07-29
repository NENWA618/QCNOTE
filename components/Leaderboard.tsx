import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Image from 'next/image';
import type { LeaderboardEntry } from '../types/ugc-types';

const Leaderboard: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await axios.get(`/api/ugc/leaderboard/maze?limit=50`);

        if (response.data.success) {
          setEntries(response.data.leaderboard);
          setCount(response.data.count ?? response.data.leaderboard?.length ?? 0);
          setDebugInfo(response.data.debug || null);
        } else {
          setError(response.data.error || response.data.message || '加载排行榜失败');
          setDebugInfo(response.data.debug || null);
          console.error('Failed to fetch leaderboard:', response.data);
        }
      } catch (error) {
        const message =
          axios.isAxiosError(error) && error.response
            ? `${error.response.status} ${error.response.statusText}`
            : error instanceof Error
              ? error.message
              : 'Unknown error';
        setError(`加载排行榜失败：${message}`);
        console.error('Failed to fetch leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  const title = '🧭 叠界排行榜';
  const subtitle = '仅展示当天首次通关记录';

  const formatTime = (timeMs: number) => {
    const seconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-pink"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-primary-dark dark:text-dark-text mb-2">{title}</h1>
          <p className="text-text-light dark:text-dark-text-secondary">{subtitle}</p>
        </div>

        <div className="space-y-4">
          {entries.map((entry, index) => (
            <div
              key={entry.userId}
              className={`flex items-center gap-4 p-6 rounded-lg transition ${
                index === 0
                  ? 'bg-gradient-to-r from-yellow-500 to-yellow-600'
                  : index === 1
                    ? 'bg-gradient-to-r from-gray-400 to-gray-500'
                    : index === 2
                      ? 'bg-gradient-to-r from-orange-600 to-orange-700'
                      : 'card dark:bg-dark-surface dark:border-dark-border hover:shadow-medium'
              }`}
            >
              <div
                className={`text-3xl font-bold w-16 text-center ${index < 3 ? 'text-white' : 'text-primary-dark dark:text-dark-text'}`}
              >
                {entry.badge ? entry.badge : `#${entry.rank}`}
              </div>

              <div className="flex items-center gap-4 flex-1">
                <Image
                  src={entry.avatar || '/images/default-avatar.png'}
                  alt={entry.username}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full border-2 border-white dark:border-dark-border"
                />
                <div>
                  <p
                    className={`font-bold text-lg ${index < 3 ? 'text-white' : 'text-primary-dark dark:text-dark-text'}`}
                  >
                    {entry.username}
                  </p>
                  <p
                    className={`text-sm ${index < 3 ? 'text-gray-100' : 'text-text-light dark:text-dark-text-secondary'}`}
                  >
                    排名 #{entry.rank}
                  </p>
                </div>
              </div>

              <div
                className={`text-right ${index < 3 ? 'text-white' : 'text-accent-pink dark:text-accent-purple'}`}
              >
                <p className="text-2xl font-bold">{(entry.score ?? 0).toFixed(0)}</p>
                <p
                  className={`text-xs ${index < 3 ? 'text-gray-100' : 'text-text-light dark:text-dark-text-secondary'}`}
                >
                  积分
                </p>
                <p
                  className={`text-xs ${index < 3 ? 'text-gray-100' : 'text-text-light dark:text-dark-text-secondary'}`}
                >
                  {entry.steps ?? '-'} 步 · {formatTime(entry.timeMs ?? 0)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {error ? (
          <div className="text-center py-12 text-red-500">
            <p className="text-lg">{error}</p>
            {count !== null && <p className="mt-2 text-sm text-red-300">count: {count}</p>}
            {debugInfo && (
              <pre className="mt-2 text-xs text-left overflow-x-auto text-red-200 bg-black/10 p-2 rounded">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            )}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-light dark:text-dark-text-secondary text-lg">
              暂无今日叠界排行数据
            </p>
            {count !== null && (
              <p className="mt-2 text-sm text-text-light dark:text-dark-text-secondary">
                count: {count}
              </p>
            )}
            {debugInfo && (
              <pre className="mt-4 text-xs text-left overflow-x-auto text-text-light dark:text-dark-text-secondary bg-black/5 dark:bg-white/5 p-2 rounded">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Leaderboard;

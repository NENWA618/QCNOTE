import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Image from 'next/image';
import type { LeaderboardEntry } from '../types/ugc-types';

interface LeaderboardProps {
  type: 'creative' | 'activity' | 'influence';
}

const Leaderboard: React.FC<LeaderboardProps> = ({ type }) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/ugc/leaderboard/${type}?limit=50`);

      if (response.data.success) {
        setEntries(response.data.leaderboard);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const typeConfig = {
    creative: {
      title: '🎨 创意排行榜',
      subtitle: '最受欢迎的创意作品',
      icon: '🏆',
    },
    activity: {
      title: '⚡ 活跃度排行榜',
      subtitle: '社区最活跃的创意者',
      icon: '🔥',
    },
    influence: {
      title: '👑 影响力排行榜',
      subtitle: '最具影响力的创意领袖',
      icon: '⭐',
    },
  };

  const config = typeConfig[type];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-pink"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-dark-bg p-8">
      <div className="max-w-2xl mx-auto">
        {/* 头部 */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-primary-dark dark:text-dark-text mb-2">{config.title}</h1>
          <p className="text-text-light dark:text-dark-text-secondary">{config.subtitle}</p>
        </div>

        {/* 排行榜 */}
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
              {/* 排名 */}
              <div className={`text-3xl font-bold w-16 text-center ${index < 3 ? 'text-white' : 'text-primary-dark dark:text-dark-text'}`}>
                {entry.badge ? entry.badge : `#${entry.rank}`}
              </div>

              {/* 用户信息 */}
              <div className="flex items-center gap-4 flex-1">
                <Image
                  src={entry.avatar}
                  alt={entry.username}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full border-2 border-white dark:border-dark-border"
                />
                <div>
                  <p className={`font-bold text-lg ${index < 3 ? 'text-white' : 'text-primary-dark dark:text-dark-text'}`}>
                    {entry.username}
                  </p>
                  <p className={`text-sm ${index < 3 ? 'text-gray-100' : 'text-text-light dark:text-dark-text-secondary'}`}>
                    排名 #{entry.rank}
                  </p>
                </div>
              </div>

              {/* 分数 */}
              <div className={`text-right ${index < 3 ? 'text-white' : 'text-accent-pink dark:text-accent-purple'}`}>
                <p className="text-2xl font-bold">{entry.score.toFixed(0)}</p>
                <p className={`text-xs ${index < 3 ? 'text-gray-100' : 'text-text-light dark:text-dark-text-secondary'}`}>积分</p>
              </div>
            </div>
          ))}
        </div>

        {entries.length === 0 && (
          <div className="text-center py-12">
            <p className="text-text-light dark:text-dark-text-secondary text-lg">暂无排行数据</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;

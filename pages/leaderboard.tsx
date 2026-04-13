import React, { useState } from 'react';
import Head from 'next/head';
import Leaderboard from '../components/Leaderboard';

export default function LeaderboardPage() {
  const [type, setType] = useState<'creative' | 'activity' | 'influence'>('creative');

  return (
    <>
      <Head>
        <title>排行榜 - QCNOTE</title>
        <meta name="description" content="QCNOTE 排行榜页面，查看创意、活跃度和影响力排行榜。" />
      </Head>
      <div className="min-h-screen bg-gray-900">
      {/* 类型切换 */}
      <div className="bg-gray-800 border-b border-gray-700 p-6">
        <div className="max-w-2xl mx-auto flex gap-4">
          {(['creative', 'activity', 'influence'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-6 py-2 rounded-lg font-medium transition ${
                type === t
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {t === 'creative' && '🎨 创意'}
              {t === 'activity' && '⚡ 活跃度'}
              {t === 'influence' && '👑 影响力'}
            </button>
          ))}
        </div>
      </div>

      <Leaderboard type={type} />
    </div>
    </>
  );
}

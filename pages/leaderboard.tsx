import React, { useState } from 'react';
import Head from 'next/head';
import Leaderboard from '../components/Leaderboard';
import Layout from '../components/Layout';

export default function LeaderboardPage() {
  const [type, setType] = useState<'creative' | 'activity' | 'influence'>('creative');

  return (
    <>
      <Head>
        <title>排行榜 - QCNOTE</title>
        <meta
          name="description"
          content="探索QCNOTE社区排行榜，发现最有创意的笔记作者、最活跃的贡献者和最具影响力的用户。加入排行榜，提升你的笔记影响力。"
        />
      </Head>
      <Layout>
        <div className="py-8">
          <div className="card mb-8">
            <div className="max-w-2xl mx-auto flex gap-4">
              {(['creative', 'activity', 'influence'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-6 py-2 rounded-lg font-medium transition ${
                    type === t
                      ? 'bg-accent-pink text-white'
                      : 'bg-primary-light text-primary-dark hover:bg-primary-medium dark:bg-dark-surface-light dark:text-dark-text dark:hover:bg-dark-surface'
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
      </Layout>
    </>
  );
}

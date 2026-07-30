import Head from 'next/head';
import Leaderboard from '../components/Leaderboard';
import Layout from '../components/Layout';

export default function LeaderboardPage() {
  return (
    <>
      <Head>
        <title>叠界排行榜 - QCNOTE</title>
        <meta name="description" content="查看今日叠界迷宫排行榜，展示当天最佳通关记录。" />
      </Head>
      <Layout>
        <div className="py-8">
          <Leaderboard />
        </div>
      </Layout>
    </>
  );
}

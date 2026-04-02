import React from 'react';
import { Stats } from '../lib/storage';

interface NoteStatsProps {
  stats: Stats;
  categories: string[];
}

const NoteStats: React.FC<NoteStatsProps> = ({ stats, categories }) => {
  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      '生活': '🏠',
      '工作': '💼',
      '学习': '📚',
      '灵感': '💡',
      '其他': '📝'
    };
    return icons[category] || icons['其他'];
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      '生活': 'from-blue-400 to-blue-600',
      '工作': 'from-green-400 to-green-600',
      '学习': 'from-purple-400 to-purple-600',
      '灵感': 'from-pink-400 to-pink-600',
      '其他': 'from-gray-400 to-gray-600'
    };
    return colors[category] || colors['其他'];
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Total Notes */}
      <div className="card text-center">
        <div className="text-3xl mb-2">📝</div>
        <div className="text-2xl font-bold text-primary-dark">{stats.totalNotes}</div>
        <div className="text-sm text-gray-600">总笔记数</div>
      </div>

      {/* Favorite Notes */}
      <div className="card text-center">
        <div className="text-3xl mb-2">⭐</div>
        <div className="text-2xl font-bold text-yellow-600">{stats.favoriteNotes}</div>
        <div className="text-sm text-gray-600">收藏笔记</div>
      </div>

      {/* Today's Notes */}
      <div className="card text-center">
        <div className="text-3xl mb-2">📅</div>
        <div className="text-2xl font-bold text-green-600">{stats.createdToday}</div>
        <div className="text-sm text-gray-600">今日创建</div>
      </div>

      {/* Categories */}
      <div className="card text-center">
        <div className="text-3xl mb-2">📂</div>
        <div className="text-2xl font-bold text-purple-600">{categories.length}</div>
        <div className="text-sm text-gray-600">分类数量</div>
      </div>
    </div>
  );
};

export default NoteStats;
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
      <div className="card text-center group hover:scale-105 transition-all">
        <div className="w-12 h-12 bg-gradient-to-br from-accent-pink to-accent-purple rounded-full flex items-center justify-center mx-auto mb-3 shadow-medium">
          <span className="text-xl">📝</span>
        </div>
        <div className="text-2xl font-bold text-primary-dark mb-1">{stats.totalNotes}</div>
        <div className="text-sm text-gray-600 mb-2">总笔记数</div>
        <div className="flex items-center justify-center gap-1 text-xs text-green-600">
          <span>+5</span>
          <span>本周</span>
        </div>
        <div className="mt-2 h-1 bg-gradient-to-r from-accent-pink to-accent-purple rounded-full opacity-60"></div>
      </div>

      {/* Favorite Notes */}
      <div className="card text-center group hover:scale-105 transition-all">
        <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-medium">
          <span className="text-xl">⭐</span>
        </div>
        <div className="text-2xl font-bold text-yellow-600 mb-1">{stats.favoriteNotes}</div>
        <div className="text-sm text-gray-600 mb-2">收藏笔记</div>
        <div className="flex items-center justify-center gap-1 text-xs text-yellow-600">
          <span>+2</span>
          <span>本周</span>
        </div>
        <div className="mt-2 h-1 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full opacity-60"></div>
      </div>

      {/* Today's Notes */}
      <div className="card text-center group hover:scale-105 transition-all">
        <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-medium">
          <span className="text-xl">📅</span>
        </div>
        <div className="text-2xl font-bold text-green-600 mb-1">{stats.createdToday}</div>
        <div className="text-sm text-gray-600 mb-2">今日创建</div>
        <div className="flex items-center justify-center gap-1 text-xs text-green-600">
          <span>活跃</span>
        </div>
        <div className="mt-2 h-1 bg-gradient-to-r from-green-400 to-green-600 rounded-full opacity-60"></div>
      </div>

      {/* Categories */}
      <div className="card text-center group hover:scale-105 transition-all">
        <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-medium">
          <span className="text-xl">📂</span>
        </div>
        <div className="text-2xl font-bold text-purple-600 mb-1">{categories.length}</div>
        <div className="text-sm text-gray-600 mb-2">分类数量</div>
        <div className="flex items-center justify-center gap-1 text-xs text-purple-600">
          <span>组织</span>
        </div>
        <div className="mt-2 h-1 bg-gradient-to-r from-purple-400 to-purple-600 rounded-full opacity-60"></div>
      </div>
    </div>
  );
};

export default NoteStats;
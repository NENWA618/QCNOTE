import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import type { CommunityNote, RecommendationItem } from '../types/ugc-types';

type SessionUserWithId = {
  id?: string;
};

const CommunityHub: React.FC = () => {
  const { data: session } = useSession();
  const userId = (session?.user as SessionUserWithId | undefined)?.id;
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [notes, setNotes] = useState<Record<string, CommunityNote>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'recommended' | 'trending' | 'following'>('recommended');

  useEffect(() => {
    if (userId) {
      fetchRecommendations();
    }
  }, [userId, filter]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/ugc/recommendations/${userId}?limit=20`);

      if (response.data.success) {
        setRecommendations(response.data.recommendations);

        // 预加载笔记
        for (const rec of response.data.recommendations) {
          if (rec.type === 'note' && !notes[rec.itemId]) {
            try {
              const noteRes = await axios.get(`/api/ugc/community/note/${rec.itemId}`);
              if (noteRes.data.success) {
                setNotes((prev) => ({ ...prev, [rec.itemId]: noteRes.data.note }));
              }
            } catch (error) {
              console.error('Failed to fetch note:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (communityId: string) => {
    try {
      const response = await axios.post(`/api/ugc/community/like/${communityId}`, {
        userId,
      });

      if (response.data.success) {
        // 更新笔记的点赞数
        setNotes((prev) => ({
          ...prev,
          [communityId]: {
            ...prev[communityId],
            likes: response.data.likes,
          },
        }));
      }
    } catch (error) {
      console.error('Failed to like note:', error);
    }
  };

  const handleShare = (communityId: string) => {
    const url = `${window.location.origin}/community/${communityId}`;
    navigator.clipboard.writeText(url);
    alert('分享链接已复制!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">🌍 创意社区</h1>
          <p className="text-gray-400">发现、分享、创意不断</p>
        </div>

        {/* 筛选按钮 */}
        <div className="flex gap-4 mb-8">
          {(['recommended', 'trending', 'following'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-6 py-2 rounded-lg font-medium transition ${
                filter === f
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {f === 'recommended' && '🎯 为你推荐'}
              {f === 'trending' && '🔥 热门'}
              {f === 'following' && '⭐ 关注'}
            </button>
          ))}
        </div>

        {/* 社区卡片列表 */}
        <div className="space-y-6">
          {recommendations.map((rec) => {
            const note = notes[rec.itemId];
            if (!note) return null;

            return (
              <div
                key={rec.itemId}
                className="bg-gray-800 rounded-lg overflow-hidden hover:shadow-xl transition transform hover:scale-105 cursor-pointer"
              >
                {/* 卡片内容 */}
                <div className="p-6">
                  {/* 作者信息 */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${note.username}`}
                        alt={note.username}
                        className="w-10 h-10 rounded-full"
                      />
                      <div>
                        <p className="text-white font-medium">{note.username}</p>
                        <p className="text-gray-400 text-sm">
                          {new Date(note.publishedAt).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-cyan-400 font-medium">{rec.score.toFixed(0)} 分</p>
                      <p className="text-gray-400 text-xs">{rec.reason}</p>
                    </div>
                  </div>

                  {/* 内容 */}
                  <h2 className="text-2xl font-bold text-white mb-2">{note.title}</h2>
                  <p className="text-gray-300 mb-4 line-clamp-3">{note.preview}</p>

                  {/* 分类标签 */}
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <span className="bg-gray-700 text-gray-200 px-3 py-1 rounded-full text-sm">
                      {note.category}
                    </span>
                    {note.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="bg-gray-700 text-gray-200 px-3 py-1 rounded-full text-sm">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {/* 互动按钮 */}
                  <div className="flex gap-4 pt-4 border-t border-gray-700">
                    <button
                      onClick={() => handleLike(note.communityId)}
                      className="flex items-center gap-2 text-gray-400 hover:text-red-500 transition flex-1"
                    >
                      <span>❤️</span>
                      <span>{note.likes}</span>
                    </button>

                    <button className="flex items-center gap-2 text-gray-400 hover:text-blue-500 transition flex-1">
                      <span>💬</span>
                      <span>{note.comments}</span>
                    </button>

                    <button
                      onClick={() => handleShare(note.communityId)}
                      className="flex items-center gap-2 text-gray-400 hover:text-green-500 transition flex-1"
                    >
                      <span>🔗</span>
                      <span>{note.shares}</span>
                    </button>

                    <button className="flex items-center gap-2 text-gray-400 hover:text-cyan-500 transition flex-1">
                      <span>👁️</span>
                      <span>{note.views}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {recommendations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">暂无内容，快去分享你的创意吧！</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunityHub;

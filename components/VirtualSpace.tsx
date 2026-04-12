import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import type { UserSpace, Decoration } from '../types/ugc-types';

type SessionUserWithId = {
  id?: string;
};

interface VirtualSpaceProps {
  userId: string;
}

const VirtualSpace: React.FC<VirtualSpaceProps> = ({ userId }) => {
  const { data: session } = useSession();
  const sessionUserId = (session?.user as SessionUserWithId | undefined)?.id;
  const [space, setSpace] = useState<UserSpace | null>(null);
  const [theme, setTheme] = useState<string>('minimalist');
  const [decorations, setDecorations] = useState<Decoration[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetchUserSpace();
  }, [userId]);

  const fetchUserSpace = async () => {
    try {
      const response = await axios.get(`/api/ugc/space/${userId}`);
      if (response.data.success) {
        setSpace(response.data.space);
        setTheme(response.data.space.theme);
        setDecorations(response.data.space.decorations);
      }
    } catch (error) {
      console.error('Failed to fetch user space:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleThemeChange = async (newTheme: string) => {
    try {
      const response = await axios.put(`/api/ugc/space/${userId}`, {
        theme: newTheme,
      });

      if (response.data.success) {
        setTheme(newTheme);
        setSpace(response.data.space);
      }
    } catch (error) {
      console.error('Failed to update theme:', error);
    }
  };

  const handleAddDecoration = async (decoration: Decoration) => {
    try {
      await axios.post(`/api/ugc/space/${userId}/decoration`, decoration);
      setDecorations([...decorations, decoration]);
    } catch (error) {
      console.error('Failed to add decoration:', error);
    }
  };

  if (loading) return <div className="p-8 text-center">加载中...</div>;

  const themeStyles = {
    minimalist: 'bg-gray-50 text-gray-900',
    vibrant: 'bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 text-white',
    elegant: 'bg-gradient-to-br from-blue-900 via-blue-700 to-purple-900 text-white',
    gaming: 'bg-gradient-to-br from-indigo-900 via-purple-900 to-black text-cyan-400',
    cyberpunk: 'bg-black text-cyan-400 border-2 border-cyan-500',
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* 虚拟空间主体 */}
        <div
          className={`rounded-lg p-12 mb-8 min-h-96 relative overflow-hidden ${
            themeStyles[theme as keyof typeof themeStyles] || themeStyles.minimalist
          }`}
        >
          <div className="absolute inset-0 opacity-10">
            {/* 背景装饰 */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
          </div>

          <div className="relative z-10">
            <h1 className="text-4xl font-bold mb-4">{space?.spaceName}</h1>
            <p className="text-lg opacity-75">欢迎来到我的创意空间</p>

            {/* 装饰品展示 */}
            <div className="mt-8 grid grid-cols-3 gap-4">
              {decorations.slice(0, 9).map((decoration) => (
                <div
                  key={decoration.decorId}
                  className="bg-white bg-opacity-10 rounded-lg p-4 text-center hover:bg-opacity-20 transition"
                  style={{
                    width: `${decoration.size.width}px`,
                    height: `${decoration.size.height}px`,
                  }}
                >
                  <img
                    src={decoration.imageUrl}
                    alt={decoration.name}
                    className="w-full h-full object-contain"
                  />
                  <p className="text-sm mt-2">{decoration.name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 控制面板 */}
        {sessionUserId === userId && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-white mb-6">
              {editing ? '编辑虚拟空间' : '虚拟空间设置'}
            </h2>

            {/* 主题选择 */}
            <div className="mb-6">
              <label className="block text-white mb-3">选择主题:</label>
              <div className="grid grid-cols-5 gap-2">
                {['minimalist', 'vibrant', 'elegant', 'gaming', 'cyberpunk'].map((t) => (
                  <button
                    key={t}
                    onClick={() => handleThemeChange(t)}
                    className={`px-4 py-2 rounded text-white font-medium transition ${
                      theme === t ? 'bg-cyan-500' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    {t === 'minimalist' && '极简'}
                    {t === 'vibrant' && '炫彩'}
                    {t === 'elegant' && '优雅'}
                    {t === 'gaming' && '游戏'}
                    {t === 'cyberpunk' && '赛博'}
                  </button>
                ))}
              </div>
            </div>

            {/* 装饰品建议 */}
            <div>
              <label className="block text-white mb-3">推荐的装饰品:</label>
              <div className="grid grid-cols-3 gap-4">
                {/* 这里可以添加推荐的装饰品 */}
                <button className="bg-gray-700 hover:bg-gray-600 text-white p-4 rounded transition">
                  + 浏览装饰品
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VirtualSpace;

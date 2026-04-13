import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { ForumPost, ForumReply } from '../types/ugc-types';

interface ForumPostDetailProps {
  post: ForumPost;
  replies: ForumReply[];
  totalReplies: number;
}

export default function ForumPostDetail({ post, replies, totalReplies }: ForumPostDetailProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [newReply, setNewReply] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [likes, setLikes] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    // 增加浏览数
    fetch(`/api/forum/posts/${post.id}/view`, { method: 'POST' });
  }, [post.id]);

  const handleLike = async (targetId: string, isReply = false) => {
    if (!session?.user) {
      alert('请先登录');
      return;
    }

    try {
      const response = await fetch('/api/forum/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isReply ? { replyId: targetId } : { postId: targetId })
      });

      const data = await response.json();
      if (data.success) {
        setLikes(prev => ({ ...prev, [targetId]: data.liked }));
        // 重新加载页面数据
        router.reload();
      }
    } catch (error) {
      console.error('Like error:', error);
    }
  };

  const handleReply = async (parentReplyId?: string | null) => {
    if (!session?.user) {
      alert('请先登录');
      return;
    }

    if (!newReply.trim()) {
      alert('回复内容不能为空');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/forum/replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          content: newReply,
          parentReplyId
        })
      });

      const data = await response.json();
      if (data.success) {
        setNewReply('');
        setReplyingTo(null);
        router.reload();
      } else {
        alert(data.error || '回复失败');
      }
    } catch (error) {
      console.error('Reply error:', error);
      alert('回复失败');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string | number) => {
    return new Date(date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderReplies = (parentId?: string, level = 0): React.ReactElement[] => {
    return replies
      .filter(reply => reply.parentReplyId === parentId)
      .map(reply => (
        <div key={reply.id} className={`border-l-2 border-gray-200 dark:border-gray-700 pl-4 ${level > 0 ? 'ml-4' : ''}`}>
          <div className="flex items-start space-x-3 py-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center overflow-hidden">
                {reply.authorAvatar ? (
                  <Image
                    src={reply.authorAvatar}
                    alt={reply.authorName}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <span className="text-gray-600 dark:text-gray-300 text-sm font-medium">
                    {reply.authorName?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900 dark:text-white">{reply.authorName}</span>
                <span className="text-sm text-gray-500">{formatDate(reply.createdAt)}</span>
              </div>
              <p className="mt-1 text-gray-700 dark:text-gray-300">{reply.content}</p>
              <div className="mt-2 flex items-center space-x-4">
                <button
                  onClick={() => handleLike(reply.id, true)}
                  className={`flex items-center space-x-1 text-sm ${
                    likes[reply.id] ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'
                  }`}
                >
                  <span>👍</span>
                  <span>{reply.likeCount}</span>
                </button>
                {level < 2 && (
                  <button
                    onClick={() => setReplyingTo(reply.id)}
                    className="text-sm text-gray-500 hover:text-blue-600"
                  >
                    回复
                  </button>
                )}
              </div>
              {replyingTo === reply.id && (
                <div className="mt-3">
                  <textarea
                    value={newReply}
                    onChange={(e) => setNewReply(e.target.value)}
                    placeholder="写下你的回复..."
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-slate-50 dark:bg-dark-surface text-gray-900 dark:text-white"
                    rows={3}
                  />
                  <div className="mt-2 flex space-x-2">
                    <button
                      onClick={() => handleReply(reply.id)}
                      disabled={loading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? '提交中...' : '回复'}
                    </button>
                    <button
                      onClick={() => {
                        setReplyingTo(null);
                        setNewReply('');
                      }}
                      className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {renderReplies(reply.id, level + 1)}
        </div>
      ));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 dark:bg-dark-bg">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 帖子内容 */}
        <div className="bg-slate-50/80 dark:bg-dark-surface rounded-lg shadow-sm p-6 mb-8 border border-primary-light/30 dark:border-dark-border">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center overflow-hidden">
                {post.authorAvatar ? (
                  <Image
                    src={post.authorAvatar}
                    alt={post.authorName}
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <span className="text-gray-600 dark:text-gray-300 font-medium">
                    {post.authorName?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{post.title}</h1>
              <div className="flex items-center space-x-4 text-sm text-gray-500 mb-4">
                <span>{post.authorName}</span>
                <span>{formatDate(post.createdAt)}</span>
                <span>👁 {post.viewCount}</span>
                <span>👍 {post.likeCount}</span>
                <span>💬 {post.replyCount}</span>
              </div>
              <div className="prose dark:prose-invert max-w-none">
                {post.content.split('\n').map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
              {post.tags && post.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {post.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center space-x-4">
                <button
                  onClick={() => handleLike(post.id)}
                  className={`flex items-center space-x-1 text-sm ${
                    likes[post.id] ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'
                  }`}
                >
                  <span>👍</span>
                  <span>{post.likeCount}</span>
                </button>
                <button
                  onClick={() => setReplyingTo('main')}
                  className="text-sm text-gray-500 hover:text-blue-600"
                >
                  回复帖子
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 回复列表 */}
        <div className="bg-slate-50/80 dark:bg-dark-surface rounded-lg shadow-sm p-6 mb-8 border border-primary-light/30 dark:border-dark-border">
          <h2 className="text-lg font-semibold text-primary-dark dark:text-dark-text mb-4">
            回复 ({totalReplies})
          </h2>

          {replies.length === 0 ? (
            <p className="text-gray-500 text-center py-8">暂无回复</p>
          ) : (
            <div className="space-y-4">
              {renderReplies()}
            </div>
          )}
        </div>

        {/* 发表回复 */}
        {session?.user && (
          <div className="bg-slate-50/80 dark:bg-dark-surface rounded-lg shadow-sm p-6 border border-primary-light/30 dark:border-dark-border">
            <h3 className="text-lg font-semibold text-primary-dark dark:text-dark-text mb-4">
              {replyingTo === 'main' ? '回复帖子' : '发表回复'}
            </h3>
            <textarea
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              placeholder="写下你的回复..."
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-slate-50 dark:bg-dark-surface text-gray-900 dark:text-white"
              rows={4}
            />
            <div className="mt-3 flex space-x-2">
              <button
                onClick={() => handleReply(replyingTo === 'main' ? undefined : replyingTo)}
                disabled={loading || !newReply.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '提交中...' : '发表回复'}
              </button>
              {replyingTo && (
                <button
                  onClick={() => {
                    setReplyingTo(null);
                    setNewReply('');
                  }}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  取消
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { ForumPost, ForumReply } from '../types/ugc-types';
import { withApiBaseUrl } from '../lib/api-client';

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
    fetch(withApiBaseUrl(`/api/forum/posts/${post.id}/view`), { method: 'POST' });
  }, [post.id]);

  const handleLike = async (targetId: string, isReply = false) => {
    if (!session?.user) {
      alert('请先登录');
      return;
    }

    try {
      const response = await fetch(withApiBaseUrl('/api/forum/likes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isReply ? { replyId: targetId } : { postId: targetId }),
      });

      const data = await response.json();
      if (data.success) {
        setLikes((prev) => ({ ...prev, [targetId]: data.liked }));
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
      const response = await fetch(withApiBaseUrl('/api/forum/replies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: post.id,
          content: newReply,
          parentReplyId,
        }),
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

  const insertQuickReply = (text: string) => {
    setNewReply((prev) => (prev ? `${prev} ${text}` : text));
  };

  const formatDate = (date: string | number) => {
    return new Date(date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const currentReplyTarget =
    replyingTo && replyingTo !== 'main' ? replies.find((reply) => reply.id === replyingTo) : null;

  const renderReplies = (): React.ReactElement[] => {
    const sortedReplies = [...replies].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return sortedReplies.map((reply, index) => {
      const alignClass = index % 2 === 0 ? 'justify-start' : 'justify-end';
      const bubbleClass =
        index % 2 === 0
          ? 'bg-slate-100 text-slate-900 dark:bg-gray-800 dark:text-gray-100'
          : 'bg-blue-50 text-slate-900 dark:bg-blue-900 dark:text-blue-100';

      return (
        <div key={reply.id} className={`flex ${alignClass}`}>
          <div
            className={`max-w-[85%] rounded-[2rem] border border-slate-200 px-5 py-4 shadow-sm ${bubbleClass} dark:border-gray-700`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xs font-semibold text-blue-700 dark:text-blue-100">
                  {reply.authorName?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold">{reply.authorName}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    {formatDate(reply.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReplyingTo(reply.id)}
                className="rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:border-blue-300 hover:text-blue-700 dark:border-gray-600 dark:bg-gray-900/80 dark:text-gray-200"
              >
                回复
              </button>
            </div>
            <p className="mt-4 text-sm leading-6">{reply.content}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-gray-400">
              <span>👍 {reply.likeCount}</span>
              <span>回复 {replies.filter((item) => item.parentReplyId === reply.id).length}</span>
            </div>
            {replyingTo === reply.id && (
              <div className="mt-4 space-y-3">
                <textarea
                  value={newReply}
                  onChange={(e) => setNewReply(e.target.value)}
                  placeholder="写下你的回复..."
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-blue-500"
                  rows={3}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleReply(reply.id)}
                    disabled={loading || !newReply.trim()}
                    className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? '提交中...' : '回复'}
                  </button>
                  <button
                    onClick={() => {
                      setReplyingTo(null);
                      setNewReply('');
                    }}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="pb-36">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 帖子内容 */}
        <div className="mb-8">
          <div className="rounded-[2rem] border border-slate-200 bg-slate-100 p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 rounded-full bg-blue-200 dark:bg-blue-900 flex items-center justify-center text-xl font-bold text-blue-700 dark:text-blue-100">
                  {post.authorName?.charAt(0).toUpperCase()}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500 dark:text-gray-400">
                      {post.authorName}
                    </p>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                      {post.title}
                    </h1>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {formatDate(post.createdAt)}
                  </div>
                </div>
                <div className="mt-5 rounded-[2rem] border border-slate-200 bg-white px-5 py-5 text-sm leading-7 text-slate-800 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
                  {post.content.split('\n').map((line, index) => (
                    <p key={index} className="mb-3 last:mb-0">
                      {line}
                    </p>
                  ))}
                </div>
                {post.tags && post.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {post.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-gray-400">
                  <button
                    onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 ${likes[post.id] ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-blue-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-blue-900/60'}`}
                  >
                    <span>👍</span>
                    <span>{post.likeCount}</span>
                  </button>
                  <button
                    onClick={() => setReplyingTo('main')}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    回复帖子
                  </button>
                  <span className="text-xs">👁 {post.viewCount}</span>
                  <span className="text-xs">💬 {post.replyCount}</span>
                </div>
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
            <div className="space-y-4">{renderReplies()}</div>
          )}
        </div>

        {/* 发表回复 */}
      </div>

      {session?.user && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200/80 bg-slate-100/95 px-4 py-4 shadow-[0_-18px_50px_-32px_rgba(15,23,42,0.35)] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-950/95">
          <div className="mx-auto flex max-w-4xl flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                聊天式回复
              </span>
              <span>
                {replyingTo === 'main'
                  ? '正在回复本帖'
                  : currentReplyTarget
                    ? `回复 ${currentReplyTarget.authorName}`
                    : '输入你的消息'}
              </span>
            </div>
            <div className="relative flex items-end gap-3">
              <div className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <button
                      type="button"
                      title="表情"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-base hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                      onClick={() => insertQuickReply('😊')}
                    >
                      😊
                    </button>
                    <button
                      type="button"
                      title="附件"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-base hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                      onClick={() => insertQuickReply('📎 附件请查看')}
                    >
                      📎
                    </button>
                    <button
                      type="button"
                      title="快捷回复"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-base hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                      onClick={() => insertQuickReply('感谢分享！我也想了解更多。')}
                    >
                      ⚡
                    </button>
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    你可以插入表情、附件提示或快捷内容
                  </div>
                </div>
                <textarea
                  value={newReply}
                  onChange={(e) => setNewReply(e.target.value)}
                  placeholder="写下你的回复..."
                  className="min-h-[90px] w-full resize-none rounded-[1.75rem] border border-slate-200 bg-transparent px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-0 dark:border-slate-700 dark:text-slate-100"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => insertQuickReply('赞一个，受益匪浅！')}
                    className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-blue-900/60"
                  >
                    赞一个
                  </button>
                  <button
                    type="button"
                    onClick={() => insertQuickReply('这个话题很有意思，想继续讨论。')}
                    className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-blue-900/60"
                  >
                    继续讨论
                  </button>
                  <button
                    type="button"
                    onClick={() => insertQuickReply('我也有类似经验，稍后补充。')}
                    className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-blue-900/60"
                  >
                    稍后补充
                  </button>
                </div>
                <div className="pointer-events-none absolute bottom-4 left-5 text-xs text-slate-400 dark:text-slate-500">
                  按“发送”提交你的回复
                </div>
              </div>
              <button
                onClick={() => handleReply(replyingTo === 'main' ? undefined : replyingTo)}
                disabled={loading || !newReply.trim()}
                className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? '提交中...' : '发送'}
              </button>
            </div>
            {replyingTo && (
              <div className="flex items-center justify-end">
                <button
                  onClick={() => {
                    setReplyingTo(null);
                    setNewReply('');
                  }}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  取消回复
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

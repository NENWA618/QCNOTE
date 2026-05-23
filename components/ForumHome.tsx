import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { withApiBaseUrl } from '../lib/api-client';
import Link from 'next/link';
import { ForumPost, ForumCategory, ForumStats } from '../types/ugc-types';

interface ForumHomeProps {
  initialPosts: ForumPost[];
  categories: ForumCategory[];
  stats: ForumStats;
}

interface PostWithRole extends ForumPost {
  authorRole?: string;
}

export default function ForumHome({ initialPosts, categories, stats }: ForumHomeProps) {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<PostWithRole[]>(initialPosts);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [loading, setLoading] = useState(false);

  // 为帖子添加角色信息
  useEffect(() => {
    const loadPostsWithRoles = async () => {
      const postsWithRoles = await Promise.all(
        initialPosts.map(async (post) => {
          try {
            const response = await fetch(
              withApiBaseUrl(`/api/forum/roles?userId=${post.authorId}`),
            );
            const data = await response.json();
            return {
              ...post,
              authorRole: data.success ? data.role : 'user',
              authorId: post.authorId,
            };
          } catch (error) {
            return {
              ...post,
              authorRole: 'user',
              authorId: post.authorId,
            };
          }
        }),
      );
      setPosts(postsWithRoles);
    };

    loadPostsWithRoles();
  }, [initialPosts]);

  const loadPosts = async (
    categoryId?: string,
    search: string = searchQuery,
    sort: string = sortBy,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryId) params.set('category', categoryId);
      if (search) params.set('q', search);
      params.set('sort', sort);

      const response = await fetch(withApiBaseUrl(`/api/forum/posts?${params}`));
      const data = await response.json();

      if (data.success) {
        // 为新加载的帖子添加角色信息
        const postsWithRoles = await Promise.all(
          data.posts.map(async (post: ForumPost) => {
            try {
              const roleResponse = await fetch(
                withApiBaseUrl(`/api/forum/roles?userId=${post.authorId}`),
              );
              const roleData = await roleResponse.json();
              return {
                ...post,
                authorRole: roleData.success ? roleData.role : 'user',
                authorId: post.authorId,
              };
            } catch (error) {
              return {
                ...post,
                authorRole: 'user',
                authorId: post.authorId,
              };
            }
          }),
        );
        setPosts(postsWithRoles);
      }
    } catch (error) {
      console.error('Failed to load posts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    loadPosts(categoryId || undefined);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    // Debounce search - would be better with a useEffect and timer
    loadPosts(selectedCategory, query, sortBy);
  };

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    loadPosts(selectedCategory, searchQuery, newSort);
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

  return (
    <div className="space-y-10">
      <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-2xl backdrop-blur-sm dark:border-slate-700 dark:bg-slate-950/80">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-600">
              社区论坛
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
              在 QCNOTE 里发起讨论，分享你的知识与灵感
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
              发现最新话题、关注热门讨论，并通过社区对话获取更多笔记灵感。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/forum-create"
              className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/10 transition hover:bg-blue-700"
            >
              发起新话题
            </Link>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {stats.totalPosts} 帖子 · {stats.totalReplies} 回复 · {stats.totalUsers} 用户
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              帖子
            </p>
            <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
              {stats.totalPosts}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              回复
            </p>
            <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
              {stats.totalReplies}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              用户
            </p>
            <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
              {stats.totalUsers}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              分类
            </p>
            <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
              {stats.totalCategories ?? categories.length}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 space-y-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-xl backdrop-blur-sm dark:border-slate-700 dark:bg-slate-950/85">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1">
              <input
                type="text"
                placeholder="搜索帖子、标签或作者"
                value={searchQuery}
                onChange={handleSearch}
                className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                排序：
                <select
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="ml-2 bg-transparent text-sm outline-none"
                >
                  <option value="newest">最新</option>
                  <option value="hottest">热门</option>
                  <option value="trending">趋势</option>
                </select>
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                当前分类：
                {selectedCategory
                  ? (categories.find(
                      (item) =>
                        item.id === selectedCategory || item.categoryId === selectedCategory,
                    )?.name ?? '自定义')
                  : '全部'}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleCategoryChange('')}
              className={`rounded-full border px-3 py-2 text-sm transition ${selectedCategory === '' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-blue-300'}`}
            >
              全部
            </button>
            {categories.map((category) => {
              const categoryId = category.id || category.categoryId || '';
              return (
                <button
                  key={categoryId || category.name}
                  type="button"
                  onClick={() => handleCategoryChange(categoryId)}
                  className={`rounded-full border px-3 py-2 text-sm transition ${selectedCategory === categoryId ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-blue-300'}`}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-10 text-center shadow-xl dark:border-slate-700 dark:bg-slate-950/85">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">正在加载帖子...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-10 text-center shadow-xl dark:border-slate-700 dark:bg-slate-950/85">
            <p className="text-lg font-semibold text-slate-900 dark:text-white">暂无匹配帖子</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              试试更宽泛的关键词或切换分类。
            </p>
            {session?.user && (
              <Link
                href="/forum-create"
                className="mt-5 inline-flex rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
              >
                发起新话题
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-5">
            {posts.map((post) => (
              <article
                key={post.id}
                className="group relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-50/95 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-slate-700 dark:bg-slate-950/90"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 via-fuchsia-400 to-purple-500 opacity-80" />
                <div className="relative space-y-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <Link href={`/forum/post/${post.id}`}>
                        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white transition-colors hover:text-blue-600 dark:hover:text-blue-300">
                          {post.title}
                        </h2>
                      </Link>
                      <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                        {post.content.length > 180
                          ? `${post.content.substring(0, 180)}...`
                          : post.content}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {post.tags?.map((tag, index) => (
                          <span
                            key={index}
                            className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 text-slate-500 dark:text-slate-400">
                      <div className="rounded-[1.75rem] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                          发布时间
                        </p>
                        <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                          {formatDate(post.createdAt)}
                        </p>
                      </div>
                      <div className="rounded-[1.75rem] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                          作者
                        </p>
                        <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                          {post.authorName}
                        </p>
                      </div>
                      <div className="rounded-[1.75rem] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                          身份
                        </p>
                        <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                          {post.authorRole === 'admin'
                            ? '管理员'
                            : post.authorRole === 'moderator'
                              ? '版主'
                              : '用户'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        💬 {post.replyCount}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        👁 {post.viewCount}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        👍 {post.likeCount}
                      </span>
                    </div>
                    <Link
                      href={`/forum/post/${post.id}`}
                      className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700"
                    >
                      查看详情
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

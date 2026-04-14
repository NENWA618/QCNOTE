import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
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
            const response = await fetch(withApiBaseUrl(`/api/forum/roles?userId=${post.authorId}`));
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
        })
      );
      setPosts(postsWithRoles);
    };

    loadPostsWithRoles();
  }, [initialPosts]);

  const loadPosts = async (categoryId?: string, search: string = searchQuery, sort: string = sortBy) => {
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
              const roleResponse = await fetch(withApiBaseUrl(`/api/forum/roles?userId=${post.authorId}`));
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
          })
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
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 dark:bg-dark-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 头部统计信息 */}
        <div className="bg-slate-50/80 dark:bg-dark-surface rounded-lg shadow-sm p-6 mb-8 border border-primary-light/30 dark:border-dark-border">
          <h1 className="text-3xl font-bold text-primary-dark dark:text-dark-text mb-4">社区论坛</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalPosts}</div>
              <div className="text-sm text-gray-500">帖子</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.totalReplies}</div>
              <div className="text-sm text-gray-500">回复</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.totalUsers}</div>
              <div className="text-sm text-gray-500">用户</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.totalCategories ?? stats.topCategories?.length ?? 0}</div>
              <div className="text-sm text-gray-500">分类</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* 侧边栏 - 分类 */}
          <div className="lg:col-span-1">
            <div className="card bg-slate-50/80 dark:bg-dark-surface dark:border-dark-border border border-primary-light/30">
              <h2 className="text-lg font-semibold text-primary-dark dark:text-dark-text mb-4">分类</h2>
              <div className="space-y-2">
                <button
                  onClick={() => handleCategoryChange('')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedCategory === ''
                      ? 'bg-accent-pink text-white'
                      : 'text-primary-dark hover:bg-primary-light dark:text-dark-text dark:hover:bg-dark-surface-light'
                  }`}
                >
                  全部帖子
                </button>
                {categories.map((category) => {
                  const categoryId = category.id || category.categoryId || '';
                  return (
                    <button
                      key={categoryId}
                      onClick={() => handleCategoryChange(categoryId)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        selectedCategory === categoryId
                          ? 'bg-accent-pink text-white'
                          : 'text-primary-dark hover:bg-primary-light dark:text-dark-text dark:hover:bg-dark-surface-light'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{category.name}</span>
                        <span className="text-xs text-text-light dark:text-dark-text-secondary">({category.postCount})</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {session?.user && (
                <div className="mt-6">
                  <Link
                    href="/forum-create"
                    className="w-full btn btn-primary inline-block text-center"
                  >
                    发布新帖
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* 主内容区 - 帖子列表 */}
          <div className="lg:col-span-3">
            {/* 搜索和排序栏 */}
            <div className="bg-slate-50/80 dark:bg-dark-surface rounded-lg shadow-sm p-4 mb-4 border border-primary-light/30 dark:border-dark-border">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="搜索帖子..."
                    value={searchQuery}
                    onChange={handleSearch}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div className="sm:w-40">
                  <select
                    value={sortBy}
                    onChange={(e) => handleSortChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    <option value="newest">最新</option>
                    <option value="hottest">热门</option>
                    <option value="trending">趋势</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-slate-50/80 dark:bg-dark-surface rounded-lg shadow-sm border border-primary-light/30 dark:border-dark-border">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-500">加载中...</p>
                </div>
              ) : posts.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-500">暂无帖子</p>
                  {session?.user && (
                    <Link
                      href="/forum-create"
                      className="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      发布第一个帖子
                    </Link>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {posts.map((post) => (
                    <div key={post.id} className="p-6 bg-slate-50/80 dark:bg-dark-surface rounded-xl transition-colors hover:bg-primary-light/80 dark:hover:bg-dark-surface-light">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center overflow-hidden">
                            {post.authorAvatar ? (
                              <Image
                                src={post.authorAvatar}
                                alt={post.authorName}
                                width={40}
                                height={40}
                                className="w-10 h-10 rounded-full"
                              />
                            ) : (
                              <span className="text-gray-600 dark:text-gray-300 font-medium">
                                {post.authorName?.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link href={`/forum/post/${post.id}`}>
                            <h3 className="text-lg font-medium text-primary-dark dark:text-dark-text hover:text-primary-medium dark:hover:text-accent-pink cursor-pointer">
                              {post.title}
                            </h3>
                          </Link>
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            {post.content.length > 200 ? `${post.content.substring(0, 200)}...` : post.content}
                          </p>
                          <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                            <span className="flex items-center space-x-2">
                              <span>{post.authorName}</span>
                              {post.authorRole && (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  post.authorRole === 'admin'
                                    ? 'bg-red-100 text-red-800'
                                    : post.authorRole === 'moderator'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {post.authorRole === 'admin' ? '管理员' :
                                   post.authorRole === 'moderator' ? '版主' : '用户'}
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-xs">ID: {post.authorId}</span>
                            <span>{formatDate(post.createdAt)}</span>
                            <span>👁 {post.viewCount}</span>
                            <span>👍 {post.likeCount}</span>
                            <span>💬 {post.replyCount}</span>
                          </div>
                          {post.tags && post.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
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
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
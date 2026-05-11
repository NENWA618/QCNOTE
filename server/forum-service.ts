import { RedisClientType } from 'redis';
import { Pool } from 'pg';
import { CacheManager, createCacheManager } from '../lib/cache-manager';
import {
  ForumPost,
  ForumReply,
  UserRole,
  ForumCategory,
  CreatePostRequest,
  CreateReplyRequest,
  UpdatePostRequest,
  ForumStats
} from '../types/ugc-types';

export class ForumService {
  private redis: RedisClientType;
  private postgres: Pool;
  private cache: CacheManager;

  constructor(redis: RedisClientType, postgres: Pool) {
    this.redis = redis;
    this.postgres = postgres;
    this.cache = createCacheManager(redis, { keyPrefix: 'forum:', ttl: 1800 });
  }

  // 用户角色管理
  async getUserRole(userId: string): Promise<UserRole> {
    return this.cache.getOrSet(
      `user_role:${userId}`,
      async () => {
        const result = await this.postgres.query(
          'SELECT role FROM user_roles WHERE user_id = $1',
          [userId]
        );
        return (result.rows[0]?.role || 'user') as UserRole;
      },
      3600 // 1 hour TTL for user roles
    );
  }

  async getUserRoleByEmail(email: string): Promise<UserRole> {
    const result = await this.postgres.query(
      `SELECT u.id, ur.role
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       WHERE LOWER(u.email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    const role = result.rows[0]?.role || 'user';
    const userId = result.rows[0]?.id;
    if (userId) {
      await this.redis.setEx(`user_role:${userId}`, 3600, role);
    }

    return role as UserRole;
  }

  async setUserRole(userId: string, role: UserRole, updatedBy: string): Promise<void> {
    await this.postgres.query(
      `INSERT INTO user_roles (user_id, role, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         role = EXCLUDED.role,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [userId, role, updatedBy]
    );

    // 清除缓存
    await this.redis.del(`user_role:${userId}`);
  }

  // 论坛帖子管理
  async createPost(userId: string, postData: CreatePostRequest): Promise<ForumPost> {
    const result = await this.postgres.query(
      `INSERT INTO forum_posts (title, content, category_id, author_id, tags, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, title, content, category_id, author_id, tags, created_at, updated_at, view_count, like_count, reply_count`,
      [postData.title, postData.content, postData.categoryId, userId, postData.tags || []]
    );

    const post = result.rows[0];

    // 清除相关缓存
    await this.redis.del(`forum_posts:category:${postData.categoryId}`);
    await this.redis.del('forum_posts:recent');

    return {
      id: post.id,
      title: post.title,
      content: post.content,
      categoryId: post.category_id,
      authorId: post.author_id,
      authorName: '',
      tags: post.tags,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      viewCount: post.view_count,
      likeCount: post.like_count,
      replyCount: post.reply_count
    };
  }

  async getPosts(
    categoryId?: string,
    page = 1,
    limit = 20,
    searchQuery = '',
    sortBy = 'newest'
  ): Promise<{ posts: ForumPost[], total: number }> {
    try {
      const offset = (page - 1) * limit;
      let query = `
        SELECT p.id, p.title, p.content, p.category_id, p.author_id, p.tags,
               p.created_at, p.updated_at, p.view_count, p.like_count, p.reply_count,
               u.name as author_name, u.avatar as author_avatar
        FROM forum_posts p
        LEFT JOIN users u ON p.author_id = u.id
        WHERE p.is_deleted = false
      `;
      const params: any[] = [];
      let paramIndex = 1;

      // Filter by category
      if (categoryId) {
        query += ` AND p.category_id = $${paramIndex}`;
        params.push(categoryId);
        paramIndex++;
      }

      // Search by title or content
      if (searchQuery && searchQuery.trim()) {
        query += ` AND (p.title ILIKE $${paramIndex} OR p.content ILIKE $${paramIndex})`;
        params.push(`%${searchQuery}%`);
        paramIndex++;
      }

      // Sort by option
      switch (sortBy.toLowerCase()) {
        case 'hottest':
          query += ' ORDER BY (p.like_count + p.reply_count * 0.5) DESC, p.created_at DESC';
          break;
        case 'trending':
          // Posts from last 7 days, ranked by recent activity
          query += ' AND p.created_at > NOW() - INTERVAL \'7 days\' ORDER BY (p.like_count + p.reply_count) DESC, p.created_at DESC';
          break;
        case 'newest':
        default:
          query += ' ORDER BY p.created_at DESC';
          break;
      }

      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await this.postgres.query(query, params);

      // 获取总数
      let countQuery = 'SELECT COUNT(*) as total FROM forum_posts WHERE is_deleted = false';
      const countParams: any[] = [];
      
      if (categoryId) {
        countQuery += ' AND category_id = $1';
        countParams.push(categoryId);
      }
      
      if (searchQuery && searchQuery.trim()) {
        const paramPlace = categoryId ? '$2' : '$1';
        countQuery += ` AND (title ILIKE ${paramPlace} OR content ILIKE ${paramPlace})`;
        countParams.push(`%${searchQuery}%`);
      }

      // Add trending filter if applicable
      if (sortBy.toLowerCase() === 'trending') {
        countQuery += ' AND created_at > NOW() - INTERVAL \'7 days\'';
      }

      const countResult = await this.postgres.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      const posts = result.rows.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        categoryId: row.category_id,
        authorId: row.author_id,
        authorName: row.author_name,
        authorAvatar: row.author_avatar,
        tags: row.tags,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        viewCount: row.view_count,
        likeCount: row.like_count,
        replyCount: row.reply_count
      }));

      return { posts, total };
    } catch (error) {
      console.warn('Database not available, returning mock forum data:', error);
      // Return mock data for development
      const mockPosts: ForumPost[] = [
        {
          id: 'mock-1',
          title: '欢迎来到 QCNOTE 社区论坛！',
          content: '这是 QCNOTE 的社区论坛，您可以在这里与其他用户交流笔记经验、分享使用技巧和获取帮助。',
          categoryId: 'general',
          authorId: 'mock-user',
          authorName: 'QCNOTE 团队',
          authorAvatar: undefined,
          tags: ['欢迎', '介绍'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          viewCount: 42,
          likeCount: 5,
          replyCount: 3
        },
        {
          id: 'mock-2',
          title: '如何高效使用笔记功能？',
          content: '分享一些笔记使用的小技巧和最佳实践。',
          categoryId: 'tips',
          authorId: 'mock-user-2',
          authorName: '笔记爱好者',
          authorAvatar: undefined,
          tags: ['技巧', '笔记'],
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString(),
          viewCount: 28,
          likeCount: 8,
          replyCount: 5
        }
      ];

      return { posts: mockPosts, total: mockPosts.length };
    }
  }

  async getPost(postId: string): Promise<ForumPost | null> {
    const cacheKey = `forum_post:${postId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const result = await this.postgres.query(
      `SELECT p.id, p.title, p.content, p.category_id, p.author_id, p.tags,
              p.created_at, p.updated_at, p.view_count, p.like_count, p.reply_count,
              u.name as author_name, u.avatar as author_avatar
       FROM forum_posts p
       LEFT JOIN users u ON p.author_id = u.id
       WHERE p.id = $1 AND p.is_deleted = false`,
      [postId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const post = result.rows[0];
    const postData = {
      id: post.id,
      title: post.title,
      content: post.content,
      categoryId: post.category_id,
      authorId: post.author_id,
      authorName: post.author_name,
      authorAvatar: post.author_avatar,
      tags: post.tags,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      viewCount: post.view_count,
      likeCount: post.like_count,
      replyCount: post.reply_count
    };

    // 缓存1小时
    await this.redis.setEx(cacheKey, 3600, JSON.stringify(postData));

    return postData;
  }

  async updatePost(postId: string, userId: string, updateData: UpdatePostRequest): Promise<boolean> {
    const result = await this.postgres.query(
      `UPDATE forum_posts
       SET title = COALESCE($1, title),
           content = COALESCE($2, content),
           tags = COALESCE($3, tags),
           updated_at = NOW()
       WHERE id = $4 AND author_id = $5 AND is_deleted = false`,
      [updateData.title, updateData.content, updateData.tags, postId, userId]
    );

    if (result?.rowCount && result.rowCount > 0) {
      // 清除缓存
      await this.redis.del(`forum_post:${postId}`);
      await this.redis.del('forum_posts:recent');
      return true;
    }

    return false;
  }

  async deletePost(postId: string, userId: string): Promise<boolean> {
    const userRole = await this.getUserRole(userId);

    let query: string;
    let params: any[];

    if (userRole === 'admin' || userRole === 'moderator') {
      // 管理员和版主可以删除任何帖子
      query = 'UPDATE forum_posts SET is_deleted = true, deleted_at = NOW() WHERE id = $1';
      params = [postId];
    } else {
      // 普通用户只能删除自己的帖子
      query = 'UPDATE forum_posts SET is_deleted = true, deleted_at = NOW() WHERE id = $1 AND author_id = $2';
      params = [postId, userId];
    }

    const result = await this.postgres.query(query, params);

    if (result?.rowCount && result.rowCount > 0) {
      // 清除缓存
      await this.redis.del(`forum_post:${postId}`);
      await this.redis.del('forum_posts:recent');
      return true;
    }

    return false;
  }

  async incrementViewCount(postId: string): Promise<void> {
    await this.postgres.query(
      'UPDATE forum_posts SET view_count = view_count + 1 WHERE id = $1',
      [postId]
    );

    // 清除缓存
    await this.redis.del(`forum_post:${postId}`);
  }

  // 回复管理
  async createReply(userId: string, replyData: CreateReplyRequest): Promise<ForumReply> {
    const result = await this.postgres.query(
      `INSERT INTO forum_replies (post_id, content, author_id, parent_reply_id, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, post_id, content, author_id, parent_reply_id, created_at, like_count`,
      [replyData.postId, replyData.content, userId, replyData.parentReplyId]
    );

    const reply = result.rows[0];

    // 更新帖子回复数
    await this.postgres.query(
      'UPDATE forum_posts SET reply_count = reply_count + 1 WHERE id = $1',
      [replyData.postId]
    );

    // 清除缓存
    await this.redis.del(`forum_post:${replyData.postId}`);
    await this.redis.del(`forum_replies:${replyData.postId}`);

    return {
      id: reply.id,
      postId: reply.post_id,
      content: reply.content,
      authorId: reply.author_id,
      authorName: '',
      parentReplyId: reply.parent_reply_id,
      createdAt: reply.created_at,
      likeCount: reply.like_count
    };
  }

  async getReplies(postId: string, page = 1, limit = 20): Promise<{ replies: ForumReply[], total: number }> {
    const cacheKey = `forum_replies:${postId}:${page}:${limit}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const offset = (page - 1) * limit;
    const result = await this.postgres.query(
      `SELECT r.id, r.post_id, r.content, r.author_id, r.parent_reply_id, r.created_at, r.like_count,
              u.name as author_name, u.avatar as author_avatar
       FROM forum_replies r
       LEFT JOIN users u ON r.author_id = u.id
       WHERE r.post_id = $1 AND r.is_deleted = false
       ORDER BY r.created_at ASC
       LIMIT $2 OFFSET $3`,
      [postId, limit, offset]
    );

    const countResult = await this.postgres.query(
      'SELECT COUNT(*) as total FROM forum_replies WHERE post_id = $1 AND is_deleted = false',
      [postId]
    );

    const total = parseInt(countResult.rows[0].total);

    const replies = result.rows.map(row => ({
      id: row.id,
      postId: row.post_id,
      content: row.content,
      authorId: row.author_id,
      authorName: row.author_name,
      authorAvatar: row.author_avatar,
      parentReplyId: row.parent_reply_id,
      createdAt: row.created_at,
      likeCount: row.like_count
    }));

    const data = { replies, total };
    await this.redis.setEx(cacheKey, 1800, JSON.stringify(data)); // 缓存30分钟

    return data;
  }

  // 点赞管理
  async toggleLike(userId: string, postId?: string, replyId?: string): Promise<{ liked: boolean, likeCount: number }> {
    const targetType = postId ? 'post' : 'reply';
    const targetId = postId || replyId;

    if (!targetId) {
      throw new Error('Either postId or replyId must be provided');
    }

    const table = targetType === 'post' ? 'forum_posts' : 'forum_replies';
    const targetColumn = postId ? 'post_id' : 'reply_id';

    // 使用UPSERT来toggle点赞状态，并更新计数
    const result = await this.postgres.query(`
      WITH toggle_like AS (
        INSERT INTO forum_likes (user_id, ${targetColumn}, created_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id, ${targetColumn})
        DO NOTHING
        RETURNING 'inserted' as action
      ),
      delete_like AS (
        DELETE FROM forum_likes
        WHERE user_id = $1 AND ${targetColumn} = $2
        AND NOT EXISTS (SELECT 1 FROM toggle_like)
        RETURNING 'deleted' as action
      ),
      update_count AS (
        UPDATE ${table}
        SET like_count = CASE
          WHEN EXISTS (SELECT 1 FROM toggle_like) THEN like_count + 1
          WHEN EXISTS (SELECT 1 FROM delete_like) THEN GREATEST(like_count - 1, 0)
          ELSE like_count
        END
        WHERE id = $2
        RETURNING like_count
      )
      SELECT
        CASE
          WHEN EXISTS (SELECT 1 FROM toggle_like) THEN true
          WHEN EXISTS (SELECT 1 FROM delete_like) THEN false
          ELSE EXISTS (SELECT 1 FROM forum_likes WHERE user_id = $1 AND ${targetColumn} = $2)
        END as liked,
        (SELECT like_count FROM update_count) as like_count
    `, [userId, targetId]);

    const { liked, like_count } = result.rows[0];

    // 清除相关缓存
    if (postId) {
      await this.redis.del(`forum_post:${postId}`);
    } else if (replyId) {
      await this.redis.del(`forum_replies:${replyId}`);
    }

    return { liked: Boolean(liked), likeCount: Number(like_count) };
  }

  // 分类管理
  async getCategories(): Promise<ForumCategory[]> {
    try {
      const cacheKey = 'forum_categories';
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const result = await this.postgres.query(
        'SELECT id, name, description, icon, post_count, created_at FROM forum_categories ORDER BY name'
      );

      const categories = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        postCount: row.post_count,
        createdAt: row.created_at
      }));

      await this.redis.setEx(cacheKey, 3600, JSON.stringify(categories)); // 缓存1小时

      return categories;
    } catch (error) {
      console.warn('Database not available, returning mock forum categories:', error);
      // Return mock categories for development
      const mockCategories: ForumCategory[] = [
        {
          id: 'general',
          name: '综合讨论',
          description: '关于 QCNOTE 的综合讨论',
          icon: '💬',
          postCount: 2,
          createdAt: new Date().toISOString()
        },
        {
          id: 'tips',
          name: '使用技巧',
          description: '分享笔记使用技巧和最佳实践',
          icon: '💡',
          postCount: 1,
          createdAt: new Date().toISOString()
        },
        {
          id: 'help',
          name: '帮助支持',
          description: '寻求帮助和技术支持',
          icon: '🆘',
          postCount: 0,
          createdAt: new Date().toISOString()
        }
      ];

      return mockCategories;
    }
  }

  async createCategory(name: string, description: string, icon?: string): Promise<ForumCategory> {
    const result = await this.postgres.query(
      'INSERT INTO forum_categories (name, description, icon, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, name, description, icon, post_count, created_at',
      [name, description, icon]
    );

    const category = result.rows[0];

    // 清除缓存
    await this.redis.del('forum_categories');

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      icon: category.icon,
      postCount: category.post_count,
      createdAt: category.created_at
    };
  }

  // 统计信息
  async getForumStats(): Promise<ForumStats> {
    try {
      return this.cache.getOrSet(
        'forum_stats',
        async () => {
          const [postsResult, repliesResult, usersResult, categoriesResult] = await Promise.all([
            this.postgres.query('SELECT COUNT(*) as count FROM forum_posts WHERE is_deleted = false'),
            this.postgres.query('SELECT COUNT(*) as count FROM forum_replies WHERE is_deleted = false'),
            this.postgres.query('SELECT COUNT(DISTINCT author_id) as count FROM forum_posts WHERE is_deleted = false'),
            this.postgres.query('SELECT COUNT(*) as count FROM forum_categories')
          ]);

          return {
            totalPosts: parseInt(postsResult.rows[0].count),
            totalReplies: parseInt(repliesResult.rows[0].count),
            totalUsers: parseInt(usersResult.rows[0].count),
            totalCategories: parseInt(categoriesResult.rows[0].count)
          };
        },
        1800 // 30 minutes TTL
      );
    } catch (error) {
      console.warn('Database not available, returning mock forum stats:', error);
      // Return mock stats for development
      return {
        totalPosts: 2,
        totalReplies: 8,
        totalUsers: 5,
        totalCategories: 3
      };
    }
  }

  // 搜索功能
  async searchPosts(query: string, categoryId?: string, page = 1, limit = 20): Promise<{ posts: ForumPost[], total: number }> {
    const offset = (page - 1) * limit;
    let sqlQuery = `
      SELECT p.id, p.title, p.content, p.category_id, p.author_id, p.tags,
             p.created_at, p.updated_at, p.view_count, p.like_count, p.reply_count,
             u.name as author_name, u.avatar as author_avatar,
             ts_rank_cd(p.search_vector, plainto_tsquery('english', $1)) as rank
      FROM forum_posts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.is_deleted = false AND p.search_vector @@ plainto_tsquery('english', $1)
    `;
    const params: any[] = [query];

    if (categoryId) {
      sqlQuery += ' AND p.category_id = $' + (params.length + 1);
      params.push(categoryId);
    }

    sqlQuery += ' ORDER BY rank DESC, p.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await this.postgres.query(sqlQuery, params);

    // 获取总数
    let countQuery = 'SELECT COUNT(*) as total FROM forum_posts WHERE is_deleted = false AND search_vector @@ plainto_tsquery(\'english\', $1)';
    const countParams = [query];
    if (categoryId) {
      countQuery += ' AND category_id = $2';
      countParams.push(categoryId);
    }
    const countResult = await this.postgres.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    const posts = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      categoryId: row.category_id,
      authorId: row.author_id,
      authorName: row.author_name,
      authorAvatar: row.author_avatar,
      tags: row.tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      viewCount: row.view_count,
      likeCount: row.like_count,
      replyCount: row.reply_count
    }));

    return { posts, total };
  }
}
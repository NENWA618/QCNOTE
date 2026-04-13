import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import {
  UserProfile,
  UserSpace,
  LeaderboardEntry,
  RecommendationItem,
  HeatmapData,
  Decoration,
} from '../types/ugc-types';

export class UGCService {
  private redis: RedisClientType;
  private db: Pool;

  constructor(redis: RedisClientType, db: Pool) {
    this.redis = redis;
    this.db = db;
  }

  // ==================== 用户资料管理 ====================

  async createUserProfile(userId: string, email: string, username: string): Promise<UserProfile> {
    const now = Date.now();
    const profile: UserProfile = {
      userId,
      username,
      email,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
      bio: '这是我的个人空间',
      joinedAt: now,
      followers: 0,
      following: 0,
      credit: 10,
      isPublic: true,
    };

    await this.db.query(
      `INSERT INTO users(id, email, username, image, provider, bio, joined_at, followers, following, credit, is_public, heatmap, current_streak, longest_streak, total_active_days, created_at, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email,
             username = EXCLUDED.username,
             image = EXCLUDED.image,
             provider = EXCLUDED.provider,
             updated_at = EXCLUDED.updated_at`,
      [
        userId,
        email,
        username,
        profile.avatar,
        'nextauth',
        profile.bio,
        now,
        0,
        0,
        10,
        true,
        JSON.stringify(this.initializeHeatmap(userId).data),
        0,
        0,
        0,
        now,
        now,
      ]
    );

    await this.cacheUserProfile(profile);
    await this.redis.set(`user:${userId}:credit`, profile.credit.toString());
    return profile;
  }

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const cached = await this.redis.get(`user:${userId}:profile`);
    if (cached) {
      return JSON.parse(cached) as UserProfile;
    }

    const result = await this.db.query(
      `SELECT id, email, username, image, bio, joined_at, followers, following, credit, is_public
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    const profile: UserProfile = {
      userId: row.id,
      username: row.username,
      email: row.email,
      avatar: row.image,
      bio: row.bio,
      joinedAt: Number(row.joined_at),
      followers: Number(row.followers),
      following: Number(row.following),
      credit: Number(row.credit),
      isPublic: row.is_public,
    };

    await this.cacheUserProfile(profile);
    return profile;
  }

  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const current = await this.getUserProfile(userId);
    if (!current) throw new Error('User not found');

    const fields: string[] = [];
    const params: any[] = [];
    let index = 1;

    if (updates.username !== undefined) {
      fields.push(`username = $${index++}`);
      params.push(updates.username);
      current.username = updates.username;
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${index++}`);
      params.push(updates.email);
      current.email = updates.email;
    }
    if (updates.avatar !== undefined) {
      fields.push(`image = $${index++}`);
      params.push(updates.avatar);
      current.avatar = updates.avatar;
    }
    if (updates.bio !== undefined) {
      fields.push(`bio = $${index++}`);
      params.push(updates.bio);
      current.bio = updates.bio;
    }
    if (updates.isPublic !== undefined) {
      fields.push(`is_public = $${index++}`);
      params.push(updates.isPublic);
      current.isPublic = updates.isPublic;
    }

    if (!fields.length) {
      return current;
    }

    fields.push(`updated_at = $${index++}`);
    params.push(Date.now());
    params.push(userId);

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${index} RETURNING id, email, username, image, bio, joined_at, followers, following, credit, is_public`;
    const result = await this.db.query(query, params);

    const row = result.rows[0];
    const profile: UserProfile = {
      userId: row.id,
      username: row.username,
      email: row.email,
      avatar: row.image,
      bio: row.bio,
      joinedAt: Number(row.joined_at),
      followers: Number(row.followers),
      following: Number(row.following),
      credit: Number(row.credit),
      isPublic: row.is_public,
    };

    await this.cacheUserProfile(profile);
    return profile;
  }

  // ==================== 虚拟空间管理 ====================

  async createUserSpace(userId: string): Promise<UserSpace> {
    const now = Date.now();
    const space: UserSpace = {
      spaceId: uuidv4(),
      userId,
      spaceName: '我的虚拟空间',
      backgroundColor: '#f0f9ff',
      theme: 'minimalist',
      decorations: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.db.query(
      `INSERT INTO user_spaces(space_id, user_id, space_name, background_color, theme, decorations, created_at, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (space_id) DO NOTHING`,
      [space.spaceId, userId, space.spaceName, space.backgroundColor, space.theme, JSON.stringify(space.decorations), now, now]
    );

    await this.cacheUserSpace(space);
    return space;
  }

  async getUserSpace(userId: string): Promise<UserSpace | null> {
    const cached = await this.redis.get(`user:${userId}:space`);
    if (cached) {
      return JSON.parse(cached) as UserSpace;
    }

    const result = await this.db.query(
      `SELECT space_id, user_id, space_name, background_color, theme, decorations, background_image, created_at, updated_at
       FROM user_spaces WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (!result.rowCount) {
      const space = await this.createUserSpace(userId);
      return space;
    }

    const row = result.rows[0];
    const space: UserSpace = {
      spaceId: row.space_id,
      userId: row.user_id,
      spaceName: row.space_name,
      backgroundColor: row.background_color,
      theme: row.theme,
      decorations: row.decorations || [],
      backgroundImage: row.background_image,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };

    await this.cacheUserSpace(space);
    return space;
  }

  async updateUserSpace(userId: string, updates: Partial<UserSpace>): Promise<UserSpace> {
    const current = await this.getUserSpace(userId);
    if (!current) throw new Error('User space not found');

    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (updates.spaceName !== undefined) {
      fields.push(`space_name = $${idx++}`);
      params.push(updates.spaceName);
      current.spaceName = updates.spaceName;
    }
    if (updates.backgroundColor !== undefined) {
      fields.push(`background_color = $${idx++}`);
      params.push(updates.backgroundColor);
      current.backgroundColor = updates.backgroundColor;
    }
    if (updates.theme !== undefined) {
      fields.push(`theme = $${idx++}`);
      params.push(updates.theme);
      current.theme = updates.theme;
    }
    if (updates.decorations !== undefined) {
      fields.push(`decorations = $${idx++}`);
      params.push(JSON.stringify(updates.decorations));
      current.decorations = updates.decorations;
    }
    if (updates.backgroundImage !== undefined) {
      fields.push(`background_image = $${idx++}`);
      params.push(updates.backgroundImage);
      current.backgroundImage = updates.backgroundImage;
    }

    fields.push(`updated_at = $${idx++}`);
    params.push(Date.now());
    params.push(userId);

    const query = `UPDATE user_spaces SET ${fields.join(', ')} WHERE user_id = $${idx} RETURNING space_id, user_id, space_name, background_color, theme, decorations, background_image, created_at, updated_at`;
    const result = await this.db.query(query, params);

    if (!result.rowCount) {
      throw new Error('User space not found');
    }

    const row = result.rows[0];
    const updated: UserSpace = {
      spaceId: row.space_id,
      userId: row.user_id,
      spaceName: row.space_name,
      backgroundColor: row.background_color,
      theme: row.theme,
      decorations: row.decorations || [],
      backgroundImage: row.background_image,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };

    await this.cacheUserSpace(updated);
    return updated;
  }

  async addDecoration(userId: string, decoration: Decoration): Promise<void> {
    const space = await this.getUserSpace(userId);
    if (!space) throw new Error('User space not found');

    space.decorations.push(decoration);
    await this.db.query(
      `UPDATE user_spaces SET decorations = $1, updated_at = $2 WHERE user_id = $3`,
      [JSON.stringify(space.decorations), Date.now(), userId]
    );

    await this.cacheUserSpace(space);
  }

  // ==================== 增强版虚拟货币管理 ====================

  /**
   * 货币赚取途径：
   * - 发布社区笔记：+5 积分
   * - 笔记被点赞：+1 积分
   * - 笔记被分享：+2 积分
   * - 每日登录：+2 积分
   * - 参与论坛讨论：+1 积分
   * - 分享Live2D模型：+10 积分
   * - 模型被其他用户使用：+3 积分
   * - 完成创意挑战：+15 积分
   * - 连续7天活跃：+20 积分
   */

  /**
   * 货币消费途径：
   * - 购买装饰品：-5 到 -50 积分（根据稀有度）
   * - 定制虚拟空间主题：-10 积分
   * - 发送打赏：-1 到 -100 积分
   * - 置顶论坛帖子：-5 积分
   * - 高级推荐权重：-20 积分
   */

  async addCredit(userId: string, amount: number, reason: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE users SET credit = credit + $2, updated_at = $3 WHERE id = $1 RETURNING credit`,
      [userId, amount, Date.now()]
    );

    if (!result.rowCount) {
      throw new Error('User not found');
    }

    const credit = Number(result.rows[0].credit);
    await this.redis.set(`user:${userId}:credit`, credit.toString());
    await this.addUserCreditHistory(userId, amount, reason, credit);

    // 检查成就解锁
    await this.checkCreditAchievements(userId, credit);

    await this.invalidateUserProfileCache(userId);
    return credit;
  }

  /**
   * 批量货币操作（用于复杂奖励）
   */
  async addCreditBatch(operations: Array<{ userId: string; amount: number; reason: string }>): Promise<void> {
    for (const op of operations) {
      await this.addCredit(op.userId, op.amount, op.reason);
    }
  }

  /**
   * 货币消费验证
   */
  async spendCredit(userId: string, amount: number, reason: string, itemId?: string): Promise<number> {
    const currentCredit = await this.getCredit(userId);
    if (currentCredit < amount) {
      throw new Error('Insufficient credit');
    }

    // 记录消费
    await this.addCredit(userId, -amount, reason);

    // 如果是购买物品，记录到用户资产
    if (itemId) {
      await this.addUserAsset(userId, itemId, reason);
    }

    return currentCredit - amount;
  }

  /**
   * 每日登录奖励
   */
  async processDailyLoginReward(userId: string): Promise<{ reward: number; streak: number }> {
    const today = new Date().toDateString();
    const lastLogin = await this.redis.get(`user:${userId}:last_login`);

    if (lastLogin === today) {
      return { reward: 0, streak: 0 }; // 今日已领取
    }

    // 计算连续登录天数
    const streak = await this.calculateLoginStreak(userId);
    const reward = this.calculateDailyReward(streak);

    await this.addCredit(userId, reward, `每日登录奖励 (连续${streak}天)`);
    await this.redis.set(`user:${userId}:last_login`, today);

    return { reward, streak };
  }

  /**
   * 分享Live2D模型奖励
   */
  async rewardModelShare(userId: string, modelId: string, shareToCommunity: boolean): Promise<void> {
    let reward = 5; // 基础奖励

    if (shareToCommunity) {
      reward += 5; // 社区分享额外奖励
      await this.addCredit(userId, reward, '分享Live2D模型到社区');
    } else {
      await this.addCredit(userId, reward, '上传自定义Live2D模型');
    }

    // 记录模型分享统计
    await this.redis.hIncrBy(`model:${modelId}:stats`, 'shares', 1);
  }

  /**
   * 模型被使用奖励
   */
  async rewardModelUsage(originalAuthorId: string, modelId: string, userId: string): Promise<void> {
    if (originalAuthorId === userId) return; // 不奖励自己使用自己的模型

    const usageCount = await this.redis.hIncrBy(`model:${modelId}:stats`, 'usages', 1);

    // 每10次使用给作者奖励一次
    if (usageCount % 10 === 0) {
      await this.addCredit(originalAuthorId, 3, '模型被其他用户使用');
    }
  }

  /**
   * 论坛活动奖励
   */
  async rewardForumActivity(userId: string, activityType: 'post' | 'reply' | 'like' | 'helpful'): Promise<void> {
    const rewards = {
      post: 2,    // 发帖
      reply: 1,   // 回复
      like: 0,    // 点赞（不给积分）
      helpful: 3, // 被标记为有帮助
    };

    const reward = rewards[activityType];
    if (reward > 0) {
      await this.addCredit(userId, reward, `论坛${activityType === 'post' ? '发帖' : activityType === 'reply' ? '回复' : '回答被赞'}奖励`);
    }
  }

  /**
   * 获取用户积分
   */
  async getUserCredit(userId: string): Promise<number> {
    const cached = await this.redis.get(`user:${userId}:credit`);
    if (cached) {
      return Number(cached);
    }

    const result = await this.db.query('SELECT credit FROM users WHERE id = $1', [userId]);
    if (!result.rowCount) {
      throw new Error('User not found');
    }

    const credit = Number(result.rows[0].credit);
    await this.redis.set(`user:${userId}:credit`, credit.toString());
    return credit;
  }

  /**
   * 记录模型购买
   */
  async recordModelPurchase(modelId: string, userId: string): Promise<void> {
    await this.redis.hIncrBy(`model:${modelId}:stats`, 'purchases', 1);
    await this.redis.sAdd(`user:${userId}:purchased_models`, modelId);
  }

  /**
   * 创意挑战奖励
   */
  async rewardChallengeCompletion(userId: string, challengeId: string, rank: number): Promise<void> {
    const baseReward = 15;
    const rankBonus = Math.max(0, 5 - rank); // 前5名额外奖励

    const totalReward = baseReward + rankBonus;
    await this.addCredit(userId, totalReward, `完成创意挑战 (排名第${rank}名)`);
  }

  // ==================== 私有辅助方法 ====================

  private async calculateLoginStreak(userId: string): Promise<number> {
    // 简化实现：检查最近7天的登录记录
    let streak = 0;
    const now = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toDateString();
      const loginRecord = await this.redis.get(`user:${userId}:login:${dateStr}`);

      if (loginRecord) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  private calculateDailyReward(streak: number): number {
    const baseReward = 2;
    const streakBonus = Math.floor(streak / 7) * 2; // 每7天额外+2
    return baseReward + streakBonus;
  }

  private async checkCreditAchievements(userId: string, currentCredit: number): Promise<void> {
    const achievements = [
      { threshold: 100, name: '初入社区', reward: 5 },
      { threshold: 500, name: '活跃创作者', reward: 10 },
      { threshold: 1000, name: '社区明星', reward: 20 },
      { threshold: 5000, name: '创意大师', reward: 50 },
    ];

    for (const achievement of achievements) {
      const achieved = await this.redis.get(`user:${userId}:achievement:${achievement.name}`);
      if (!achieved && currentCredit >= achievement.threshold) {
        await this.addCredit(userId, achievement.reward, `解锁成就：${achievement.name}`);
        await this.redis.set(`user:${userId}:achievement:${achievement.name}`, 'true');
      }
    }
  }

  private async addUserAsset(userId: string, itemId: string, reason: string): Promise<void> {
    await this.redis.sAdd(`user:${userId}:assets`, itemId);
    await this.redis.set(`user:${userId}:asset:${itemId}:reason`, reason);
    await this.redis.set(`user:${userId}:asset:${itemId}:acquired_at`, Date.now().toString());
  }

  async deductCredit(userId: string, amount: number, reason: string): Promise<number> {
    const currentProfile = await this.getUserProfile(userId);
    if (!currentProfile) throw new Error('User not found');
    if (currentProfile.credit < amount) throw new Error('Insufficient credit');

    const result = await this.db.query(
      `UPDATE users SET credit = credit - $2, updated_at = $3 WHERE id = $1 RETURNING credit`,
      [userId, amount, Date.now()]
    );

    const credit = Number(result.rows[0].credit);
    await this.redis.set(`user:${userId}:credit`, credit.toString());
    await this.addUserCreditHistory(userId, -amount, reason, credit);
    await this.invalidateUserProfileCache(userId);
    return credit;
  }

  async getCredit(userId: string): Promise<number> {
    const cached = await this.redis.get(`user:${userId}:credit`);
    if (cached !== null) {
      return Number(cached);
    }

    const result = await this.db.query(`SELECT credit FROM users WHERE id = $1`, [userId]);
    if (!result.rowCount) return 0;

    const credit = Number(result.rows[0].credit);
    await this.redis.set(`user:${userId}:credit`, credit.toString());
    return credit;
  }

  // ==================== 排行榜管理 ====================

  async addToLeaderboard(
    leaderboardKey: string,
    userId: string,
    score: number,
    username: string,
    avatar: string
  ): Promise<void> {
    await this.redis.zAdd(leaderboardKey, { score, value: userId });
    await this.redis.set(
      `leaderboard:${leaderboardKey}:${userId}:info`,
      JSON.stringify({ username, avatar })
    );
  }

  async getLeaderboard(leaderboardKey: string, limit: number = 50): Promise<LeaderboardEntry[]> {
    const entries = await this.redis.zRangeWithScores(leaderboardKey, 0, limit - 1, { REV: true });

    return Promise.all(
      entries.map(async (entry, index) => {
        const info = await this.redis.get(`leaderboard:${leaderboardKey}:${entry.value}:info`);
        const parsed = info ? JSON.parse(info) : {};

        return {
          userId: entry.value as string,
          username: parsed.username || 'Unknown',
          avatar: parsed.avatar || '',
          score: entry.score,
          rank: index + 1,
          badge: this.getBadgeByRank(index + 1),
        };
      })
    );
  }

  // ==================== 关注系统 ====================

  async followUser(followerId: string, followeeId: string): Promise<void> {
    const result = await this.db.query(
      `INSERT INTO follows(user_id, followee_id, created_at) VALUES($1, $2, $3) ON CONFLICT DO NOTHING`,
      [followerId, followeeId, Date.now()]
    );

    if (result.rowCount) {
      await this.db.query(`UPDATE users SET following = following + 1 WHERE id = $1`, [followerId]);
      await this.db.query(`UPDATE users SET followers = followers + 1 WHERE id = $1`, [followeeId]);
      await this.invalidateUserProfileCache(followerId);
      await this.invalidateUserProfileCache(followeeId);
      await this.redis.sAdd(`user:${followerId}:following`, followeeId);
      await this.redis.sAdd(`user:${followeeId}:followers`, followerId);
      await this.addCredit(followerId, 1, 'Follow user');
    }
  }

  async unfollowUser(followerId: string, followeeId: string): Promise<void> {
    const result = await this.db.query(`DELETE FROM follows WHERE user_id = $1 AND followee_id = $2`, [followerId, followeeId]);
    if (result.rowCount) {
      await this.db.query(`UPDATE users SET following = GREATEST(following - 1, 0) WHERE id = $1`, [followerId]);
      await this.db.query(`UPDATE users SET followers = GREATEST(followers - 1, 0) WHERE id = $1`, [followeeId]);
      await this.invalidateUserProfileCache(followerId);
      await this.invalidateUserProfileCache(followeeId);
      await this.redis.sRem(`user:${followerId}:following`, followeeId);
      await this.redis.sRem(`user:${followeeId}:followers`, followerId);
    }
  }

  async getFollowers(userId: string): Promise<number> {
    const count = await this.redis.sCard(`user:${userId}:followers`);
    if (count > 0) return count;
    const result = await this.db.query(`SELECT COUNT(*) FROM follows WHERE followee_id = $1`, [userId]);
    return Number(result.rows[0]?.count || 0);
  }

  async getFollowing(userId: string): Promise<number> {
    const count = await this.redis.sCard(`user:${userId}:following`);
    if (count > 0) return count;
    const result = await this.db.query(`SELECT COUNT(*) FROM follows WHERE user_id = $1`, [userId]);
    return Number(result.rows[0]?.count || 0);
  }

  async isFollowing(followerId: string, followeeId: string): Promise<boolean> {
    return Boolean(await this.redis.sIsMember(`user:${followerId}:following`, followeeId));
  }

  // ==================== 辅助方法 ====================

  private initializeHeatmap(userId: string): HeatmapData {
    return {
      userId,
      data: {},
      totalActiveDays: 0,
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  private getBadgeByRank(rank: number): string | undefined {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    if (rank <= 10) return '⭐';
    return undefined;
  }

  async recordActivity(userId: string, activity: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const profile = await this.getUserProfile(userId);
    if (!profile) return;

    const heatmapResult = await this.db.query(`SELECT heatmap, current_streak, longest_streak, total_active_days FROM users WHERE id = $1`, [userId]);
    if (!heatmapResult.rowCount) return;

    const row = heatmapResult.rows[0];
    const heatmapData = row.heatmap || {};
    const currentStreak = Number(row.current_streak || 0);
    const longestStreak = Number(row.longest_streak || 0);
    const totalActiveDays = Number(row.total_active_days || 0);

    const data = { ...heatmapData };
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const hadYesterday = Boolean(data[yesterday]);
    const alreadyToday = Boolean(data[today]);

    data[today] = (data[today] || 0) + 1;

    let newStreak = alreadyToday ? currentStreak : hadYesterday ? currentStreak + 1 : 1;
    let newTotalActiveDays = totalActiveDays + (alreadyToday ? 0 : 1);
    let newLongest = Math.max(longestStreak, newStreak);

    await this.db.query(
      `UPDATE users SET heatmap = $1, current_streak = $2, longest_streak = $3, total_active_days = $4, updated_at = $5 WHERE id = $6`,
      [JSON.stringify(data), newStreak, newLongest, newTotalActiveDays, Date.now(), userId]
    );

    await this.redis.set(`user:${userId}:heatmap`, JSON.stringify({ data, totalActiveDays: newTotalActiveDays, currentStreak: newStreak, longestStreak: newLongest }));
  }

  private async cacheUserProfile(profile: UserProfile): Promise<void> {
    await this.redis.set(`user:${profile.userId}:profile`, JSON.stringify(profile));
  }

  private async cacheUserSpace(space: UserSpace): Promise<void> {
    await this.redis.set(`user:${space.userId}:space`, JSON.stringify(space));
  }

  private async addUserCreditHistory(userId: string, amount: number, reason: string, newBalance: number): Promise<void> {
    await this.redis.lPush(
      `user:${userId}:credit-history`,
      JSON.stringify({
        timestamp: Date.now(),
        amount,
        reason,
        newBalance,
      })
    );
  }

  private async invalidateUserProfileCache(userId: string): Promise<void> {
    await this.redis.del(`user:${userId}:profile`);
  }
}

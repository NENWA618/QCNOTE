import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import {
  UserProfile,
  UserSpace,
  CommunityNote,
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

  // ==================== 虚拟货币管理 ====================

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
    await this.invalidateUserProfileCache(userId);
    return credit;
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

  // ==================== 社区笔记管理 ====================

  async publishCommunityNote(note: CommunityNote): Promise<CommunityNote> {
    const communityId = uuidv4();
    const published: CommunityNote = {
      ...note,
      communityId,
      publishedAt: Date.now(),
      isPublished: true,
    };

    await this.db.query(
      `INSERT INTO community_notes(
        community_id, original_note_id, user_id, username, title, preview, content,
        category, tags, likes, comments, views, shares, published_at, is_published,
        last_modified_at, cover_image
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        communityId,
        note.originalNoteId,
        note.userId,
        note.username,
        note.title,
        note.preview,
        note.content,
        note.category,
        JSON.stringify(note.tags),
        0,
        0,
        0,
        0,
        published.publishedAt,
        true,
        published.publishedAt,
        note.coverImage || null,
      ]
    );

    await this.cacheCommunityNote(published);
    await this.redis.lPush('community:notes:all', communityId);
    await this.redis.lPush(`community:notes:user:${note.userId}`, communityId);
    await this.redis.zAdd('community:trending:24h', {
      score: Date.now(),
      value: communityId,
    });

    if (Array.isArray(note.tags)) {
      for (const tag of note.tags) {
        await this.redis.sAdd(`community:notes:tag:${tag}`, communityId);
      }
    }

    await this.redis.lPush(`community:notes:category:${note.category}`, communityId);
    return published;
  }

  async getCommunityNote(communityId: string): Promise<CommunityNote | null> {
    const cached = await this.redis.get(`community:note:${communityId}`);
    if (cached) {
      return JSON.parse(cached) as CommunityNote;
    }

    const result = await this.db.query(
      `SELECT community_id, original_note_id, user_id, username, title, preview, content, category, tags,
              likes, comments, views, shares, published_at, is_published, last_modified_at, cover_image
       FROM community_notes WHERE community_id = $1`,
      [communityId]
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    const note: CommunityNote = {
      communityId: row.community_id,
      originalNoteId: row.original_note_id,
      userId: row.user_id,
      username: row.username,
      title: row.title,
      preview: row.preview,
      content: row.content,
      category: row.category,
      tags: row.tags || [],
      likes: Number(row.likes),
      comments: Number(row.comments),
      views: Number(row.views),
      shares: Number(row.shares),
      publishedAt: Number(row.published_at),
      isPublished: row.is_published,
      lastModifiedAt: Number(row.last_modified_at),
      coverImage: row.cover_image,
    };

    await this.cacheCommunityNote(note);
    return note;
  }

  async updateCommunityNoteStats(
    communityId: string,
    stats: { likes?: number; comments?: number; views?: number; shares?: number }
  ): Promise<void> {
    const note = await this.getCommunityNote(communityId);
    if (!note) throw new Error('Note not found');

    const updated = {
      ...note,
      likes: stats.likes ?? note.likes,
      comments: stats.comments ?? note.comments,
      views: stats.views ?? note.views,
      shares: stats.shares ?? note.shares,
      lastModifiedAt: Date.now(),
    };

    await this.db.query(
      `UPDATE community_notes SET likes = $1, comments = $2, views = $3, shares = $4, last_modified_at = $5 WHERE community_id = $6`,
      [updated.likes, updated.comments, updated.views, updated.shares, updated.lastModifiedAt, communityId]
    );
    await this.cacheCommunityNote(updated);

    const score = updated.likes * 1.2 + updated.comments * 0.8 + updated.views * 0.1;
    await this.redis.zAdd('community:trending:24h', { score, value: communityId });
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
    const entries = await this.redis.zRevRangeWithScores(leaderboardKey, 0, limit - 1);

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

  // ==================== 互动管理 ====================

  async likeNote(userId: string, communityId: string): Promise<boolean> {
    const isLiked = await this.redis.sIsMember(`community:likes:${communityId}`, userId);

    let likes = 0;
    if (isLiked) {
      await this.redis.sRem(`community:likes:${communityId}`, userId);
      const result = await this.db.query(
        `UPDATE community_notes SET likes = GREATEST(likes - 1, 0) WHERE community_id = $1 RETURNING likes`,
        [communityId]
      );
      likes = result.rowCount ? Number(result.rows[0].likes) : 0;
      await this.addCredit(userId, -1, 'Unlike note');
    } else {
      await this.redis.sAdd(`community:likes:${communityId}`, userId);
      const result = await this.db.query(
        `UPDATE community_notes SET likes = likes + 1 WHERE community_id = $1 RETURNING likes`,
        [communityId]
      );
      likes = result.rowCount ? Number(result.rows[0].likes) : 0;
      await this.addCredit(userId, 1, 'Like note');
      await this.db.query(
        `INSERT INTO interactions(interaction_id, from_user_id, to_note_id, type, created_at)
         VALUES($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [uuidv4(), userId, communityId, 'like', Date.now()]
      );
    }

    await this.redis.set(`community:note:${communityId}:likes`, likes.toString());
    await this.redis.zAdd('community:trending:24h', { score: likes * 1.2, value: communityId });
    return !isLiked;
  }

  async getNoteLikes(communityId: string): Promise<number> {
    const cached = await this.redis.get(`community:note:${communityId}:likes`);
    if (cached !== null) {
      return Number(cached);
    }

    const result = await this.db.query(`SELECT likes FROM community_notes WHERE community_id = $1`, [communityId]);
    const likes = result.rowCount ? Number(result.rows[0].likes) : 0;
    await this.redis.set(`community:note:${communityId}:likes`, likes.toString());
    return likes;
  }

  async isNoteLikedByUser(userId: string, communityId: string): Promise<boolean> {
    return await this.redis.sIsMember(`community:likes:${communityId}`, userId);
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
    return await this.redis.sIsMember(`user:${followerId}:following`, followeeId);
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

  private async cacheCommunityNote(note: CommunityNote): Promise<void> {
    await this.redis.set(`community:note:${note.communityId}`, JSON.stringify(note));
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

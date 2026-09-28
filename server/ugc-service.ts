import crypto from 'crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { UserProfile, LeaderboardEntry, HeatmapData } from '../types/ugc-types';
import logger from '../lib/logger';

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
      isPublic: true,
    };

    await this.db.query(
      `INSERT INTO users(id, email, username, image, provider, bio, joined_at, is_public, heatmap, device_fingerprints, current_streak, longest_streak, total_active_days, created_at, updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
        true,
        JSON.stringify(this.initializeHeatmap(userId).data),
        JSON.stringify({}),
        0,
        0,
        0,
        now,
        now,
      ],
    );

    await this.cacheUserProfile(profile);
    return profile;
  }

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const cached = await this.redis.get(`user:${userId}:profile`);
    if (cached) {
      return JSON.parse(cached) as UserProfile;
    }

    const result = await this.db.query(
      `SELECT id, email, username, image, bio, joined_at, is_public
       FROM users WHERE id = $1`,
      [userId],
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
      isPublic: row.is_public,
    };

    await this.cacheUserProfile(profile);
    return profile;
  }

  async getDeviceFingerprints(
    userId: string,
  ): Promise<Record<string, { firstSeen: number; lastSeen: number }>> {
    const result = await this.db.query(`SELECT device_fingerprints FROM users WHERE id = $1`, [
      userId,
    ]);

    if (!result.rowCount) {
      return {};
    }

    return (result.rows[0].device_fingerprints ?? {}) as Record<
      string,
      { firstSeen: number; lastSeen: number }
    >;
  }

  async saveDeviceFingerprints(
    userId: string,
    fingerprints: Record<string, { firstSeen: number; lastSeen: number }>,
  ): Promise<void> {
    const result = await this.db.query(`UPDATE users SET device_fingerprints = $1 WHERE id = $2`, [
      JSON.stringify(fingerprints),
      userId,
    ]);

    if (result.rowCount === 0) {
      throw new Error(`User not found while saving device fingerprints: ${userId}`);
    }
  }

  private getDeviceSessionSecret(): Uint8Array {
    const secret = process.env.DEVICE_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      // 不再回退到硬编码默认值：生产环境下那等同于公开的签名密钥
      if (process.env.NODE_ENV === 'production') {
        throw new Error('DEVICE_SESSION_SECRET or NEXTAUTH_SECRET is required in production');
      }
      logger.warn(
        '[DeviceSession] No secret configured; using an insecure development-only default.',
      );
      return new TextEncoder().encode('qcnote-device-session-secret');
    }
    return new TextEncoder().encode(secret);
  }

  async createDeviceSessionToken(
    userId: string,
    fingerprint: string,
    expiresMs: number = 1000 * 60 * 60 * 12,
  ): Promise<string> {
    const expiresAtSeconds = Math.floor((Date.now() + expiresMs) / 1000);
    return await new SignJWT({ scope: 'device_session', fingerprint })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(expiresAtSeconds)
      .setJti(uuidv4())
      .sign(this.getDeviceSessionSecret());
  }

  async verifyDeviceSessionToken(
    userId: string,
    token: string,
    fingerprint: string,
  ): Promise<boolean> {
    try {
      const { payload } = await jwtVerify(token, this.getDeviceSessionSecret(), {
        subject: userId,
      });

      if (payload.scope !== 'device_session') {
        return false;
      }

      if (payload.fingerprint !== fingerprint) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  async verifyDeviceFingerprint(
    userId: string,
    fingerprint: string,
  ): Promise<{ allowed: boolean; firstTime: boolean }> {
    const fingerprints = await this.getDeviceFingerprints(userId);
    const now = Date.now();
    const hasAny = Object.keys(fingerprints).length > 0;

    if (!hasAny) {
      fingerprints[fingerprint] = { firstSeen: now, lastSeen: now };
      await this.saveDeviceFingerprints(userId, fingerprints);
      return { allowed: true, firstTime: true };
    }

    if (fingerprints[fingerprint]) {
      fingerprints[fingerprint].lastSeen = now;
      await this.saveDeviceFingerprints(userId, fingerprints);
      return { allowed: true, firstTime: false };
    }

    return { allowed: false, firstTime: false };
  }

  async resetDeviceFingerprints(userId: string): Promise<void> {
    const result = await this.db.query(`UPDATE users SET device_fingerprints = $1 WHERE id = $2`, [
      JSON.stringify({}),
      userId,
    ]);

    if (result.rowCount === 0) {
      throw new Error(`User not found while resetting device fingerprints: ${userId}`);
    }
  }

  // ==================== 本地数据库加密 Vault Key (KEK) ====================
  //
  // 每个用户一把 KEK（Key Encryption Key），随机生成，加密后存 user_vault_keys。
  // 客户端用 KEK 包裹（wrap）浏览器本地生成的 DEK，DEK 才是真正加解密笔记字段
  // 的密钥，DEK 本身永远不会发送到服务器。即使 Postgres 被整体拖库、
  // VAULT_MASTER_KEY 也一并泄露，攻击者拿到的也只是每个用户的 KEK，仍然需要
  // 拿到该用户浏览器本地的 wrappedDEK 才能解密其笔记。

  // Called once at server startup so a misconfigured VAULT_MASTER_KEY fails
  // the deploy immediately with a clear message, instead of surfacing later
  // as a 500 from every /api/vault/key request (and a confusing "写入存储
  // 失败" for users, since the client can't tell a locked vault apart from a
  // genuine storage error).
  assertVaultMasterKeyConfigured(): void {
    this.getVaultMasterKey();
  }

  private getVaultMasterKey(): Buffer {
    const raw = process.env.VAULT_MASTER_KEY;
    if (raw) {
      const key = Buffer.from(raw, 'base64');
      if (key.length !== 32) {
        throw new Error('VAULT_MASTER_KEY must decode to exactly 32 bytes (base64-encoded)');
      }
      return key;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'VAULT_MASTER_KEY environment variable is required in production to serve /api/vault/key',
      );
    }

    logger.warn(
      '[Vault] VAULT_MASTER_KEY not set; using an insecure development-only default. Set VAULT_MASTER_KEY before deploying.',
    );
    return crypto.createHash('sha256').update('qcnote-vault-master-key-dev-only').digest();
  }

  private wrapKeyMaterial(raw: Buffer): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getVaultMasterKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(raw), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Node's GCM cipher exposes the auth tag separately via getAuthTag(),
    // unlike the browser's subtle.encrypt() which appends it to the
    // ciphertext automatically — store iv + ciphertext + tag explicitly.
    return Buffer.concat([iv, ciphertext, tag]).toString('base64');
  }

  private unwrapKeyMaterial(wrapped: string): Buffer {
    const buf = Buffer.from(wrapped, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const ciphertext = buf.subarray(12, buf.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.getVaultMasterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  async getOrCreateVaultKey(userId: string): Promise<Buffer> {
    const existing = await this.db.query(
      `SELECT wrapped_key FROM user_vault_keys WHERE user_id = $1`,
      [userId],
    );
    if (existing.rowCount) {
      return this.unwrapKeyMaterial(existing.rows[0].wrapped_key);
    }

    const kek = crypto.randomBytes(32);
    const wrapped = this.wrapKeyMaterial(kek);

    await this.db.query(
      `INSERT INTO user_vault_keys (user_id, wrapped_key) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, wrapped],
    );

    // Another concurrent first-open may have won the insert race; re-read so
    // every caller converges on the single stored KEK regardless of who won.
    const result = await this.db.query(
      `SELECT wrapped_key FROM user_vault_keys WHERE user_id = $1`,
      [userId],
    );
    return this.unwrapKeyMaterial(result.rows[0].wrapped_key);
  }

  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const current = await this.getUserProfile(userId);
    if (!current) throw new Error('User not found');

    const fields: string[] = [];
    const params: Array<string | number | boolean | null> = [];
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

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${index} RETURNING id, email, username, image, bio, joined_at, is_public`;
    const result = await this.db.query(query, params);

    const row = result.rows[0];
    const profile: UserProfile = {
      userId: row.id,
      username: row.username,
      email: row.email,
      avatar: row.image,
      bio: row.bio,
      joinedAt: Number(row.joined_at),
      isPublic: row.is_public,
    };

    await this.cacheUserProfile(profile);
    return profile;
  }

  // ==================== 排行榜管理 ====================

  async addToLeaderboard(
    leaderboardKey: string,
    userId: string,
    score: number,
    username: string,
    avatar: string,
  ): Promise<void> {
    await this.redis.zAdd(leaderboardKey, { score, value: userId });
    await this.redis.set(
      `leaderboard:${leaderboardKey}:${userId}:info`,
      JSON.stringify({ username, avatar }),
    );
  }

  async getLeaderboard(leaderboardKey: string, limit: number = 50): Promise<LeaderboardEntry[]> {
    const entries = await this.redis.zRangeWithScores(leaderboardKey, 0, limit - 1, { REV: true });

    if (entries.length === 0) {
      return [];
    }

    // 批量获取用户信息，避免 N+1 查询
    const userIds = entries.map((entry) => entry.value as string);
    const infoKeys = userIds.map((userId) => `leaderboard:${leaderboardKey}:${userId}:info`);

    const userInfos = await this.redis.mGet(infoKeys);

    return entries.map((entry, index) => {
      const userId = entry.value as string;
      const info = userInfos[index];
      const parsed = info ? JSON.parse(info) : {};

      return {
        userId,
        username: parsed.username || 'Unknown',
        avatar: parsed.avatar || '',
        score: entry.score,
        rank: index + 1,
        badge: this.getBadgeByRank(index + 1),
      };
    });
  }

  private extractDayFromLeaderboardKey(leaderboardKey: string): string | null {
    const match = leaderboardKey.match(/:(\d{4}-\d{2}-\d{2})$/);
    return match ? match[1] : null;
  }

  private async ensureMazeSubmissionTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS maze_submissions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        steps INTEGER NOT NULL,
        time_ms INTEGER NOT NULL,
        username TEXT NOT NULL,
        avatar TEXT,
        created_at BIGINT NOT NULL,
        UNIQUE (user_id, day)
      )
    `);
  }

  async cleanupMazeLeaderboardEntries(currentDay: string): Promise<number> {
    await this.ensureMazeSubmissionTable();

    const keepDays = new Set<string>([currentDay]);
    const previousDay = new Date(`${currentDay}T00:00:00+08:00`);
    previousDay.setDate(previousDay.getDate() - 1);
    keepDays.add(previousDay.toISOString().slice(0, 10));

    const result = await this.db.query(
      `DELETE FROM maze_submissions WHERE day NOT IN (${Array.from(keepDays)
        .map((_, index) => `$${index + 1}`)
        .join(', ')})`,
      Array.from(keepDays),
    );
    return result.rowCount ?? 0;
  }

  async hasGameSubmission(leaderboardKey: string, userId: string): Promise<boolean> {
    const day = this.extractDayFromLeaderboardKey(leaderboardKey);
    if (day) {
      await this.ensureMazeSubmissionTable();
      const result = await this.db.query(
        'SELECT 1 FROM maze_submissions WHERE user_id = $1 AND day = $2 LIMIT 1',
        [userId, day],
      );
      if (result.rowCount) {
        return true;
      }
    }

    const exists = await this.redis.exists(`${leaderboardKey}:user:${userId}`);
    return exists === 1;
  }

  async addGameSubmission(
    leaderboardKey: string,
    userId: string,
    steps: number,
    timeMs: number,
    username: string,
    avatar: string,
  ): Promise<void> {
    const day = this.extractDayFromLeaderboardKey(leaderboardKey);
    const normalizedSteps = Math.round(steps);
    const normalizedTimeMs = Math.round(timeMs);
    if (day) {
      await this.ensureMazeSubmissionTable();
      await this.db.query(
        `INSERT INTO maze_submissions (user_id, day, steps, time_ms, username, avatar, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, day) DO UPDATE
         SET steps = CASE
           WHEN EXCLUDED.steps < maze_submissions.steps THEN EXCLUDED.steps
           ELSE maze_submissions.steps
         END,
         time_ms = CASE
           WHEN EXCLUDED.time_ms < maze_submissions.time_ms THEN EXCLUDED.time_ms
           ELSE maze_submissions.time_ms
         END,
         username = EXCLUDED.username,
         avatar = EXCLUDED.avatar`,
        [userId, day, normalizedSteps, normalizedTimeMs, username, avatar, Date.now()],
      );
    }

    const score = 1000000 - (normalizedSteps * 1000 + Math.floor(normalizedTimeMs / 1000));
    await this.redis.zAdd(leaderboardKey, { score, value: userId });
    await this.redis.set(
      `leaderboard:${leaderboardKey}:${userId}:info`,
      JSON.stringify({ username, avatar }),
    );
    await this.redis.set(
      `${leaderboardKey}:user:${userId}`,
      JSON.stringify({ steps, timeMs, submittedAt: Date.now() }),
    );
  }

  async getGameLeaderboard(
    leaderboardKey: string,
    limit: number = 50,
  ): Promise<
    Array<{
      userId: string;
      username: string;
      avatar: string;
      steps: number;
      timeMs: number;
      rank: number;
      badge?: string;
    }>
  > {
    const day = this.extractDayFromLeaderboardKey(leaderboardKey);
    if (day) {
      await this.ensureMazeSubmissionTable();
      const result = await this.db.query(
        `SELECT user_id, username, avatar, steps, time_ms
         FROM maze_submissions
         WHERE day = $1
         ORDER BY steps ASC, time_ms ASC, created_at ASC
         LIMIT $2`,
        [day, limit],
      );

      if (result.rowCount) {
        const rows = result.rows as Array<{
          user_id: string;
          username: string;
          avatar: string;
          steps: number;
          time_ms: number;
        }>;
        return rows.map((row, index) => {
          const score = 1000000 - (row.steps * 1000 + Math.floor(row.time_ms / 1000));
          return {
            userId: row.user_id,
            username: row.username || 'Unknown',
            avatar: row.avatar || '',
            score,
            steps: Number(row.steps),
            timeMs: Number(row.time_ms),
            rank: index + 1,
            badge: this.getBadgeByRank(index + 1),
          };
        });
      }
    }

    const entries = await this.redis.zRangeWithScores(leaderboardKey, 0, limit - 1, { REV: true });
    if (entries.length === 0) {
      return [];
    }

    const userIds = entries.map((entry) => entry.value as string);
    const infoKeys = userIds.map((userId) => `leaderboard:${leaderboardKey}:${userId}:info`);
    const submissionKeys = userIds.map((userId) => `${leaderboardKey}:user:${userId}`);

    const [userInfos, submissions] = await Promise.all([
      this.redis.mGet(infoKeys),
      this.redis.mGet(submissionKeys),
    ]);

    return entries.map((entry, index) => {
      const userId = entry.value as string;
      const info = userInfos[index];
      const submission = submissions[index];
      const parsedInfo = info ? JSON.parse(info) : {};
      const parsedSubmission = submission ? JSON.parse(submission) : {};

      return {
        userId,
        username: parsedInfo.username || 'Unknown',
        avatar: parsedInfo.avatar || '',
        score: entry.score,
        steps: parsedSubmission.steps ?? Math.max(0, 1000 - entry.score),
        timeMs: parsedSubmission.timeMs ?? 0,
        rank: index + 1,
        badge: this.getBadgeByRank(index + 1),
      };
    });
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

    const heatmapResult = await this.db.query(
      `SELECT heatmap, current_streak, longest_streak, total_active_days FROM users WHERE id = $1`,
      [userId],
    );
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
      [JSON.stringify(data), newStreak, newLongest, newTotalActiveDays, Date.now(), userId],
    );

    await this.redis.set(
      `user:${userId}:heatmap`,
      JSON.stringify({
        data,
        totalActiveDays: newTotalActiveDays,
        currentStreak: newStreak,
        longestStreak: newLongest,
      }),
    );
  }

  private async cacheUserProfile(profile: UserProfile): Promise<void> {
    await this.redis.set(`user:${profile.userId}:profile`, JSON.stringify(profile));
  }

  private async invalidateUserProfileCache(userId: string): Promise<void> {
    await this.redis.del(`user:${userId}:profile`);
  }
}

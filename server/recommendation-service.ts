import { RedisClientType } from 'redis';
import { CommunityNote, RecommendationItem } from '../types/ugc-types';
import { UGCService } from './ugc-service';

export class RecommendationService {
  private redis: RedisClientType;
  private ugcService: UGCService;

  constructor(redis: RedisClientType, ugcService: UGCService) {
    this.redis = redis;
    this.ugcService = ugcService;
  }

  /**
   * 多维度创意相似度推荐算法
   * 最终推荐分数 = (热度分 × 0.25) + (内容相似度 × 0.35) + (作者影响力 × 0.15) + (新鲜度 × 0.15) + (多样性探索 × 0.10)
   */
  async recommendNotesForUser(
    userId: string,
    limit: number = 20
  ): Promise<RecommendationItem[]> {
    // 1. 获取用户已阅读和点赞的笔记（以确定兴趣）
    const userInterests = await this.getUserInterests(userId);

    // 2. 获取所有社区笔记
    const allNoteIds = await this.redis.lRange('community:notes:all', 0, -1);

    // 3. 计算每个笔记的推荐分数
    const scores: Array<{ noteId: string; score: number; reason: string }> = [];

    for (const noteId of allNoteIds) {
      const note = await this.getNoteData(noteId);
      if (!note || note.userId === userId) continue; // 排除用户自己的笔记

      const score = await this.calculateRecommendationScore(userId, note, userInterests);
      scores.push({
        noteId,
        score: score.total,
        reason: score.reason,
      });
    }

    // 4. 多样性探索：15% 随机推荐未探索领域
    const explorationRate = 0.15;
    const explorationCount = Math.ceil(limit * explorationRate);
    const result = scores
      .sort((a, b) => b.score - a.score)
      .map((item, index) => ({
        itemId: item.noteId,
        type: 'note' as const,
        score: item.score,
        reason: item.reason,
        metadata: {},
      }));

    // 混入探索内容
    const recommendations = this.mixExplorationNotes(result, explorationCount);

    return recommendations.slice(0, limit);
  }

  /**
   * 计算推荐分数（复杂算法）
   */
  private async calculateRecommendationScore(
    userId: string,
    note: CommunityNote,
    userInterests: {
      tags: string[];
      categories: string[];
      followingAuthors: string[];
    }
  ): Promise<{ total: number; reason: string }> {
    // 1. 热度分 (25%)
    const popularityScore = await this.calculatePopularityScore(note);

    // 2. 内容相似度 (35%)
    const contentSimilarity = await this.calculateContentSimilarity(note, userInterests);

    // 3. 作者影响力 (15%)
    const authorInfluence = await this.calculateAuthorInfluence(note.userId);

    // 4. 新鲜度 (15%)
    const freshnessScore = this.calculateFreshnessScore(note.publishedAt);

    // 5. 多样性探索 (10%)
    const diversityBonus = this.calculateDiversityBonus(note.category, userInterests.categories);

    const totalScore =
      popularityScore * 0.25 +
      contentSimilarity * 0.35 +
      authorInfluence * 0.15 +
      freshnessScore * 0.15 +
      diversityBonus * 0.1;

    const reason = this.generateReason(
      popularityScore,
      contentSimilarity,
      authorInfluence,
      freshnessScore
    );

    return { total: totalScore, reason };
  }

  /**
   * 计算热度分
   * = (点赞数 × 1.2) + (评论数 × 0.8) + (分享数 × 1.5) + (阅读时长 × 0.3)
   */
  private async calculatePopularityScore(note: CommunityNote): Promise<number> {
    const engagement =
      note.likes * 1.2 + note.comments * 0.8 + note.shares * 1.5 + note.views * 0.1;

    // 归一化到 0-100
    const normalized = Math.min(engagement / 10, 100);
    return normalized;
  }

  /**
   * 计算内容相似度
   * = 标签相似度 × 0.4 + 文本语义相似度 × 0.4 + 分类相似度 × 0.2
   */
  private async calculateContentSimilarity(
    note: CommunityNote,
    userInterests: { tags: string[]; categories: string[] }
  ): Promise<number> {
    // 标签相似度
    const tagSimilarity = this.calculateTagSimilarity(note.tags, userInterests.tags);

    // 分类相似度
    const categorySimilarity = userInterests.categories.includes(note.category) ? 100 : 0;

    // 文本相似度（简化版：使用关键词匹配）
    const textSimilarity = this.calculateTextSimilarity(note.preview, userInterests.tags);

    return tagSimilarity * 0.4 + textSimilarity * 0.4 + categorySimilarity * 0.2;
  }

  /**
   * 计算作者影响力
   */
  private async calculateAuthorInfluence(authorId: string): Promise<number> {
    const followers = await this.redis.sCard(`user:${authorId}:followers`);
    const notes = await this.redis.lLen(`community:notes:user:${authorId}`);

    // 基础分 + 粉丝加权 + 活跃度加权
    const influenceScore = 10 + Math.log(followers + 1) * 5 + Math.log(notes + 1) * 3;

    return Math.min(influenceScore, 100);
  }

  /**
   * 计算新鲜度分
   */
  private calculateFreshnessScore(publishedAt: number): number {
    const daysPassed = (Date.now() - publishedAt) / (1000 * 60 * 60 * 24);

    // 使用衰减函数：7天内最高分，之后逐渐衰减
    return 1 / (1 + daysPassed / 7);
  }

  /**
   * 计算多样性探索加成
   */
  private calculateDiversityBonus(
    noteCategory: string,
    userCategories: string[]
  ): number {
    if (userCategories.includes(noteCategory)) {
      return 50; // 用户感兴趣的类别
    } else {
      return 100; // 新的类别，鼓励探索
    }
  }

  /**
   * 计算标签相似度
   */
  private calculateTagSimilarity(noteTags: string[], userTags: string[]): number {
    if (userTags.length === 0) return 50; // 中性分

    const matchedTags = noteTags.filter((tag) => userTags.includes(tag)).length;
    return (matchedTags / Math.max(noteTags.length, 1)) * 100;
  }

  /**
   * 计算文本相似度（关键词匹配）
   */
  private calculateTextSimilarity(text: string, keywords: string[]): number {
    if (keywords.length === 0) return 50;

    const matches = keywords.filter((keyword) => text.toLowerCase().includes(keyword)).length;
    return (matches / keywords.length) * 100;
  }

  /**
   * 获取用户兴趣
   */
  private async getUserInterests(userId: string): Promise<{
    tags: string[];
    categories: string[];
    followingAuthors: string[];
  }> {
    // 获取用户点赞的笔记的标签和分类
    const likedNotes: string[] = [];
    const tags = new Set<string>();
    const categories = new Set<string>();

    // 获取用户关注的作者
    const followingAuthors = await this.redis.sMembers(`user:${userId}:following`);

    // 简化：获取用户最近的活动
    const recentActivity = await this.redis.lRange(`user:${userId}:interactions`, 0, 20);

    for (const activity of recentActivity) {
      const parsed = JSON.parse(activity);
      if (parsed.type === 'like' && parsed.noteId) {
        const note = await this.getNoteData(parsed.noteId);
        if (note) {
          note.tags.forEach((tag) => tags.add(tag));
          categories.add(note.category);
        }
      }
    }

    return {
      tags: Array.from(tags),
      categories: Array.from(categories),
      followingAuthors,
    };
  }

  /**
   * 混入探索内容
   */
  private mixExplorationNotes(
    recommendations: RecommendationItem[],
    explorationCount: number
  ): RecommendationItem[] {
    const result = [...recommendations];

    // 从 recommendations 中随机选择 explorationCount 个进行重排
    for (let i = 0; i < explorationCount && i < result.length; i++) {
      const randomIndex = Math.floor(Math.random() * result.length);
      [result[i], result[randomIndex]] = [result[randomIndex], result[i]];
    }

    return result;
  }

  /**
   * 生成推荐原因文本
   */
  private generateReason(
    popularity: number,
    similarity: number,
    influence: number,
    freshness: number
  ): string {
    const reasons = [];

    if (similarity > 70) reasons.push('内容匹配您的兴趣');
    if (popularity > 70) reasons.push('热门内容');
    if (influence > 70) reasons.push('来自有影响力的作者');
    if (freshness > 0.7) reasons.push('最新发布');

    return reasons.length > 0 ? reasons.join(' · ') : '为您推荐';
  }

  private async getNoteData(noteId: string): Promise<CommunityNote | null> {
    const data = await this.redis.get(`community:note:${noteId}`);
    return data ? JSON.parse(data) : null;
  }
}

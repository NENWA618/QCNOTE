import { RedisClientType } from 'redis';
import { RecommendationItem } from '../types/ugc-types';
import { UGCService } from './ugc-service';

interface NoteData {
  id: string;
  userId: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  publishedAt: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export class RecommendationService {
  private redis: RedisClientType;
  private ugcService: UGCService;

  constructor(redis: RedisClientType, ugcService: UGCService) {
    this.redis = redis;
    this.ugcService = ugcService;
  }

  /**
   * 多维度内容相似度推荐算法
   * 最终推荐分数 = (热度分 × 0.20) + (内容相似度 × 0.25) + (作者影响力 × 0.15) + (新鲜度 × 0.10) + (用户互动 × 0.10) + (标签相关性 × 0.10) + (多样性探索 × 0.10)
   */
  async recommendNotesForUser(
    userId: string,
    limit: number = 20
  ): Promise<RecommendationItem[]> {
    // 1. 获取用户兴趣标签和分类
    const userInterests = await this.getUserInterests(userId);

    // 2. 获取用户行为数据
    const userBehavior = await this.getUserBehaviorData(userId);

    // 3. 获取所有可用笔记
    const allNoteIds = await this.redis.lRange('notes:all', 0, -1);

    if (allNoteIds.length === 0) {
      return [];
    }

    // 4. 批量获取笔记数据，避免 N+1 查询
    const noteKeys = allNoteIds.map(id => `note:${id}`);
    const noteDataList = await this.redis.mGet(noteKeys);

    // 5. 计算每个笔记的推荐分数
    const scores: Array<{ noteId: string; score: number; reason: string }> = [];

    for (let i = 0; i < allNoteIds.length; i++) {
      const noteId = allNoteIds[i];
      const noteData = noteDataList[i];

      if (!noteData) continue;

      const note = JSON.parse(noteData) as NoteData;
      if (note.userId === userId) continue; // 排除用户自己的笔记

      const score = await this.calculateEnhancedRecommendationScore(userId, note, userInterests, userBehavior);
      scores.push({
        noteId,
        score: score.total,
        reason: score.reason,
      });
    }

    // 5. 多样性探索：12% 随机推荐新领域
    const explorationRate = 0.12;
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
   * 计算增强版推荐分数
   */
  private async calculateEnhancedRecommendationScore(
    userId: string,
    note: NoteData,
    userInterests: {
      tags: string[];
      categories: string[];
      followingAuthors: string[];
    },
    userBehavior: {
      avgSessionTime: number;
      preferredTimeOfDay: number;
      interactionFrequency: number;
    }
  ): Promise<{ total: number; reason: string }> {
    // 1. 热度分 (20%)
    const popularityScore = await this.calculatePopularityScore(note);

    // 2. 内容相似度 (25%)
    const contentSimilarity = await this.calculateContentSimilarity(note, userInterests);

    // 3. 作者影响力 (15%)
    const authorInfluence = await this.calculateAuthorInfluence(note.userId);

    // 4. 新鲜度 (10%)
    const freshnessScore = this.calculateFreshnessScore(note.publishedAt);

    // 5. 用户互动历史 (10%)
    const userInteractionScore = await this.calculateUserInteractionScore(userId, note);

    // 6. 标签相关性 (10%)
    const tagRelevanceScore = this.calculateTagRelevance(note.tags, userInterests.tags);

    // 7. 多样性探索 (10%)
    const diversityBonus = this.calculateDiversityBonus(note.category, userInterests.categories);

    const totalScore =
      popularityScore * 0.20 +
      contentSimilarity * 0.25 +
      authorInfluence * 0.15 +
      freshnessScore * 0.10 +
      userInteractionScore * 0.10 +
      tagRelevanceScore * 0.10 +
      diversityBonus * 0.10;

    const reason = this.generateEnhancedReason(
      popularityScore,
      contentSimilarity,
      authorInfluence,
      freshnessScore,
      userInteractionScore,
      tagRelevanceScore,
      diversityBonus
    );

    return { total: totalScore, reason };
  }

  /**
   * 计算用户互动历史分数
   */
  private async calculateUserInteractionScore(userId: string, note: NoteData): Promise<number> {
    // 检查用户是否关注了作者
    const isFollowing = await this.redis.sIsMember(`user:${userId}:following`, note.userId);
    if (isFollowing) return 100;

    // 检查用户是否点赞过类似内容
    const similarLikes = await this.redis.sCard(`user:${userId}:liked_categories:${note.category}`);
    return Math.min(similarLikes * 20, 80);
  }

  /**
   * 计算标签相关性分数
   */
  private calculateTagRelevance(noteTags: string[], userTags: string[]): number {
    if (!noteTags.length || !userTags.length) return 50;
    
    const matches = noteTags.filter(tag => userTags.includes(tag)).length;
    return Math.min((matches / noteTags.length) * 100, 100);
  }

  /**
   * 获取用户行为数据
   */
  private async getUserBehaviorData(userId: string): Promise<{
    avgSessionTime: number;
    preferredTimeOfDay: number;
    interactionFrequency: number;
  }> {
    // 从Redis获取用户行为统计
    const sessionTime = await this.redis.get(`user:${userId}:avg_session_time`) || '30';
    const preferredTime = await this.redis.get(`user:${userId}:preferred_time`) || '12';
    const frequency = await this.redis.get(`user:${userId}:interaction_freq`) || '5';

    return {
      avgSessionTime: Number(sessionTime),
      preferredTimeOfDay: Number(preferredTime),
      interactionFrequency: Number(frequency),
    };
  }

  /**
   * 计算内容相似度
   * = 标签相似度 × 0.4 + 文本语义相似度 × 0.4 + 分类相似度 × 0.2
   */
  private async calculateContentSimilarity(
    note: NoteData,
    userInterests: { tags: string[]; categories: string[] }
  ): Promise<number> {
    // 标签相似度
    const tagSimilarity = this.calculateTagSimilarity(note.tags, userInterests.tags);

    // 分类相似度
    const categorySimilarity = userInterests.categories.includes(note.category) ? 100 : 0;

    // 文本相似度（简化版：使用关键词匹配）
    const textSimilarity = this.calculateTextSimilarity(note.content, userInterests.tags);

    return tagSimilarity * 0.4 + textSimilarity * 0.4 + categorySimilarity * 0.2;
  }

  /**
   * 计算作者影响力
   */
  private async calculateAuthorInfluence(authorId: string): Promise<number> {
    const followers = await this.redis.sCard(`user:${authorId}:followers`);
    const notes = await this.redis.lLen(`notes:user:${authorId}`);

    // 基础分 + 粉丝加权 + 活跃度加权
    const influenceScore = 10 + Math.log(followers + 1) * 5 + Math.log(notes + 1) * 3;

    return Math.min(influenceScore, 100);
  }

  /**
   * 计算热度分
   */
  private async calculatePopularityScore(note: NoteData): Promise<number> {
    const likes = note.likeCount || 0;
    const comments = note.commentCount || 0;
    const views = note.viewCount || 0;

    const score = likes * 0.4 + comments * 0.3 + Math.min(views, 100) * 0.3;
    return Math.min(Math.round(score), 100);
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

    // 收集需要获取的笔记ID
    const noteIds: string[] = [];
    for (const activity of recentActivity) {
      const parsed = JSON.parse(activity);
      if (parsed.type === 'like' && parsed.noteId) {
        noteIds.push(parsed.noteId);
      }
    }

    // 批量获取笔记数据
    if (noteIds.length > 0) {
      const noteKeys = noteIds.map(id => `note:${id}`);
      const noteDataList = await this.redis.mGet(noteKeys);

      for (let i = 0; i < noteIds.length; i++) {
        const noteData = noteDataList[i];
        if (noteData) {
          const note = JSON.parse(noteData) as NoteData;
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
   * 生成增强版推荐原因文本
   */
  private generateEnhancedReason(
    popularity: number,
    similarity: number,
    influence: number,
    freshness: number,
    interaction: number,
    tagRelevance: number,
    diversity: number
  ): string {
    const reasons = [];

    if (similarity > 70) reasons.push('内容匹配您的兴趣');
    if (interaction > 80) reasons.push('基于您的互动历史');
    if (popularity > 70) reasons.push('热门内容');
    if (tagRelevance > 60) reasons.push('标签相关');
    if (influence > 70) reasons.push('来自有影响力的作者');
    if (freshness > 0.7) reasons.push('最新发布');
    if (diversity > 80) reasons.push('探索新领域');

    return reasons.length > 0 ? reasons.slice(0, 2).join(' · ') : '为您推荐';
  }
}

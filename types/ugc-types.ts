/**
 * UGC 系统类型定义
 */

// 用户资料
export interface UserProfile {
  userId: string;
  username: string;
  email: string;
  avatar: string;
  bio: string;
  joinedAt: number;
  followers: number;
  following: number;
  credit: number; // 虚拟货币
  isPublic: boolean;
}

// 虚拟空间
export interface UserSpace {
  spaceId: string;
  userId: string;
  spaceName: string;
  backgroundColor: string;
  theme: 'minimalist' | 'vibrant' | 'elegant' | 'gaming' | 'cyberpunk';
  decorations: Decoration[];
  backgroundImage?: string;
  createdAt: number;
  updatedAt: number;
}

// 装饰品
export interface Decoration {
  decorId: string;
  type: 'item' | 'avatar' | 'background' | 'widget' | 'pet';
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  unlocked: boolean;
  unlockedAt?: number;
  imageUrl: string;
  description: string;
}

// 用户互动
export interface UserInteraction {
  interactionId: string;
  fromUserId: string;
  toNoteId?: string;
  toUserId?: string;
  type: 'like' | 'comment' | 'follow' | 'share' | 'report';
  content?: string;
  createdAt: number;
}

// 排行榜项
export interface LeaderboardEntry {
  userId: string;
  username: string;
  avatar: string;
  score: number;
  rank: number;
  badge?: string;
  // For game/maze leaderboards: number of steps and completion time in ms.
  // These are optional because other leaderboard types may not include them.
  steps?: number;
  timeMs?: number;
}

// 评论
export interface Comment {
  commentId: string;
  noteId: string;
  userId: string;
  username: string;
  avatar: string;
  content: string;
  likes: number;
  createdAt: number;
  updatedAt: number;
  replies?: Comment[];
}

// 成就
export interface Achievement {
  achievementId: string;
  type:
    | 'first-share'
    | 'popular-note'
    | 'active-contributor'
    | 'follower-milestone'
    | 'engagement-master'
    | 'creative-genius';
  name: string;
  description: string;
  icon: string;
  unlockedAt: number;
  reward: {
    credit: number;
    decoration?: Decoration;
  };
}

// 推荐项
export interface RecommendationItem {
  itemId: string;
  type: 'note' | 'user' | 'challenge';
  score: number;
  reason: string;
  metadata: Record<string, unknown>;
}

// 创意挑战
export interface CreativeChallenge {
  challengeId: string;
  title: string;
  description: string;
  category: string;
  startDate: number;
  endDate: number;
  entries: string[]; // 参赛笔记 ID
  status: 'upcoming' | 'active' | 'voting' | 'finished';
  winner?: string;
  reward: {
    credit: number;
    decoration: Decoration;
  };
  createdAt: number;
}

// 学习热力图数据
export interface HeatmapData {
  userId: string;
  data: Record<string, number>; // YYYY-MM-DD -> 活动次数
  totalActiveDays: number;
  currentStreak: number;
  longestStreak: number;
}

// ==================== 用户角色类型 ====================

// 用户角色
export type UserRole = 'user' | 'moderator' | 'admin';

// 用户角色信息
export interface UserRoleInfo {
  userId: string;
  role: UserRole;
  assignedAt: number;
  assignedBy: string;
  permissions: string[];
}

// ==================== Live2D模型系统类型 ====================

// Live2D模型
export interface Live2DModel {
  modelId: string;
  name: string;
  description: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  fileUrl: string;
  previewImageUrl?: string;
  thumbnailUrl?: string;
  fileSize: number;
  format: string;
  price: number;
  category: string;
  tags: string[];
  rating: number;
  ratingCount: number;
  downloadCount: number;
  viewCount: number;
  isPublic: boolean;
  isApproved: boolean;
  approvedAt?: number;
  approvedBy?: string;
  createdAt: number;
  updatedAt: number;
  reviews: ModelReview[];
}

// 模型评价
export interface ModelReview {
  reviewId: string;
  modelId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  rating: number;
  content: string;
  createdAt: number;
  likes: number;
  likedBy: string[];
}

// 模型购买记录
export interface ModelPurchase {
  purchaseId: string;
  modelId: string;
  buyerId: string;
  sellerId: string;
  price: number;
  purchaseDate: number;
  transactionId: string;
}

// 模型租赁记录
export interface ModelRental {
  rentalId: string;
  modelId: string;
  renterId: string;
  ownerId: string;
  rentalPrice: number;
  duration: number; // 租赁时长（天）
  startDate: number;
  endDate: number;
  status: 'active' | 'expired' | 'cancelled';
}

// ==================== 商业化功能类型 ====================

// 会员等级
export type MembershipLevel = 'free' | 'basic' | 'premium' | 'vip';

// 会员信息
export interface MembershipInfo {
  userId: string;
  level: MembershipLevel;
  startDate: number;
  endDate: number;
  autoRenew: boolean;
  benefits: MembershipBenefit[];
}

// 会员权益
export interface MembershipBenefit {
  benefitId: string;
  name: string;
  description: string;
  type: 'discount' | 'feature' | 'priority' | 'limit';
  value: number | string | boolean;
}

// 创作者分成记录
export interface CreatorRoyalty {
  royaltyId: string;
  creatorId: string;
  modelId: string;
  purchaseId: string;
  amount: number;
  percentage: number;
  calculatedAt: number;
  paidAt?: number;
  status: 'pending' | 'paid' | 'cancelled';
}

// ==================== 分析和统计类型 ====================

// 用户行为分析
export interface UserAnalytics {
  userId: string;
  sessionCount: number;
  totalTimeSpent: number; // 分钟
  pageViews: Record<string, number>;
  actions: Record<string, number>; // 各种操作的计数
  lastActivity: number;
  deviceInfo: {
    browser: string;
    os: string;
    device: string;
  };
}

// 模型热度统计
export interface ModelPopularity {
  modelId: string;
  dailyViews: number[];
  weeklyDownloads: number[];
  monthlyRevenue: number[];
  trendingScore: number;
  rank: number;
  lastUpdated: number;
}

// 运营数据面板
export interface OperationalDashboard {
  totalUsers: number;
  activeUsers: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  revenue: {
    total: number;
    monthly: number[];
    byCategory: Record<string, number>;
  };
  content: {
    totalModels: number;
    approvedModels: number;
    pendingModels: number;
  };
  engagement: {
    averageSessionTime: number;
    bounceRate: number;
    conversionRate: number;
  };
}

// 故事链接
export interface StoryLink {
  linkId: string;
  fromNoteId: string;
  toNoteId: string;
  linkType: 'sequel' | 'prequel' | 'related' | 'branch';
  createdAt: number;
}

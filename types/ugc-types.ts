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

// 社区笔记
export interface CommunityNote {
  communityId: string;
  originalNoteId: string;
  userId: string;
  username: string;
  title: string;
  preview: string;
  content: string;
  category: string;
  tags: string[];
  likes: number;
  comments: number;
  views: number;
  shares: number;
  publishedAt: number;
  isPublished: boolean;
  lastModifiedAt: number;
  coverImage?: string;
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
  type: 'first-share' | 'popular-note' | 'active-contributor' | 'follower-milestone' | 'engagement-master' | 'creative-genius';
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
  metadata: any;
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

// 故事链接
export interface StoryLink {
  linkId: string;
  fromNoteId: string;
  toNoteId: string;
  linkType: 'sequel' | 'prequel' | 'related' | 'branch';
  createdAt: number;
}

// 社区地图数据（用户聚类）
export interface CommunityMapCluster {
  clusterId: string;
  clusterName: string;
  category: string;
  users: string[];
  averageScore: number;
  createdAt: number;
}

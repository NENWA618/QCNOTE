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

// 故事链接
export interface StoryLink {
  linkId: string;
  fromNoteId: string;
  toNoteId: string;
  linkType: 'sequel' | 'prequel' | 'related' | 'branch';
  createdAt: number;
}

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
}

// 公开笔记：用户主动发布的一份快照，与本地笔记相互独立
export interface PublicNoteSummary {
  id: string;
  title: string;
  preview: string;
  tags: string[];
  publishedAt: number;
  updatedAt: number;
}

export interface PublicNote extends PublicNoteSummary {
  content: string;
  coloredRanges: Array<{ startIndex: number; endIndex: number; color: string }>;
  author: { userId: string; username: string; avatar: string };
}

// 作者自己的发布记录（用于仪表盘判断"已公开"和"有未发布的更改"）
export interface PublishedNoteInfo {
  id: string;
  localNoteId: string;
  title: string;
  sourceUpdatedAt: number;
  publishedAt: number;
}

// 管理员对某个用户的“主页与公开笔记”关闭记录。关闭只是让它们对外不可见并锁住作者的
// 发布操作，服务器上的公开笔记原样保留，用于留存证据；解除后恢复原样。
export interface PublicSuspension {
  suspendedAt: number;
  suspendedBy: string;
  reason: string;
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

// 学习热力图数据
export interface HeatmapData {
  userId: string;
  data: Record<string, number>; // YYYY-MM-DD -> 活动次数
  totalActiveDays: number;
  currentStreak: number;
  longestStreak: number;
}

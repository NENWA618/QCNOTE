/**
 * Storage Module Type Definitions
 */

export interface NoteVersion {
  versionId: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  color: string;
  isFavorite: boolean;
  isArchived: boolean;
  updatedAt: number;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  color: string;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
  links?: string[];
  backlinks?: string[];
  versions?: NoteVersion[];
  isDeleted?: boolean;
  deletedAt?: number;
}

export interface Stats {
  totalNotes: number;
  favoriteNotes: number;
  archivedNotes: number;
  categories: Record<string, number>;
  totalTags: number;
  createdToday: number;
}

export interface UserSettings {
  theme: string;
  sortBy: string;
  itemsPerPage: number;
  defaultCategory: string;
}

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  remotePath: string;
  encryptionKey?: string;
  // Auto-sync settings
  autoSyncEnabled?: boolean;
  syncInterval?: number; // in milliseconds
  lastSyncTime?: number; // timestamp
  lastSyncStatus?: 'success' | 'failure' | 'pending';
  lastSyncError?: string;
  conflictStrategy?: 'prefer-local' | 'prefer-remote' | 'manual' | 'merge';
}

export interface NoteConflict {
  id: string;
  local: NoteItem;
  remote: NoteItem;
  resolved: boolean;
  createdAt: number;
}

export interface SyncStatus {
  isRunning: boolean;
  lastSyncTime: number | null;
  lastSyncStatus: 'success' | 'failure' | 'pending' | 'idle';
  lastSyncError: string | null;
  nextSyncTime: number | null;
}

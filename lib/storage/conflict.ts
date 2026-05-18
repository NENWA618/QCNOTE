/**
 * Conflict Resolution Module
 * Handles merging and resolving conflicts between local and remote notes
 */
import { safeAsync } from '../errorHandler';
import logger from '../logger';
import type { NoteItem, NoteConflict } from './types';
import { HybridStorageAdapter } from './adapter';

export type ConflictStrategy = 'prefer-local' | 'prefer-remote' | 'manual' | 'merge';

/**
 * Detect conflicts between local and remote notes
 */
export function detectConflict(local: NoteItem, remote: NoteItem): boolean {
  // A conflict exists if:
  // 1. Content differs
  // 2. Title differs
  // 3. Both were modified (local newer or equal, remote newer)
  return (
    local.title !== remote.title ||
    local.content !== remote.content ||
    local.updatedAt !== remote.updatedAt
  );
}

/**
 * Merge two notes using specified strategy
 */
export function resolveConflict(
  local: NoteItem,
  remote: NoteItem,
  strategy: ConflictStrategy,
): NoteItem {
  switch (strategy) {
    case 'prefer-local':
      return local;

    case 'prefer-remote':
      return remote;

    case 'merge': {
      // Smart merge: keep newer version as base, but preserve important fields
      const newer = local.updatedAt >= remote.updatedAt ? local : remote;
      const older = local.updatedAt >= remote.updatedAt ? remote : local;

      return {
        ...newer,
        // Merge tags (union of both sets)
        tags: Array.from(new Set([...newer.tags, ...older.tags])),
        // Preserve backlinks
        backlinks: newer.backlinks || older.backlinks,
        // Update metadata
        updatedAt: Date.now(),
      };
    }

    case 'manual':
    default:
      // Return local for now, manual resolution needed
      return local;
  }
}

/**
 * Merge lists of notes, detecting and resolving conflicts
 */
export function mergeNoteLists(
  localNotes: NoteItem[],
  remoteNotes: NoteItem[],
  strategy: ConflictStrategy = 'manual',
): {
  merged: NoteItem[];
  conflicts: Array<{ local: NoteItem; remote: NoteItem }>;
} {
  const localMap = new Map(localNotes.map((n) => [n.id, n]));
  const remoteMap = new Map(remoteNotes.map((n) => [n.id, n]));

  const merged: NoteItem[] = [];
  const conflicts: Array<{ local: NoteItem; remote: NoteItem }> = [];

  // Process all remote notes
  for (const remote of remoteNotes) {
    const local = localMap.get(remote.id);

    if (!local) {
      // New remote note
      merged.push(remote);
    } else if (detectConflict(local, remote)) {
      // Conflict detected
      conflicts.push({ local, remote });
      merged.push(resolveConflict(local, remote, strategy));
    } else if (local.updatedAt <= remote.updatedAt) {
      // Remote is newer or same
      merged.push(remote);
    } else {
      // Local is newer
      merged.push(local);
    }
  }

  // Add local notes not in remote
  for (const local of localNotes) {
    if (!remoteMap.has(local.id)) {
      merged.push(local);
    }
  }

  return { merged, conflicts };
}

/**
 * Conflict Manager
 */
export class ConflictManager {
  private adapter: HybridStorageAdapter;
  private conflictsKey: string;

  constructor(adapter: HybridStorageAdapter, conflictsKey: string = 'QCNOTE_CONFLICTS') {
    this.adapter = adapter;
    this.conflictsKey = conflictsKey;
  }

  /**
   * Get all unresolved conflicts
   */
  async getConflicts(): Promise<NoteConflict[]> {
    const conflicts = await this.adapter.get<NoteConflict[]>(this.conflictsKey);
    return conflicts || [];
  }

  /**
   * Save conflicts
   */
  async setConflicts(conflicts: NoteConflict[]): Promise<boolean> {
    return this.adapter.set(this.conflictsKey, conflicts);
  }

  /**
   * Add a new conflict
   */
  async addConflict(conflict: NoteConflict): Promise<boolean> {
    const conflicts = await this.getConflicts();
    conflicts.push(conflict);
    return this.setConflicts(conflicts);
  }

  /**
   * Resolve a conflict by ID
   */
  async resolveConflict(id: string, resolution: NoteItem): Promise<boolean> {
    const conflicts = await this.getConflicts();
    const index = conflicts.findIndex((c) => c.id === id);

    if (index === -1) {
      logger.warn(`[ConflictManager] Conflict ${id} not found`);
      return false;
    }

    conflicts.splice(index, 1);
    return this.setConflicts(conflicts);
  }

  /**
   * Clear all conflicts
   */
  async clearConflicts(): Promise<boolean> {
    return this.adapter.remove(this.conflictsKey);
  }
}

export default {
  detectConflict,
  resolveConflict,
  mergeNoteLists,
  ConflictManager,
};

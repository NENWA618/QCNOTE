import logger from './logger';
import type { NoteStorage, WebDAVConfig } from './storage';
import type { SyncStatus } from './storage/types';

export type { SyncStatus };

export type SyncDirection = 'push' | 'pull' | 'both';

export class WebDAVSyncManager {
  private storage: NoteStorage | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private syncInProgress = false;
  private lastSyncTime: number | null = null;
  private lastSyncStatus: 'success' | 'failure' | 'pending' | 'idle' = 'idle';
  private lastSyncError: string | null = null;
  private nextSyncTime: number | null = null;
  private statusChangeCallbacks: Array<(status: SyncStatus) => void> = [];
  // storage.userGeneration when auto-sync started: the config it captured
  // belongs to that session's user, so a later user switch stops it.
  private autoSyncGeneration: number | null = null;

  constructor(storage: NoteStorage) {
    this.storage = storage;
  }

  /**
   * Start auto-sync with the given configuration
   */
  async start(config: WebDAVConfig, direction: SyncDirection = 'both'): Promise<void> {
    if (!config.autoSyncEnabled || !config.syncInterval || config.syncInterval <= 0) {
      logger.warn('[WebDAVSyncManager] Auto-sync not enabled or invalid interval');
      return;
    }

    if (this.syncInterval) {
      logger.warn('[WebDAVSyncManager] Sync already running, stopping previous');
      this.stop();
    }

    logger.info(`[WebDAVSyncManager] Starting auto-sync with interval ${config.syncInterval}ms`);

    const generation = this.storage?.userGeneration ?? null;
    this.autoSyncGeneration = generation;

    // Run first sync immediately
    await this.executeSync(config, direction);

    // The user may have switched during the first sync
    if (!this.isSameSession(generation)) {
      this.autoSyncGeneration = null;
      return;
    }

    // Schedule subsequent syncs
    this.syncInterval = setInterval(() => {
      if (!this.isSameSession(generation)) {
        logger.info('[WebDAVSyncManager] User changed, stopping auto-sync');
        this.stop();
        return;
      }
      void this.executeSync(config, direction);
    }, config.syncInterval);
  }

  private isSameSession(generation: number | null): boolean {
    return generation === this.autoSyncGeneration && generation === this.storage?.userGeneration;
  }

  /**
   * Stop auto-sync
   */
  stop(): void {
    this.autoSyncGeneration = null;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('[WebDAVSyncManager] Auto-sync stopped');
    }
    this.nextSyncTime = null;
    this.notifyStatusChange();
  }

  /**
   * Execute a single sync operation
   */
  private async executeSync(
    config: WebDAVConfig,
    direction: SyncDirection = 'both',
  ): Promise<void> {
    if (!this.storage || this.syncInProgress) {
      return;
    }

    this.syncInProgress = true;
    this.lastSyncStatus = 'pending';
    this.lastSyncError = null;
    this.notifyStatusChange();

    // `config` (credentials included) belongs to the user signed in now.
    // Once that changes, nothing below may touch the new user's store.
    const storage = this.storage;
    const generation = storage.userGeneration;
    const sameUser = () => storage.userGeneration === generation;

    try {
      logger.info(`[WebDAVSyncManager] Starting sync (direction: ${direction})`);

      const encrypt = Boolean(config.encryptionKey);
      if (direction === 'both') {
        // One merge-then-conditional-upload round trip. (Pushing first and
        // pulling after would overwrite other devices' changes before they
        // were ever read.)
        if (!(await this.storage.syncWithWebDAVAsync(config, encrypt))) {
          throw new Error('Sync with WebDAV failed');
        }
        logger.info('[WebDAVSyncManager] Sync completed successfully');
      } else if (direction === 'push') {
        if (!(await this.storage.pushToWebDAVAsync(config, encrypt))) {
          throw new Error('Push to WebDAV failed');
        }
        logger.info('[WebDAVSyncManager] Push completed successfully');
      } else {
        if (!(await this.storage.pullFromWebDAVAsync(config, encrypt))) {
          throw new Error('Pull from WebDAV failed');
        }
        logger.info('[WebDAVSyncManager] Pull completed successfully');
      }

      if (direction !== 'push') {
        // Handle conflicts if auto-resolution is configured
        if (config.conflictStrategy && config.conflictStrategy !== 'manual' && sameUser()) {
          await this.resolveConflicts(config.conflictStrategy);
        }
      }

      this.lastSyncTime = Date.now();
      this.lastSyncStatus = 'success';
      this.lastSyncError = null;

      // Update config with sync status
      config.lastSyncTime = this.lastSyncTime;
      config.lastSyncStatus = 'success';
      config.lastSyncError = undefined;

      await storage.runIfSameUser(generation, () => storage.setWebDAVConfigAsync(config));
      logger.info('[WebDAVSyncManager] Sync completed successfully');
    } catch (error) {
      this.lastSyncStatus = 'failure';
      this.lastSyncError = error instanceof Error ? error.message : String(error);

      // Update config with error status
      config.lastSyncTime = Date.now();
      config.lastSyncStatus = 'failure';
      config.lastSyncError = this.lastSyncError;

      // Saving this config under another user would hand them its credentials
      await storage
        .runIfSameUser(generation, () => storage.setWebDAVConfigAsync(config))
        .catch((e) => logger.error('[WebDAVSyncManager] Saving sync status failed:', e));
      logger.error('[WebDAVSyncManager] Sync failed:', error);
    } finally {
      this.syncInProgress = false;
      this.calculateNextSyncTime(config.syncInterval || 0);
      this.notifyStatusChange();
    }
  }

  /**
   * Manually trigger a sync
   */
  async syncNow(config: WebDAVConfig, direction: SyncDirection = 'both'): Promise<boolean> {
    if (!this.storage) {
      return false;
    }

    try {
      await this.executeSync(config, direction);
      return this.lastSyncStatus === 'success';
    } catch (error) {
      logger.error('[WebDAVSyncManager] Manual sync failed:', error);
      return false;
    }
  }

  /**
   * Resolve conflicts automatically based on strategy
   */
  private async resolveConflicts(strategy: 'prefer-local' | 'prefer-remote'): Promise<void> {
    if (!this.storage) return;

    try {
      const conflicts = await this.storage.getConflictsAsync();

      for (const conflict of conflicts) {
        const resolvedNote = strategy === 'prefer-local' ? conflict.local : conflict.remote;

        await this.storage.resolveConflictAsync(conflict.id, resolvedNote);
      }

      if (conflicts.length > 0) {
        logger.info(
          `[WebDAVSyncManager] Resolved ${conflicts.length} conflicts using ${strategy} strategy`,
        );
      }
    } catch (error) {
      logger.error('[WebDAVSyncManager] Error resolving conflicts:', error);
      throw error;
    }
  }

  /**
   * Calculate next sync time
   */
  private calculateNextSyncTime(interval: number): void {
    if (interval > 0) {
      this.nextSyncTime = Date.now() + interval;
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return {
      isRunning: this.syncInterval !== null,
      lastSyncTime: this.lastSyncTime,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncError: this.lastSyncError,
      nextSyncTime: this.nextSyncTime,
    };
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusChangeCallbacks.push(callback);
    // Return unsubscribe function
    return () => {
      const index = this.statusChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.statusChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify all subscribers of status change
   */
  private notifyStatusChange(): void {
    const status = this.getStatus();
    this.statusChangeCallbacks.forEach((callback) => {
      try {
        callback(status);
      } catch (error) {
        logger.error('[WebDAVSyncManager] Error in status change callback:', error);
      }
    });
  }

  /**
   * Update sync configuration
   */
  async updateConfig(newConfig: WebDAVConfig): Promise<void> {
    if (!this.storage) return;

    const isAutoSyncChanging = newConfig.autoSyncEnabled !== this.getStatus().isRunning;

    if (isAutoSyncChanging) {
      this.stop();
      if (newConfig.autoSyncEnabled) {
        await this.start(newConfig);
      }
    }
  }

  /**
   * Format last sync time for display
   */
  formatLastSyncTime(): string {
    if (!this.lastSyncTime) {
      return '未同步';
    }

    const now = Date.now();
    const diff = now - this.lastSyncTime;

    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} 分钟前`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} 小时前`;
    } else {
      const days = Math.floor(diff / 86400000);
      return `${days} 天前`;
    }
  }
}

export default WebDAVSyncManager;

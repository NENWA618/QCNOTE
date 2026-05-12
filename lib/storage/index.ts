/**
 * Storage Module - Unified Export
 * Provides organized access to storage-related functionality
 */

// Types
export * from './types';

// Adapters
export { HybridStorageAdapter, LocalStorageAdapter, IndexedDBAdapter } from './adapter';

// Encryption
export * from './encryption';

// Conflict resolution
export {
  detectConflict,
  resolveConflict,
  mergeNoteLists,
  ConflictManager,
  type ConflictStrategy,
} from './conflict';

// Improved Indexer
export {
  buildIndex,
  updateIndexIncremental,
  loadIndex,
  loadVectors,
  loadSentiments,
  clearIndexCache,
  getIndexStats,
} from './indexer';

// WebDAV Sync
export {
  validateWebDAVConfig,
  normalizeWebDAVUrl,
  createWebDAVRequest,
  pushNotesToWebDAV,
  pullNotesFromWebDAV,
  syncWithWebDAV,
} from './webdav';

/**
 * Utils Module - Unified Export
 * Organized utilities for date, text, search, data, functions, and UI
 */

// Date utilities
export * as dateUtils from './date';
export { formatDate, getRelativeTime, estimateReadingTime } from './date';

// Text utilities
export * as textUtils from './text';
export {
  truncateText,
  escapeHtml,
  getTextSummary,
  fuzzySearch,
  copyToClipboard,
} from './text';

// Search utilities
export * as searchUtils from './search';
export {
  parseSearchQuery,
  parseSingleToken,
  matchesDateRange,
  matchesSingleToken,
  matchesSearchTokens,
  searchNotes,
  type SearchToken,
} from './search';

// Data utilities
export * as dataUtils from './data';
export {
  generateId,
  getWordFrequency,
  sortNotes,
  getColorPalette,
} from './data';

// Function utilities
export * as functionUtils from './function';
export { debounce, throttle, compose, pipe, memoize } from './function';

// UI utilities
export * as uiUtils from './dom';
export {
  prefersDarkMode,
  prefersReducedMotion,
  getViewportSize,
  isInViewport,
  scrollIntoView,
} from './dom';

// For backward compatibility with existing imports
export const Utils = {
  // Date
  formatDate: require('./date').formatDate,
  getRelativeTime: require('./date').getRelativeTime,
  estimateReadingTime: require('./date').estimateReadingTime,

  // Text
  truncateText: require('./text').truncateText,
  escapeHtml: require('./text').escapeHtml,
  getTextSummary: require('./text').getTextSummary,
  fuzzySearch: require('./text').fuzzySearch,
  copyToClipboard: require('./text').copyToClipboard,

  // Search
  parseSearchQuery: require('./search').parseSearchQuery,
  searchNotes: require('./search').searchNotes,

  // Data
  generateId: require('./data').generateId,
  getWordFrequency: require('./data').getWordFrequency,
  sortNotes: require('./data').sortNotes,
  getColorPalette: require('./data').getColorPalette,

  // Functions
  debounce: require('./function').debounce,
  throttle: require('./function').throttle,

  // UI
  prefersDarkMode: require('./dom').prefersDarkMode,
};

export default Utils;

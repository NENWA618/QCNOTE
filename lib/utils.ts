/**
 * 工具函数模块 (TypeScript)
 */
import type { NoteItem } from './storage';

export const Utils = {
  formatDate(timestamp: number) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨天';
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  },

  getRelativeTime(timestamp: number) {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;

    return this.formatDate(timestamp);
  },

  truncateText(text: string, length = 100) {
    if (!text) return '';
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
  },

  getColorPalette() {
    return ['#dc96b4', '#b0a8c0', '#d8cbcf', '#f6e0e7', '#9fb1d0', '#c9a8cc', '#d4b5d1', '#e5d1e0'];
  },

  generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * 高级搜索功能
   */
  searchNotes(notes: NoteItem[], query: string): NoteItem[] {
    if (!query.trim()) return notes;

    const tokens = this.parseSearchQuery(query);
    return notes.filter(note => this.matchesSearchTokens(note, tokens));
  },

  /**
   * 解析搜索查询，支持字段限定和操作符
   */
  parseSearchQuery(query: string): Array<{ field?: string; value: string; operator: 'AND' | 'OR' | 'NOT' }> {
    // 支持的格式：
    // title:关键词 content:内容 tag:标签 category:分类 date:2024-01-01..2024-12-31
    // 关键词1 AND 关键词2 OR 关键词3 NOT 关键词4

    const tokens: Array<{ field?: string; value: string; operator: 'AND' | 'OR' | 'NOT' }> = [];
    const parts = query.split(/\s+(AND|OR|NOT)\s+/i);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;

      if (part.toUpperCase() === 'AND' || part.toUpperCase() === 'OR' || part.toUpperCase() === 'NOT') {
        // 操作符，应用到下一个token
        if (i + 1 < parts.length) {
          const nextToken = this.parseSingleToken(parts[i + 1]);
          nextToken.operator = part.toUpperCase() as 'AND' | 'OR' | 'NOT';
          tokens.push(nextToken);
          i++; // 跳过下一个
        }
      } else {
        tokens.push(this.parseSingleToken(part));
      }
    }

    return tokens;
  },

  parseSingleToken(token: string): { field?: string; value: string; operator: 'AND' | 'OR' | 'NOT' } {
    const fieldMatch = token.match(/^(\w+):(.+)$/);
    if (fieldMatch) {
      const [, field, value] = fieldMatch;
      return { field, value, operator: 'AND' };
    }
    return { value: token, operator: 'AND' };
  },

  matchesSearchTokens(note: NoteItem, tokens: Array<{ field?: string; value: string; operator: 'AND' | 'OR' | 'NOT' }>): boolean {
    // 简单实现：所有AND条件必须满足，OR条件只要一个满足，NOT条件不能满足
    let hasOrMatch = false;
    let hasAndMatch = true;

    for (const token of tokens) {
      const matches = this.matchesSingleToken(note, token);

      if (token.operator === 'OR') {
        if (matches) hasOrMatch = true;
      } else if (token.operator === 'NOT') {
        if (matches) return false; // NOT条件满足则不匹配
      } else { // AND
        if (!matches) hasAndMatch = false;
      }
    }

    // 如果有OR条件，必须至少一个OR匹配；AND条件必须全部匹配
    return hasAndMatch && (tokens.some(t => t.operator === 'OR') ? hasOrMatch : true);
  },

  matchesSingleToken(note: NoteItem, token: { field?: string; value: string }): boolean {
    const searchValue = token.value.toLowerCase();

    if (token.field) {
      switch (token.field.toLowerCase()) {
        case 'title':
          return note.title.toLowerCase().includes(searchValue);
        case 'content':
          return note.content.toLowerCase().includes(searchValue);
        case 'tag':
          return note.tags.some(tag => tag.toLowerCase().includes(searchValue));
        case 'category':
          return note.category.toLowerCase().includes(searchValue);
        case 'date':
          return this.matchesDateRange(note.createdAt, searchValue);
        default:
          return false;
      }
    } else {
      // 全局搜索
      return (
        note.title.toLowerCase().includes(searchValue) ||
        note.content.toLowerCase().includes(searchValue) ||
        note.tags.some(tag => tag.toLowerCase().includes(searchValue)) ||
        note.category.toLowerCase().includes(searchValue)
      );
    }
  },

  matchesDateRange(timestamp: number, dateRange: string): boolean {
    // 支持格式：2024-01-01 或 2024-01-01..2024-12-31
    const date = new Date(timestamp);
    const [start, end] = dateRange.split('..');

    if (end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      return date >= startDate && date <= endDate;
    } else {
      const targetDate = new Date(start);
      return date.toDateString() === targetDate.toDateString();
    }
  },

  /**
   * 模糊搜索（简单实现）
   */
  fuzzySearch(text: string, query: string): boolean {
    if (!query) return true;
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    let queryIndex = 0;
    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === queryLower.length;
  },

  escapeHtml(text: string) {
    const div: HTMLDivElement =
      typeof document !== 'undefined'
        ? document.createElement('div')
        : ({ textContent: '' } as HTMLDivElement);
    if (typeof document !== 'undefined') div.textContent = text;
    return div.innerHTML || '';
  },

  copyToClipboard(text: string) {
    return navigator.clipboard.writeText(text).catch((err) => {
      console.error('复制失败:', err);
      return false;
    });
  },

  getTextSummary(html: string, length = 100) {
    if (typeof document === 'undefined') return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    const text = div.textContent || div.innerText || '';
    return this.truncateText(text.replace(/\s+/g, ' '), length);
  },

  sortNotes(notes: NoteItem[], sortBy = 'date') {
    const sorted = [...notes];

    switch (sortBy) {
      case 'date':
        sorted.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
        break;
      case 'color':
        sorted.sort((a, b) => a.color.localeCompare(b.color));
        break;
      case 'favorite':
        sorted.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
        break;
      default:
        sorted.sort((a, b) => b.createdAt - a.createdAt);
    }

    return sorted;
  },

  prefersDarkMode() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  },

  debounce<T extends (...args: unknown[]) => void>(func: T, wait = 300) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return function executedFunction(..._args: Parameters<T>) {
      const later = () => {
        if (timeout) clearTimeout(timeout);
        func(...(_args as Parameters<T>));
      };
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  throttle<T extends (...args: unknown[]) => void>(func: T, limit = 300) {
    let inThrottle = false;
    return function (this: unknown, ..._args: Parameters<T>) {
      if (!inThrottle) {
        func.apply(this, _args as Parameters<T>);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },

  estimateReadingTime(text: string) {
    const wordsPerMinute = 200;
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.ceil(words / wordsPerMinute);
    return minutes > 0 ? minutes : 1;
  },

  getWordFrequency(texts: string[], limit = 20) {
    const freq: Record<string, number> = {};
    texts.forEach((text) => {
      const words = text.toLowerCase().match(/[\u4e00-\u9fa5\w]+/g) || [];
      words.forEach((word) => {
        if (word.length > 1) {
          freq[word] = (freq[word] || 0) + 1;
        }
      });
    });

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  },
} as const;

export default Utils;

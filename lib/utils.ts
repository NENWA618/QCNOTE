/**
 * 工具函数模块 (TypeScript)
 */
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

  escapeHtml(text: string) {
    const div =
      typeof document !== 'undefined'
        ? document.createElement('div')
        : ({ textContent: '' } as any);
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

  sortNotes(notes: any[], sortBy = 'date') {
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

  debounce(func: (...args: any[]) => void, wait = 300) {
    let timeout: any;
    return function executedFunction(..._args: any[]) {
      const later = () => {
        clearTimeout(timeout);
        func(..._args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  throttle(func: (...args: any[]) => void, limit = 300) {
    let inThrottle: boolean;
    return function (this: any, ..._args: any[]) {
      if (!inThrottle) {
        func.apply(this, _args);
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

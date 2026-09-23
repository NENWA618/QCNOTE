/**
 * Text Processing Utilities
 */

/**
 * Truncate text to specified length with ellipsis
 */
export function truncateText(text: string, length: number = 100): string {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

/**
 * HTML escape function
 */
export function escapeHtml(text: string): string {
  const div: HTMLDivElement =
    typeof document !== 'undefined'
      ? document.createElement('div')
      : ({ textContent: '' } as HTMLDivElement);

  if (typeof document !== 'undefined') {
    div.textContent = text;
  }

  return div.innerHTML || '';
}

/**
 * Get text summary from HTML
 */
export function getTextSummary(html: string, length: number = 100): string {
  if (typeof document === 'undefined') return '';

  // DOMParser 产出的文档是惰性的：不会加载图片、不会触发 onerror 等事件处理器，
  // 而给（即使游离的）元素赋 innerHTML 会
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body.textContent || '';

  return truncateText(text.replace(/\s+/g, ' '), length);
}

/**
 * Fuzzy search: check if text matches query
 */
export function fuzzySearch(text: string, query: string): boolean {
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
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('[Text] Copy to clipboard failed:', err);
    return false;
  }
}

const textUtils = {
  truncateText,
  escapeHtml,
  getTextSummary,
  fuzzySearch,
  copyToClipboard,
};

export default textUtils;

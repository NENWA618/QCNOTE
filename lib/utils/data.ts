/**
 * Data Processing and Sorting Utilities
 */

import type { NoteItem } from '../storage/types';

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get word frequency from multiple texts
 */
export function getWordFrequency(
  texts: string[],
  limit: number = 20,
): Array<{ word: string; count: number }> {
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
}

/**
 * Sort notes by specified criteria
 */
export function sortNotes(notes: NoteItem[], sortBy: string = 'date'): NoteItem[] {
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
}

/**
 * Get color palette for notes
 */
export function getColorPalette(): string[] {
  return [
    '#dc96b4', // Rose
    '#b0a8c0', // Purple
    '#d8cbcf', // Mauve
    '#f6e0e7', // Pink
    '#9fb1d0', // Blue
    '#c9a8cc', // Lavender
    '#d4b5d1', // Lilac
    '#e5d1e0', // Blush
  ];
}

const dataUtils = {
  generateId,
  getWordFrequency,
  sortNotes,
  getColorPalette,
};

export default dataUtils;

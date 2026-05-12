/**
 * Search Utilities
 * Advanced search with field-specific queries and operators
 */

import type { NoteItem } from '../storage/types';

export interface SearchToken {
  field?: string;
  value: string;
  operator: 'AND' | 'OR' | 'NOT';
}

/**
 * Parse search query into tokens
 * Supports: field:value AND/OR/NOT operators
 */
export function parseSearchQuery(query: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  const parts = query.split(/\s+(AND|OR|NOT)\s+/i);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    if (['AND', 'OR', 'NOT'].includes(part.toUpperCase())) {
      if (i + 1 < parts.length) {
        const nextToken = parseSingleToken(parts[i + 1]);
        nextToken.operator = part.toUpperCase() as 'AND' | 'OR' | 'NOT';
        tokens.push(nextToken);
        i++;
      }
    } else {
      tokens.push(parseSingleToken(part));
    }
  }

  return tokens;
}

/**
 * Parse a single search token
 */
export function parseSingleToken(token: string): SearchToken {
  const fieldMatch = token.match(/^(\w+):(.+)$/);

  if (fieldMatch) {
    const [, field, value] = fieldMatch;
    return { field, value, operator: 'AND' };
  }

  return { value: token, operator: 'AND' };
}

/**
 * Check if date is within range
 */
export function matchesDateRange(timestamp: number, dateRange: string): boolean {
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
}

/**
 * Match a single token against a note
 */
export function matchesSingleToken(note: NoteItem, token: SearchToken): boolean {
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
        return matchesDateRange(note.createdAt, searchValue);
      default:
        return false;
    }
  } else {
    // Global search across all fields
    return (
      note.title.toLowerCase().includes(searchValue) ||
      note.content.toLowerCase().includes(searchValue) ||
      note.tags.some(tag => tag.toLowerCase().includes(searchValue)) ||
      note.category.toLowerCase().includes(searchValue)
    );
  }
}

/**
 * Check if note matches all search tokens
 */
export function matchesSearchTokens(note: NoteItem, tokens: SearchToken[]): boolean {
  let hasOrMatch = false;
  let hasAndMatch = true;

  for (const token of tokens) {
    const matches = matchesSingleToken(note, token);

    if (token.operator === 'OR') {
      if (matches) hasOrMatch = true;
    } else if (token.operator === 'NOT') {
      if (matches) return false;
    } else {
      // AND
      if (!matches) hasAndMatch = false;
    }
  }

  return hasAndMatch && (tokens.some(t => t.operator === 'OR') ? hasOrMatch : true);
}

/**
 * Search notes with advanced query support
 */
export function searchNotes(notes: NoteItem[], query: string): NoteItem[] {
  if (!query.trim()) return notes;

  const tokens = parseSearchQuery(query);
  return notes.filter(note => matchesSearchTokens(note, tokens));
}

export default {
  parseSearchQuery,
  parseSingleToken,
  matchesDateRange,
  matchesSingleToken,
  matchesSearchTokens,
  searchNotes,
};

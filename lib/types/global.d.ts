/* eslint-disable no-unused-vars */
import type { NoteStorage, Stats } from '../storage';
import type { Utils as UtilsType } from '../utils';
import type { NoteUI } from '../ui';

export {};

declare global {
  interface Note {
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
  }

  interface Settings {
    theme: string;
    sortBy: string;
    itemsPerPage: number;
    defaultCategory: string;
  }

  interface Window {
    storage?: NoteStorage;
    Utils?: typeof UtilsType;
    noteUI?: NoteUI;
  }
}

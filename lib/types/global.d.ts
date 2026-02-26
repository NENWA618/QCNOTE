/* eslint-disable no-unused-vars */
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
    storage?: any;
    Utils?: any;
    noteUI?: any;
  }
}

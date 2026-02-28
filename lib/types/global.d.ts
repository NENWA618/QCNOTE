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

// minimal module declaration for 'sentiment' package
declare module 'sentiment' {
  class Sentiment {
    analyze(text: string): { score: number; comparative: number };
  }
  export default Sentiment;
}

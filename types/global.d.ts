import NoteStorage from '@/lib/storage';

declare global {
  interface Window {
    storage?: NoteStorage;
    Utils?: any;
  }
}

export {};

import Utils from './utils';
import IDB from './idb';

export interface NoteItem {
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

export interface UserSettings {
  theme: string;
  sortBy: string;
  itemsPerPage: number;
  defaultCategory: string;
}

export class NoteStorage {
  storageKey: string;
  settingsKey: string;
  useIndexedDB: boolean;

  constructor() {
    this.storageKey = 'NOTE_STORAGE';
    this.settingsKey = 'NOTE_SETTINGS';
    this.useIndexedDB = false;
    this.init();
  }

  // enable IndexedDB backend and migrate existing localStorage data into it
  async enableIndexedDB() {
    if (typeof window === 'undefined') return false;
    try {
      const notes = this.getData() || [];
      const settings = this.getSettings() || null;
      await IDB.setItem(this.storageKey, notes);
      if (settings) await IDB.setItem(this.settingsKey, settings);
      this.useIndexedDB = true;
      return true;
    } catch (e) {
      console.error('启用IndexedDB失败:', e);
      return false;
    }
  }

  // disable IndexedDB usage (keeps data in place)
  disableIndexedDB() {
    this.useIndexedDB = false;
  }

  // async accessors that respect IndexedDB when enabled
  async getDataAsync(): Promise<NoteItem[] | null> {
    try {
      if (this.useIndexedDB) {
        const v = (await IDB.getItem(this.storageKey)) as NoteItem[] | null;
        return v || null;
      }
      return this.getData();
    } catch (e) {
      console.error('读取存储失败:', e);
      return null;
    }
  }

  async setDataAsync(notes: NoteItem[]) {
    try {
      if (this.useIndexedDB) {
        await IDB.setItem(this.storageKey, notes);
        return true;
      }
      return this.setData(notes);
    } catch (e) {
      console.error('保存存储失败:', e);
      return false;
    }
  }

  init() {
    if (!this.getData()) {
      this.setData([]);
    }
    if (!this.getSettings()) {
      this.setSettings({
        theme: 'light',
        sortBy: 'date',
        itemsPerPage: 12,
        defaultCategory: '生活',
      });
    }
  }

  getData(): NoteItem[] | null {
    try {
      const data = typeof window !== 'undefined' ? localStorage.getItem(this.storageKey) : null;
      return data ? (JSON.parse(data) as NoteItem[]) : null;
    } catch (e) {
      console.error('读取存储失败:', e);
      return null;
    }
  }

  setData(notes: NoteItem[]) {
    try {
      if (typeof window !== 'undefined')
        localStorage.setItem(this.storageKey, JSON.stringify(notes));
      return true;
    } catch (e) {
      console.error('保存存储失败:', e);
      return false;
    }
  }

  getSettings(): UserSettings | null {
    try {
      const settings =
        typeof window !== 'undefined' ? localStorage.getItem(this.settingsKey) : null;
      return settings ? (JSON.parse(settings) as UserSettings) : null;
    } catch (e) {
      console.error('读取设置失败:', e);
      return null;
    }
  }

  setSettings(settings: UserSettings) {
    try {
      if (typeof window !== 'undefined')
        localStorage.setItem(this.settingsKey, JSON.stringify(settings));
      return true;
    } catch (e) {
      console.error('保存设置失败:', e);
      return false;
    }
  }

  addNote(note: Partial<NoteItem>) {
    const notes = this.getData() || [];
    const newNote: NoteItem = {
      id: `note_${Date.now()}`,
      title: note.title || '无标题',
      content: note.content || '',
      category: note.category || '生活',
      tags: note.tags || [],
      color: note.color || '#dc96b4',
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isArchived: false,
    };
    notes.unshift(newNote);
    this.setData(notes);
    return newNote;
  }

  updateNote(id: string, updates: Partial<NoteItem>) {
    const notes = this.getData() || [];
    const index = notes.findIndex((n) => n.id === id);
    if (index !== -1) {
      notes[index] = {
        ...notes[index],
        ...updates,
        updatedAt: Date.now(),
      };
      this.setData(notes);
      return notes[index];
    }
    return null;
  }

  deleteNote(id: string) {
    const notes = this.getData() || [];
    const filteredNotes = notes.filter((n) => n.id !== id);
    this.setData(filteredNotes);
    return true;
  }

  getNote(id: string) {
    const notes = this.getData() || [];
    return notes.find((n) => n.id === id);
  }

  searchNotes(keyword?: string) {
    const notes = this.getData() || [];
    if (!keyword) return notes;

    const lowerKeyword = keyword.toLowerCase();
    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(lowerKeyword) ||
        note.content.toLowerCase().includes(lowerKeyword) ||
        note.tags.some((tag) => tag.toLowerCase().includes(lowerKeyword)),
    );
  }

  getNotesByCategory(category: string) {
    const notes = this.getData() || [];
    if (category === 'all') return notes;
    return notes.filter((n) => n.category === category);
  }

  getFavoriteNotes() {
    const notes = this.getData() || [];
    return notes.filter((n) => n.isFavorite);
  }

  toggleFavorite(id: string) {
    const notes = this.getData() || [];
    const note = notes.find((n) => n.id === id);
    if (note) {
      note.isFavorite = !note.isFavorite;
      this.setData(notes);
      return note.isFavorite;
    }
    return null;
  }

  getCategories() {
    const notes = this.getData() || [];
    const categories = new Set(notes.map((n) => n.category));
    return Array.from(categories).sort();
  }

  getAllTags() {
    const notes = this.getData() || [];
    const tagsSet = new Set<string>();
    notes.forEach((note) => {
      note.tags.forEach((tag) => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }

  exportToJSON() {
    const notes = this.getData() || [];
    const dataStr = JSON.stringify(notes, null, 2);
    if (typeof window === 'undefined') return;
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NOTE_backup_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  importFromJSON(file: File) {
    return new Promise<number>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
          const result = e.target?.result as string;
          const notes = JSON.parse(result);
          if (Array.isArray(notes)) {
            this.setData(notes);
            resolve(notes.length);
          } else {
            reject('无效的JSON格式');
          }
        } catch (error: any) {
          reject('导入失败: ' + (error.message || error));
        }
      };
      reader.onerror = () => reject('读取文件失败');
      reader.readAsText(file);
    });
  }

  clearAll() {
    if (typeof window === 'undefined') return false;
    if (confirm('确定要删除所有笔记吗？此操作无法撤销。')) {
      localStorage.removeItem(this.storageKey);
      this.init();
      return true;
    }
    return false;
  }

  getStats() {
    const notes = this.getData() || [];
    const categories = this.getCategories();
    const categoryStats: Record<string, number> = {};

    categories.forEach((cat) => {
      categoryStats[cat] = notes.filter((n) => n.category === cat).length;
    });

    return {
      totalNotes: notes.length,
      favoriteNotes: notes.filter((n) => n.isFavorite).length,
      archivedNotes: notes.filter((n) => n.isArchived).length,
      categories: categoryStats,
      totalTags: this.getAllTags().length,
      createdToday: notes.filter((n) => {
        const today = new Date().toDateString();
        return new Date(n.createdAt).toDateString() === today;
      }).length,
    };
  }
}

export function initWindowStorage() {
  if (typeof window === 'undefined') return null;
  const s = new NoteStorage();
  (window as any).storage = s;
  // optionally expose Utils
  (window as any).Utils = Utils;
  return s;
}

export default NoteStorage;

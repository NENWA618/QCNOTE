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

export interface Stats {
  totalNotes: number;
  favoriteNotes: number;
  archivedNotes: number;
  categories: Record<string, number>;
  totalTags: number;
  createdToday: number;
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
    // 自动检查 IndexedDB 是否可用
    this.detectIndexedDB();
  }

  // 自动检测 IndexedDB 是否已初始化
  async detectIndexedDB() {
    if (typeof window === 'undefined') return;
    try {
      const data = await IDB.getItem(this.storageKey);
      if (data) {
        this.useIndexedDB = true;
        console.log('✓ 检测到 IndexedDB 数据，自动启用');
      }
    } catch (e) {
      // IndexedDB 不可用或出错，保持 useIndexedDB = false
    }
  }

  // enable IndexedDB backend and migrate existing localStorage data into it
  async enableIndexedDB() {
    if (typeof window === 'undefined') return false;
    if (this.useIndexedDB) return true; // 已启用，跳过
    try {
      // 如果 IndexedDB 已有数据，则不要覆盖
      const existing = await IDB.getItem(this.storageKey);
      if (existing && Array.isArray(existing) && existing.length > 0) {
        this.useIndexedDB = true;
        console.log('✓ IndexedDB 已有数据，保留现有数据，启用索引存储');
        return true;
      }

      // 否则从 localStorage 迁移（如果有）
      const notes = this.getData();
      const settings = this.getSettings() || null;
      if (notes && notes.length > 0) {
        // 备份当前 localStorage 内容到 IndexedDB 备份键，防止意外覆盖
        try {
          const backupKey = `${this.storageKey}_backup_${Date.now()}`;
          await IDB.setItem(backupKey, notes);
          console.log('✓ 本地数据已备份到 IndexedDB 键：', backupKey);
        } catch (bkErr) {
          console.warn('备份 localStorage 数据到 IndexedDB 失败，继续迁移：', bkErr);
        }
        await IDB.setItem(this.storageKey, notes);
        if (settings) await IDB.setItem(this.settingsKey, settings);
        this.useIndexedDB = true;
        // 清空 localStorage
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.settingsKey);
        console.log('✓ IndexedDB 已启用，数据迁移成功');
        return true;
      }

      // 两边均无数据：启用 IndexedDB（但不写入空数组）
      this.useIndexedDB = true;
      console.log('✓ IndexedDB 已启用（无需迁移）');
      return true;
    } catch (e: unknown) {
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
      // 优先尝试 IndexedDB（防止竞态条件）
      const idbData = await IDB.getItem(this.storageKey);
      if (idbData) {
        this.useIndexedDB = true; // 确保标志正确设置
        return idbData as NoteItem[];
      }
      // IndexedDB 无数据，尝试 localStorage
      const lsData = this.getData();
      if (lsData) {
        return lsData;
      }
      return null;
    } catch (e) {
      console.error('读取存储失败:', e);
      // IndexedDB 出错，回退到 localStorage
      return this.getData();
    }
  }

  async setDataAsync(notes: NoteItem[]): Promise<boolean> {
    try {
      // 优先 IndexedDB，次之 localStorage
      if (this.useIndexedDB) {
        await IDB.setItem(this.storageKey, notes);
        return true;
      }
      // 尝试写入 IndexedDB（可能在启用过程中）
      try {
        await IDB.setItem(this.storageKey, notes);
        this.useIndexedDB = true;
        // 清空 localStorage
        localStorage.removeItem(this.storageKey);
        return true;
      } catch (_) {
        // IndexedDB 失败，回退到 localStorage
        return this.setData(notes);
      }
    } catch (e) {
      console.error('保存存储失败:', e);
      return false;
    }
  }

  init() {
    // 如果已启用 IndexedDB，跳过 localStorage 初始化
    // 因为数据已经在 IndexedDB 中了
    if (this.useIndexedDB) {
      return;
    }
    
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
    } catch (e: unknown) {
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
    } catch (e: unknown) {
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

  async getSettingsAsync(): Promise<UserSettings | null> {
    try {
      // 优先尝试 IndexedDB
      const idbSettings = await IDB.getItem(this.settingsKey);
      if (idbSettings) {
        this.useIndexedDB = true;
        return idbSettings as UserSettings;
      }
      // IndexedDB 无数据，尝试 localStorage
      return this.getSettings();
    } catch (e) {
      console.error('读取设置失败:', e);
      // IndexedDB 出错，回退到 localStorage
      return this.getSettings();
    }
  }

  async setSettingsAsync(settings: UserSettings) {
    try {
      if (this.useIndexedDB) {
        await IDB.setItem(this.settingsKey, settings);
        return true;
      }
      // 尝试写入 IndexedDB
      try {
        await IDB.setItem(this.settingsKey, settings);
        this.useIndexedDB = true;
        localStorage.removeItem(this.settingsKey);
        return true;
      } catch (_) {
        return this.setSettings(settings);
      }
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

  async addNoteAsync(note: Partial<NoteItem>) {
    const notes = (await this.getDataAsync()) || [];
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
    await this.setDataAsync(notes);
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

  async updateNoteAsync(id: string, updates: Partial<NoteItem>) {
    const notes = (await this.getDataAsync()) || [];
    const index = notes.findIndex((n) => n.id === id);
    if (index !== -1) {
      notes[index] = {
        ...notes[index],
        ...updates,
        updatedAt: Date.now(),
      };
      await this.setDataAsync(notes);
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

  async deleteNoteAsync(id: string) {
    const notes = (await this.getDataAsync()) || [];
    const filteredNotes = notes.filter((n) => n.id !== id);
    await this.setDataAsync(filteredNotes);
    return true;
  }

  getNote(id: string) {
    const notes = this.getData() || [];
    return notes.find((n) => n.id === id);
  }

  async getNoteAsync(id: string) {
    const notes = (await this.getDataAsync()) || [];
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

  async searchNotesAsync(keyword?: string) {
    const notes = (await this.getDataAsync()) || [];
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

  async toggleFavoriteAsync(id: string): Promise<boolean | null> {
    const notes = (await this.getDataAsync()) || [];
    const note = notes.find((n) => n.id === id);
    if (note) {
      note.isFavorite = !note.isFavorite;
      await this.setDataAsync(notes);
      return note.isFavorite;
    }
    return null;
  }

  getCategories() {
    const notes = this.getData() || [];
    const categories = new Set(notes.map((n) => n.category));
    return Array.from(categories).sort();
  }

  async getCategoriesAsync() {
    const notes = (await this.getDataAsync()) || [];
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

  async getAllTagsAsync() {
    const notes = (await this.getDataAsync()) || [];
    const tagsSet = new Set<string>();
    notes.forEach((note) => {
      note.tags.forEach((tag) => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
  }

  async exportToJSON() {
    const notes = (await this.getDataAsync()) || [];
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
            if (this.useIndexedDB) {
              IDB.setItem(this.storageKey, notes).then(() => resolve(notes.length));
            } else {
              this.setData(notes);
              resolve(notes.length);
            }
          } else {
            reject('无效的JSON格式');
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          reject('导入失败: ' + msg);
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

  async clearAllAsync() {
    if (typeof window === 'undefined') return false;
    // avoid confirm inside storage layer? we can keep it for parity
    if (confirm('确定要删除所有笔记吗？此操作无法撤销。')) {
      if (this.useIndexedDB) {
        await IDB.clearStore();
        // IndexedDB data removed; leave storage keys alone
      } else {
        localStorage.removeItem(this.storageKey);
      }
      this.init();
      return true;
    }
    return false;
  }

  getStats(): Stats {
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

  async getStatsAsync(): Promise<Stats> {
    const notes = (await this.getDataAsync()) || [];
    const categories = await this.getCategoriesAsync();
    const categoryStats: Record<string, number> = {};

    categories.forEach((cat) => {
      categoryStats[cat] = notes.filter((n) => n.category === cat).length;
    });

    return {
      totalNotes: notes.length,
      favoriteNotes: notes.filter((n) => n.isFavorite).length,
      archivedNotes: notes.filter((n) => n.isArchived).length,
      categories: categoryStats,
      totalTags: (await this.getAllTagsAsync()).length,
      createdToday: notes.filter((n) => {
        const today = new Date().toDateString();
        return new Date(n.createdAt).toDateString() === today;
      }).length,
    };
  }
}

export function initWindowStorage() {
  if (typeof window === 'undefined') return null;
  // 检查是否已经存在全局 storage，避免重复创建
  if (window.storage instanceof NoteStorage) {
    return window.storage;
  }
  const s = new NoteStorage();
  window.storage = s;
  // optionally expose Utils
  window.Utils = Utils;
  return s;
}

export default NoteStorage;

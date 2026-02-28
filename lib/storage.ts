import Utils from './utils';
import IDB from './idb';
import logger from './logger';

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

  private _warnSyncUsage(method: string) {
    if (typeof window !== 'undefined') {
      // keep message concise to aid debugging during migration
      console.warn(`[NoteStorage] Deprecated sync method used: ${method}. Prefer using the async variant (e.g. ${method}Async).`);
    }
  }

  // 自动检测 IndexedDB 是否已初始化
  async detectIndexedDB() {
    if (typeof window === 'undefined') return;
    try {
      const data = await IDB.getItem(this.storageKey);
      if (data) {
        this.useIndexedDB = true;
        logger.info('✓ 检测到 IndexedDB 数据，自动启用');
      }
    } catch (e) {
      // IndexedDB 不可用或出错，保持 useIndexedDB = false
    }
  }
  /**
   * Internal helpers for localStorage access.
   *
   * These used to be the public sync methods (getData/setData)
   * but those have been removed from the public API.  We keep
   * private helpers here so that the async methods can fall back
   * to localStorage when IndexedDB is unavailable.  They are
   * intentionally not exported or documented.
   */
  private _getDataLocal(): NoteItem[] | null {
    const raw = localStorage.getItem(this.storageKey);
    return raw ? (JSON.parse(raw) as NoteItem[]) : null;
  }

  private _setDataLocal(notes: NoteItem[]): boolean {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(notes));
      return true;
    } catch (e) {
      console.error('[NoteStorage] _setDataLocal failed', e);
      return false;
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
        logger.info('✓ IndexedDB 已有数据，保留现有数据，启用索引存储');
        return true;
      }

      // 否则从 localStorage 迁移（如果有）
      const notes = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
      const settings = JSON.parse(localStorage.getItem(this.settingsKey) || 'null');
      if (notes && Array.isArray(notes) && notes.length > 0) {
        // 备份当前 localStorage 内容到 IndexedDB 备份键，防止意外覆盖
        try {
          const backupKey = `${this.storageKey}_backup_${Date.now()}`;
          await IDB.setItem(backupKey, notes);
          logger.info('✓ 本地数据已备份到 IndexedDB 键：', backupKey);
        } catch (bkErr) {
          console.warn('备份 localStorage 数据到 IndexedDB 失败，继续迁移：', bkErr);
        }
        await IDB.setItem(this.storageKey, notes);
        if (settings) await IDB.setItem(this.settingsKey, settings);
        this.useIndexedDB = true;
        // 清空 localStorage
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.settingsKey);
        logger.info('✓ IndexedDB 已启用，数据迁移成功');
        return true;
      }

      // 两边均无数据：启用 IndexedDB（但不写入空数组）
      this.useIndexedDB = true;
        logger.info('✓ IndexedDB 已启用（无需迁移）');
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
      const lsData = this._getDataLocal();
      if (lsData) {
        return lsData;
      }
      return null;
    } catch (e) {
      console.error('读取存储失败:', e);
      // IndexedDB 出错，回退到 localStorage
      return this._getDataLocal();
    }
  }

  async setDataAsync(notes: NoteItem[]): Promise<boolean> {
    try {
      // 优先 IndexedDB，次之 localStorage
      if (this.useIndexedDB) {
        await IDB.setItem(this.storageKey, notes);
      } else {
        // 尝试写入 IndexedDB（可能在启用过程中）
        try {
          await IDB.setItem(this.storageKey, notes);
          this.useIndexedDB = true;
          // 清空 localStorage
          localStorage.removeItem(this.storageKey);
        } catch (_) {
          // IndexedDB 失败，回退到本地 localStorage
          this._setDataLocal(notes);
        }
      }

      // 一旦本地数据写入成功，尝试同步到服务器（如果可用）
      this.syncWithServer(notes).catch((err) => {
        // 静默失败，服务器可能离线
        logger.warn('[NoteStorage] 同步服务器失败', err);
      });
      return true;
    } catch (e) {
      console.error('保存存储失败:', e);
      return false;
    }
  }

  // 尝试将单条或多条笔记发送给后端
  private async syncWithServer(notes?: NoteItem[] | NoteItem) {
    if (typeof window === 'undefined') return;
    const url = '/syncNote';
    try {
      if (!notes) {
        const all = await this.getDataAsync();
        if (!all) return;
        notes = all;
      }
      const list = Array.isArray(notes) ? notes : [notes];
      // send requests in parallel; avoid throwing for individual failures
      await Promise.allSettled(
        list.map((note) =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(note),
          })
        )
      );
    } catch (e) {
      console.debug('[NoteStorage] 无法同步到服务器', e);
    }
  }

  init() {
    // 如果已启用 IndexedDB，跳过 localStorage 初始化
    // 因为数据已经在 IndexedDB 中了
    if (this.useIndexedDB) {
      return;
    }
    
    if (!localStorage.getItem(this.storageKey)) {
      localStorage.setItem(this.storageKey, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.settingsKey)) {
      localStorage.setItem(
        this.settingsKey,
        JSON.stringify({
          theme: 'light',
          sortBy: 'date',
          itemsPerPage: 12,
          defaultCategory: '生活',
        })
      );
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
      const settings = localStorage.getItem(this.settingsKey);
      return settings ? (JSON.parse(settings) as UserSettings) : null;
    } catch (e) {
      console.error('读取设置失败:', e);
      const settings = localStorage.getItem(this.settingsKey);
      return settings ? (JSON.parse(settings) as UserSettings) : null;
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
        // fallback to localStorage
        localStorage.setItem(this.settingsKey, JSON.stringify(settings));
        return true;
      }
    } catch (e) {
      console.error('保存设置失败:', e);
      return false;
    }
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


  async deleteNoteAsync(id: string) {
    const notes = (await this.getDataAsync()) || [];
    const filteredNotes = notes.filter((n) => n.id !== id);
    await this.setDataAsync(filteredNotes);
    return true;
  }


  async getNoteAsync(id: string) {
    const notes = (await this.getDataAsync()) || [];
    return notes.find((n) => n.id === id);
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


  async getNotesByCategoryAsync(category: string) {
    const notes = (await this.getDataAsync()) || [];
    if (category === 'all') return notes;
    return notes.filter((n) => n.category === category);
  }


  async getFavoriteNotesAsync() {
    const notes = (await this.getDataAsync()) || [];
    return notes.filter((n) => n.isFavorite);
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


  async getCategoriesAsync() {
    const notes = (await this.getDataAsync()) || [];
    const categories = new Set(notes.map((n) => n.category));
    return Array.from(categories).sort();
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
              this._setDataLocal(notes);
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


  async clearAllAsync() {
    if (typeof window === 'undefined') return false;
    // Storage layer should not perform UI confirmation prompts.
    if (this.useIndexedDB) {
      await IDB.clearStore();
      // IndexedDB data removed; leave storage keys alone
    } else {
      localStorage.removeItem(this.storageKey);
    }
    this.init();
    return true;
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

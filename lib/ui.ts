import { initWindowStorage, NoteItem, NoteStorage, UserSettings, Stats } from './storage';
import Utils from './utils';

export class NoteUI {
  // declare typed storage to avoid repeated casts
  storage?: NoteStorage;
  currentNoteId: string | null = null;
  selectedCategory = 'all';
  searchKeyword = '';

  constructor() {
    this.init();
  }

  init() {
    if (typeof window !== 'undefined' && !window.storage) {
      initWindowStorage();
    }
    this.setupEventListeners();
    // 首次渲染（异步）
    this.renderNotesListAsync();
  }

  setupEventListeners() {
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        this.searchKeyword = target.value;
        this.renderNotesListAsync();
      });
    }

    const categoryFilter = document.getElementById('category-filter') as HTMLSelectElement | null;
    if (categoryFilter) {
      categoryFilter.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;
        this.selectedCategory = target.value;
        this.renderNotesListAsync();
      });
    }

    const sortSelect = document.getElementById('sort-select') as HTMLSelectElement | null;
    if (sortSelect) {
      sortSelect.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLSelectElement;
        localStorage.setItem('QCNOTE_SORT', target.value);
        this.renderNotesListAsync();
      });
    }

    const newNoteBtn = document.getElementById('new-note-btn') as HTMLElement | null;
    if (newNoteBtn) {
      newNoteBtn.addEventListener('click', () => { void this.createNewNote(); });
    }

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        this.createNewNote();
      }
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (searchInput) searchInput.focus();
      }
    });
  }

  async renderNotesListAsync() {
    const container = document.getElementById('notes-container') as HTMLElement | null;
    if (!container) return;

    const storage = window.storage as NoteStorage | undefined;
    if (!storage) return; // nothing we can do without storage
    this.storage = storage;
    let notes: NoteItem[] = (await storage.getDataAsync()) || [];

    if (this.searchKeyword) {
      notes = await storage.searchNotesAsync(this.searchKeyword);
    }

    if (this.selectedCategory !== 'all') {
      notes = notes.filter((n) => n.category === this.selectedCategory);
    }

    const sortBy = localStorage.getItem('QCNOTE_SORT') || 'date';
    notes = Utils.sortNotes(notes, sortBy);

    container.innerHTML = '';

    if (notes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>还没有笔记呢</p>
          <p>点击下方按钮创建第一条笔记吧 �?/p>
        </div>
      `;
      return;
    }

    notes.forEach((note: NoteItem) => {
      const card = this.createNoteCard(note);
      container.appendChild(card);
    });
  }

  /**
   * 旧版同步渲染逻辑，已弃用。使用 renderNotesListAsync 代替。
   */
  renderNotesList() {
    // Delegate to async implementation to avoid duplicating logic and sync calls.
    void this.renderNotesListAsync();
  }

  createNoteCard(note: NoteItem) {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.style.borderLeftColor = note.color;

    const summary = Utils.getTextSummary(note.content, 80);
    const date = Utils.getRelativeTime(note.updatedAt);

    card.innerHTML = `
      <div class="note-card-header">
        <h3 class="note-title">${Utils.escapeHtml(note.title)}</h3>
        <button class="favorite-btn ${note.isFavorite ? 'active' : ''}" 
                title="${note.isFavorite ? '取消收藏' : '收藏'}">
          <span class="heart-icon">${note.isFavorite ? '❤️' : '🤍'}</span>
        </button>
      </div>

      <p class="note-preview">${Utils.escapeHtml(summary)}</p>

      <div class="note-meta">
        <span class="category-badge">${note.category}</span>
        <span class="note-date">${date}</span>
      </div>

      ${
        note.tags.length > 0
          ? `
        <div class="note-tags">
          ${note.tags.map((tag: string) => `<span class="tag">#${tag}</span>`).join('')}
        </div>
      `
          : ''
      }

      <div class="note-actions">
        <button class="btn-icon edit-btn" title="编辑">✏️</button>
        <button class="btn-icon delete-btn" title="删除">🗑️</button>
      </div>
    `;

    const favBtn = card.querySelector('.favorite-btn') as HTMLElement | null;
    favBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.storage?.toggleFavoriteAsync?.(note.id);
      this.renderNotesListAsync();
    });

    const editBtn = card.querySelector('.edit-btn') as HTMLElement | null;
    editBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.editNote(note.id);
    });

    const deleteBtn = card.querySelector('.delete-btn') as HTMLElement | null;
    deleteBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('确定要删除这条笔记吗？')) {
        await this.storage?.deleteNoteAsync?.(note.id);
        this.renderNotesListAsync();
      }
    });

    card.addEventListener('click', () => this.editNote(note.id));

    return card;
  }

  async createNewNote() {
    // create note using storage type guarantees
    const settings = await this.storage?.getSettingsAsync?.() as UserSettings | undefined;
    const defaultCat = settings?.defaultCategory ||
      localStorage.getItem('QCNOTE_DEFAULT_CATEGORY') ||
      '生活';
    const note = await this.storage?.addNoteAsync({
      title: '新笔记',
      content: '',
      category: defaultCat,
    });
    if (note) {
      this.editNote(note.id);
    }
  }

  async editNote(noteId: string) {
    this.currentNoteId = noteId;
    const note = await this.storage?.getNoteAsync?.(noteId);
    if (!note) return;

    const editorPanel = document.getElementById('editor-panel') as HTMLElement | null;
    if (editorPanel) {
      editorPanel.style.display = 'flex';
      this.loadNoteIntoEditor(note);
    }
  }

  loadNoteIntoEditor(note: NoteItem) {
    const titleInput = document.getElementById('note-title-input') as HTMLInputElement | null;
    const contentInput = document.getElementById(
      'note-content-input',
    ) as HTMLTextAreaElement | null;
    const categorySelect = document.getElementById(
      'note-category-select',
    ) as HTMLSelectElement | null;
    const tagsInput = document.getElementById('note-tags-input') as HTMLInputElement | null;

    if (titleInput) titleInput.value = note.title;
    if (contentInput) contentInput.value = note.content;
    if (categorySelect) categorySelect.value = note.category;
    if (tagsInput) tagsInput.value = note.tags.join(', ');
  }

  async saveCurrentNote() {
    if (!this.currentNoteId) return;

    const titleInput = document.getElementById('note-title-input') as HTMLInputElement | null;
    const contentInput = document.getElementById(
      'note-content-input',
    ) as HTMLTextAreaElement | null;
    const categorySelect = document.getElementById(
      'note-category-select',
    ) as HTMLSelectElement | null;
    const tagsInput = document.getElementById('note-tags-input') as HTMLInputElement | null;

    const title = titleInput?.value?.trim() || '无标题';
    const content = contentInput?.value || '';
    const category = categorySelect?.value || '生活';
    const tags =
      tagsInput?.value
        ?.split(',')
        .map((t) => t.trim())
        .filter((t) => t) || [];

    await this.storage?.updateNoteAsync?.(this.currentNoteId, {
      title,
      content,
      category,
      tags,
    });

    this.showNotification('笔记已保存 ✓');
    this.renderNotesListAsync();
  }

  async closeEditor() {
    await this.saveCurrentNote();
    const editorPanel = document.getElementById('editor-panel') as HTMLElement | null;
    if (editorPanel) {
      editorPanel.style.display = 'none';
    }
    this.currentNoteId = null;
  }

  async updateCategoryFilter() {
    const categories = await this.storage?.getCategoriesAsync?.();
    const filterSelect = document.getElementById('category-filter') as HTMLSelectElement | null;
    if (!filterSelect || !categories) return;

    filterSelect.innerHTML = '<option value="all">全部分类</option>';
    categories.forEach((cat: string) => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      filterSelect.appendChild(option);
    });
  }

  showNotification(message: string, duration = 2000) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  async updateStats() {
    const stats: Stats | undefined = await this.storage?.getStatsAsync?.();
    if (!stats) return;
    const statsContainer = document.getElementById('stats-container') as HTMLElement | null;
    if (!statsContainer) return;

    statsContainer.innerHTML = `
      <div class="stat-item">
        <span class="stat-value">${stats.totalNotes}</span>
        <span class="stat-label">笔记总数</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${stats.favoriteNotes}</span>
        <span class="stat-label">收藏�?/span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${stats.totalTags}</span>
        <span class="stat-label">标签�?/span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${stats.createdToday}</span>
        <span class="stat-label">今日新增</span>
      </div>
    `;
  }
}

export function initNoteUI() {
  if (typeof document === 'undefined') return null;
  if (!document.getElementById('notes-container')) return null;
  const ui = new NoteUI();
  // NOTE: do not attach `noteUI` to window anymore �?prefer importing the module
  // for React-driven components. Returning the instance for compatibility.
  return ui;
}

export default NoteUI;

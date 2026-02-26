import { initWindowStorage } from './storage';
import Utils from './utils';

export class NoteUI {
  currentNoteId: string | null = null;
  selectedCategory = 'all';
  searchKeyword = '';

  constructor() {
    this.init();
  }

  init() {
    if (typeof window !== 'undefined' && !(window as any).storage) {
      initWindowStorage();
    }
    this.setupEventListeners();
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
        localStorage.setItem('NOTE_SORT', target.value);
        this.renderNotesListAsync();
      });
    }

    const newNoteBtn = document.getElementById('new-note-btn') as HTMLElement | null;
    if (newNoteBtn) {
      newNoteBtn.addEventListener('click', () => this.createNewNote());
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

    const storage = (window as any).storage;
    let notes = (await storage?.getDataAsync?.()) || [];

    if (this.searchKeyword) {
      notes = await storage.searchNotesAsync(this.searchKeyword);
    }

    if (this.selectedCategory !== 'all') {
      notes = notes.filter((n: any) => n.category === this.selectedCategory);
    }

    const sortBy = localStorage.getItem('NOTE_SORT') || 'date';
    notes = Utils.sortNotes(notes, sortBy);

    container.innerHTML = '';

    if (notes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>还没有笔记呢</p>
          <p>点击下方按钮创建第一条笔记吧 ✨</p>
        </div>
      `;
      return;
    }

    notes.forEach((note: any) => {
      const card = this.createNoteCard(note);
      container.appendChild(card);
    });
  }

  renderNotesList() {
    const container = document.getElementById('notes-container') as HTMLElement | null;
    if (!container) return;

    const storage = (window as any).storage;
    let notes = storage?.getData() || [];

    if (this.searchKeyword) {
      notes = storage.searchNotes(this.searchKeyword);
    }

    if (this.selectedCategory !== 'all') {
      notes = notes.filter((n: any) => n.category === this.selectedCategory);
    }

    const sortBy = localStorage.getItem('NOTE_SORT') || 'date';
    notes = Utils.sortNotes(notes, sortBy);

    container.innerHTML = '';

    if (notes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>还没有笔记呢</p>
          <p>点击下方按钮创建第一条笔记吧 ✨</p>
        </div>
      `;
      return;
    }

    notes.forEach((note: any) => {
      const card = this.createNoteCard(note);
      container.appendChild(card);
    });
  }

  createNoteCard(note: any) {
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
    favBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      (window as any).storage.toggleFavorite(note.id);
      this.renderNotesListAsync();
    });

    const editBtn = card.querySelector('.edit-btn') as HTMLElement | null;
    editBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editNote(note.id);
    });

    const deleteBtn = card.querySelector('.delete-btn') as HTMLElement | null;
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('确定要删除这条笔记吗？')) {
        (window as any).storage.deleteNote(note.id);
        this.renderNotesListAsync();
      }
    });

    card.addEventListener('click', () => this.editNote(note.id));

    return card;
  }

  createNewNote() {
    const note = (window as any).storage.addNote({
      title: '新笔记',
      content: '',
      category: localStorage.getItem('NOTE_DEFAULT_CATEGORY') || '生活',
    });
    this.editNote(note.id);
  }

  editNote(noteId: string) {
    this.currentNoteId = noteId;
    const note = (window as any).storage.getNote(noteId);
    if (!note) return;

    const editorPanel = document.getElementById('editor-panel') as HTMLElement | null;
    if (editorPanel) {
      editorPanel.style.display = 'flex';
      this.loadNoteIntoEditor(note);
    }
  }

  loadNoteIntoEditor(note: any) {
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

  saveCurrentNote() {
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

    (window as any).storage.updateNote(this.currentNoteId, {
      title,
      content,
      category,
      tags,
    });

    this.showNotification('笔记已保存 ✓');
    this.renderNotesListAsync();
  }

  closeEditor() {
    this.saveCurrentNote();
    const editorPanel = document.getElementById('editor-panel') as HTMLElement | null;
    if (editorPanel) {
      editorPanel.style.display = 'none';
    }
    this.currentNoteId = null;
  }

  updateCategoryFilter() {
    const categories = (window as any).storage.getCategories();
    const filterSelect = document.getElementById('category-filter') as HTMLSelectElement | null;
    if (!filterSelect) return;

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

  updateStats() {
    const stats = (window as any).storage.getStats();
    const statsContainer = document.getElementById('stats-container') as HTMLElement | null;
    if (!statsContainer) return;

    statsContainer.innerHTML = `
      <div class="stat-item">
        <span class="stat-value">${stats.totalNotes}</span>
        <span class="stat-label">笔记总数</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${stats.favoriteNotes}</span>
        <span class="stat-label">收藏数</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${stats.totalTags}</span>
        <span class="stat-label">标签数</span>
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
  // NOTE: do not attach `noteUI` to window anymore — prefer importing the module
  // for React-driven components. Returning the instance for compatibility.
  return ui;
}

export default NoteUI;

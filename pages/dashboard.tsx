import Head from 'next/head';
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import Footer from '../components/Footer';
import NoteList from '../components/NoteList';
import NoteEditor from '../components/NoteEditor';
import NoteStats from '../components/NoteStats';
import ImportExport from '../components/ImportExport';
import { Trash } from '../components/Trash';
import { Calendar } from '../components/Calendar';
import { Timeline } from '../components/Timeline';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import WebDAVSync from '../components/WebDAVSync';
import Conflicts from '../components/Conflicts';
import TagManager from '../components/TagManager';
import OneDriveSync from '../components/OneDriveSync';
import WebDAVSyncManager from '../lib/webdavSyncManager';
import { NoteItem, NoteStorage, Stats, NoteVersion, WebDAVConfig, NoteConflict, initWindowStorage } from '../lib/storage';

const Dashboard: React.FC = () => {
  const storageRef = useRef<NoteStorage | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [categories, setCategories] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalNotes: 0,
    favoriteNotes: 0,
    archivedNotes: 0,
    categories: {},
    totalTags: 0,
    createdToday: 0,
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewingTrash, setViewingTrash] = useState(false);
  const [trashNotes, setTrashNotes] = useState<NoteItem[]>([]);
  const [conflicts, setConflicts] = useState<NoteConflict[]>([]);  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'timeline' | 'graph' | 'conflicts' | 'tags'>('list');
  const [webdavConfig, setWebdavConfig] = useState({
    url: '',
    username: '',
    password: '',
    remotePath: 'notes.json',
    encryptionKey: '',
    autoSyncEnabled: false,
    syncInterval: 5 * 60 * 1000, // 5 minutes default
    conflictStrategy: 'manual' as 'manual' | 'prefer-local' | 'prefer-remote',
  });
  const [onedriveConfig, setOnedriveConfig] = useState({
    clientId: '',
    tenantId: '',
    accessToken: '',
    folderPath: 'Notes',
  });
  const [noteCache, setNoteCache] = useState<Map<string, NoteItem>>(new Map());
  const [searchCache, setSearchCache] = useState<Map<string, NoteItem[]>>(new Map());
  const [syncManager, setSyncManager] = useState<WebDAVSyncManager | null>(null);

  // Editor state
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const s = initWindowStorage() || new NoteStorage();
    storageRef.current = s;
    setSyncManager(new WebDAVSyncManager(s));
    loadNotes();
  }, []);

  // Auto-sync effect
  useEffect(() => {
    if (!webdavConfig.autoSyncEnabled || !storageRef.current) return;

    const interval = setInterval(async () => {
      const s = storageRef.current;
      if (!s) return;

      // Skip if there are unresolved conflicts
      const currentConflicts = await s.getConflictsAsync();
      if (currentConflicts.length > 0) {
        console.log('[Auto-sync] Skipping due to unresolved conflicts');
        return;
      }

      // Perform sync
      const config = { ...webdavConfig };
      const pushResult = await s.pushToWebDAVAsync(config, Boolean(config.encryptionKey));
      if (pushResult) {
        const pullResult = await s.pullFromWebDAVAsync(config, Boolean(config.encryptionKey));
        if (pullResult) {
          setLastSyncTime(Date.now());
          await loadNotes(); // Refresh data
        }
      }
    }, webdavConfig.syncInterval);

    return () => clearInterval(interval);
  }, [webdavConfig.autoSyncEnabled, webdavConfig.syncInterval]);

  const loadNotes = async () => {
    const s = storageRef.current;
    if (!s) return;
    const all = (await s.getDataAsync()) || [];

    // 更新缓存
    const newCache = new Map();
    all.forEach(note => newCache.set(note.id, note));
    setNoteCache(newCache);

    setNotes(all);
    setCategories(await s.getCategoriesAsync());
    setStats(await s.getStatsAsync());

    // Load WebDAV 配置
    const config = await s.getWebDAVConfigAsync();
    if (config) {
      setWebdavConfig({
        url: config.url,
        username: config.username,
        password: config.password,
        remotePath: config.remotePath,
        encryptionKey: config.encryptionKey || '',
        autoSyncEnabled: config.autoSyncEnabled || false,
        syncInterval: config.syncInterval || 5 * 60 * 1000,
        conflictStrategy: config.conflictStrategy || 'manual',
      });
      setLastSyncTime(config.lastSyncTime || null);
    }

    // Load trash notes
    const trash = await s.getTrashNotesAsync();
    setTrashNotes(trash);

    // Load conflicts
    const conflicts = await s.getConflictsAsync();
    setConflicts(conflicts);
  };

  // Filtered and sorted notes
  const filteredNotes = useMemo(() => {
    let filtered = notes;

    // Exclude deleted notes from regular view
    if (!viewingTrash) {
      filtered = filtered.filter((n) => !n.isDeleted);
    }

    // Search filter
    if (search) {
      filtered = Utils.searchNotes(filtered, search);
    }

    // Category filter
    if (category !== 'all' && !viewingTrash) {
      filtered = filtered.filter(note => note.category === category);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return b.updatedAt - a.updatedAt;
        case 'title':
          return a.title.localeCompare(b.title);
        case 'category':
          return (a.category || '').localeCompare(b.category || '');
        default:
          return 0;
      }
    });

    return filtered;
  }, [notes, search, category, sortBy, viewingTrash]);

  const relatedNotes = useMemo(() => {
    if (!editingNote) return [];

    const linkTargets = new Set<string>();
    (editingNote.links || []).forEach((title) => {
      const target = notes.find((n) => n.title === title);
      if (target) linkTargets.add(target.id);
    });
    (editingNote.backlinks || []).forEach((id) => linkTargets.add(id));

    return notes.filter((note) => linkTargets.has(note.id));
  }, [editingNote, notes]);

  const handleNewNote = async () => {
    const s = storageRef.current;
    if (!s) return;
    const newNote = await s.addNoteAsync({ title: '新笔记', content: '' });
    await loadNotes();
    setEditingNote(newNote);
    setEditorVisible(true);
    setIsPreview(false);
  };

  const handleEditNote = (note: NoteItem) => {
    setEditingNote(note);
    setEditorVisible(true);
    setIsPreview(false);
  };

  const handleSaveNote = async () => {
    const s = storageRef.current;
    if (!s || !editingNote) return;
    await s.updateNoteAsync(editingNote.id, editingNote);
    await loadNotes();
    setEditorVisible(false);
    setEditingNote(null);
  };

  const handleDeleteNote = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    await s.deleteNoteAsync(id);
    await loadNotes();
  };

  const handleToggleFavorite = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    const note = notes.find(n => n.id === id);
    if (note) {
      await s.updateNoteAsync(id, { ...note, isFavorite: !note.isFavorite });
      await loadNotes();
    }
  };

  const handleToggleArchive = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    const note = notes.find(n => n.id === id);
    if (note) {
      await s.updateNoteAsync(id, { ...note, isArchived: !note.isArchived });
      await loadNotes();
    }
  };

  const handleExport = async () => {
    const s = storageRef.current;
    if (!s) return;
    await s.exportToJSON();
  };

  const handleImport = async (file: File) => {
    const s = storageRef.current;
    if (!s) return;
    try {
      const count = await s.importFromJSON(file);
      await loadNotes();
      alert(`成功导入 ${count} 条笔记`);
    } catch (err) {
      alert(String(err) || '导入失败');
    }
  };

  const handleClearAll = async () => {
    const s = storageRef.current;
    if (!s) return;
    if (confirm('确定要删除所有笔记吗？此操作无法撤销。')) {
      await s.clearAllAsync();
      await loadNotes();
    }
  };

  const handleSaveWebdavConfig = async (config: WebDAVConfig) => {
    const s = storageRef.current;
    if (!s) return false;
    const fullConfig = { ...config, lastSyncTime };
    const result = await s.setWebDAVConfigAsync(fullConfig);
    if (result) {
      setWebdavConfig({
        url: config.url,
        username: config.username,
        password: config.password,
        remotePath: config.remotePath,
        encryptionKey: config.encryptionKey || '',
        autoSyncEnabled: config.autoSyncEnabled || false,
        syncInterval: config.syncInterval || 5 * 60 * 1000,
        conflictStrategy: config.conflictStrategy || 'manual',
      });
    }
    return result;
  };

  const handleWebdavConfigChange = async (config: WebDAVConfig) => {
    if (syncManager) {
      await syncManager.updateConfig(config);
    }
  };

  const handleWebdavPush = async (config: WebDAVConfig) => {
    const s = storageRef.current;
    if (!s) return false;
    return s.pushToWebDAVAsync(config, Boolean(config.encryptionKey));
  };

  const handleWebdavPull = async (config: WebDAVConfig) => {
    const s = storageRef.current;
    if (!s) return false;
    const result = await s.pullFromWebDAVAsync(config, Boolean(config.encryptionKey));
    if (result) await loadNotes();
    return result;
  };

  const handleOneDriveSync = async () => {
    // OneDrive sync logic would go here
    await loadNotes();
  };

  const handleSaveOneDriveConfig = (config: any) => {
    setOnedriveConfig(config);
    // Save to storage
  };

  const handleRestoreNote = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    await s.restoreNoteAsync(id);
    await loadNotes();
  };

  const handlePermanentlyDeleteNote = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    await s.permanentlyDeleteNoteAsync(id);
    await loadNotes();
  };

  const handleResolveConflict = async (id: string, resolvedNote: NoteItem) => {
    const s = storageRef.current;
    if (!s) return;
    await s.resolveConflictAsync(id, resolvedNote);
    await loadNotes();
  };

  const handleTagRename = async (oldTag: string, newTag: string) => {
    const s = storageRef.current;
    if (!s) return;

    const updatedNotes = notes.map(note => ({
      ...note,
      tags: note.tags?.map(tag => tag === oldTag ? newTag : tag) || []
    }));

    await s.setDataAsync(updatedNotes);
    await loadNotes();
  };

  const handleTagDelete = async (tagToDelete: string) => {
    const s = storageRef.current;
    if (!s) return;

    const updatedNotes = notes.map(note => ({
      ...note,
      tags: note.tags?.filter(tag => tag !== tagToDelete) || []
    }));

    await s.setDataAsync(updatedNotes);
    await loadNotes();
  };

  const handleBulkTagOperation = async (operation: 'add' | 'remove', tag: string, noteIds: string[]) => {
    const s = storageRef.current;
    if (!s) return;

    const updatedNotes = notes.map(note => {
      if (!noteIds.includes(note.id)) return note;

      const currentTags = note.tags || [];
      let newTags: string[];

      if (operation === 'add') {
        newTags = currentTags.includes(tag) ? currentTags : [...currentTags, tag];
      } else {
        newTags = currentTags.filter(t => t !== tag);
      }

      return { ...note, tags: newTags };
    });

    await s.setDataAsync(updatedNotes);
    await loadNotes();
  };

  const handleRevertVersion = async (version: NoteVersion) => {
    const s = storageRef.current;
    if (!s || !editingNote) return;
    
    const revertedNote: NoteItem = {
      ...editingNote,
      title: version.title,
      content: version.content,
      category: version.category,
      tags: version.tags,
      color: version.color,
      isFavorite: version.isFavorite,
      isArchived: version.isArchived,
      updatedAt: Date.now(),
    };
    
    await s.updateNoteAsync(editingNote.id, revertedNote);
    await loadNotes();
    alert('✅ 成功恢复到版本！');
  };

  return (
    <>
      <Head>
        <title>笔记管理 - NOTE</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta charSet="utf-8" />
      </Head>

      <Header />

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          categories={categories}
          stats={stats}
          currentCategory={category}
          onCategoryChange={setCategory}
        />

        {/* Main Content */}
        <main className="flex-1 p-6">
          {/* Header Controls */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4 flex-1">
              {/* Search */}
              <div className="flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="搜索笔记... (支持 title:关键词 content:内容 tag:标签 date:2024-01-01)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  title="高级搜索语法：title:关键词, content:内容, tag:标签, category:分类, date:2024-01-01 或 date:2024-01-01..2024-12-31。支持 AND/OR/NOT 操作符。"
                />
              </div>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="date">按时间排序</option>
                <option value="title">按标题排序</option>
                <option value="category">按分类排序</option>
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setViewingTrash(!viewingTrash)}
                className={`btn-secondary flex items-center gap-1 ${
                  viewingTrash ? 'bg-red-100 text-red-600' : ''
                }`}
              >
                🗑️ 回收站 {trashNotes.length > 0 ? `(${trashNotes.length})` : ''}
              </button>
              {!viewingTrash && (
                <>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`btn-secondary flex items-center gap-1 ${
                      viewMode === 'list' ? 'bg-blue-100 text-blue-600' : ''
                    }`}
                  >
                    📝 列表
                  </button>
                  <button
                    onClick={() => setViewMode('calendar')}
                    className={`btn-secondary flex items-center gap-1 ${
                      viewMode === 'calendar' ? 'bg-blue-100 text-blue-600' : ''
                    }`}
                  >
                    📅 日历
                  </button>
                  <button
                    onClick={() => setViewMode('timeline')}
                    className={`btn-secondary flex items-center gap-1 ${
                      viewMode === 'timeline' ? 'bg-blue-100 text-blue-600' : ''
                    }`}
                  >
                    📊 时间线
                  </button>
                  <button
                    onClick={() => setViewMode('graph')}
                    className={`btn-secondary flex items-center gap-1 ${
                      viewMode === 'graph' ? 'bg-blue-100 text-blue-600' : ''
                    }`}
                  >
                    🧠 图谱
                  </button>
                  <button
                    onClick={() => setViewMode('conflicts')}
                    className={`btn-secondary flex items-center gap-1 ${
                      viewMode === 'conflicts' ? 'bg-yellow-100 text-yellow-600' : ''
                    }`}
                  >
                    ⚠️ 冲突 {conflicts.length > 0 ? `(${conflicts.length})` : ''}
                  </button>
                  <button
                    onClick={() => setViewMode('tags')}
                    className={`btn-secondary flex items-center gap-1 ${
                      viewMode === 'tags' ? 'bg-purple-100 text-purple-600' : ''
                    }`}
                  >
                    🏷️ 标签管理
                  </button>
                  <button
                    onClick={handleNewNote}
                    className="btn-primary flex items-center gap-1"
                  >
                    ➕ 新建笔记
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          {!viewingTrash && viewMode === 'list' && <NoteStats stats={stats} categories={categories} />}

          {/* Import/Export */}
          {!viewingTrash && viewMode === 'list' && (
            <ImportExport
              onExport={handleExport}
              onImport={handleImport}
              onClearAll={handleClearAll}
            />
          )}

          {/* View Content */}
          {viewingTrash ? (
            <Trash
              trashNotes={trashNotes}
              onRestore={handleRestoreNote}
              onPermanentlyDelete={handlePermanentlyDeleteNote}
            />
          ) : viewMode === 'calendar' ? (
            <Calendar
              notes={notes}
              onSelectDate={(date) => {
                // You can add logic here to filter notes by date if needed
              }}
            />
          ) : viewMode === 'timeline' ? (
            <Timeline
              notes={notes}
              onSelectNote={handleEditNote}
            />
          ) : viewMode === 'graph' ? (
            <KnowledgeGraph
              notes={notes}
              onSelectNote={handleEditNote}
            />
          ) : viewMode === 'tags' ? (
            <TagManager
              notes={notes}
              onTagRename={handleTagRename}
              onTagDelete={handleTagDelete}
              onBulkTagOperation={handleBulkTagOperation}
            />
          ) : viewMode === 'conflicts' ? (
            <Conflicts
              conflicts={conflicts}
              onResolve={handleResolveConflict}
            />
          ) : (
            <div className="space-y-4">
              <WebDAVSync
                config={webdavConfig}
                syncManager={syncManager}
                onSaveConfig={handleSaveWebdavConfig}
                onPush={handleWebdavPush}
                onPull={handleWebdavPull}
                onClearConfig={handleClearWebdavConfig}
                onConfigChange={handleWebdavConfigChange}
              />
              <OneDriveSync
                config={onedriveConfig}
                onSync={handleOneDriveSync}
                onSaveConfig={handleSaveOneDriveConfig}
              />
              <NoteList
                notes={filteredNotes}
                onEdit={handleEditNote}
                onDelete={handleDeleteNote}
                onToggleFavorite={handleToggleFavorite}
                onToggleFavorite={handleToggleFavorite}
                onToggleArchive={handleToggleArchive}
              />
            </div>
          )}
        </main>
      </div>

      {/* Note Editor Modal */}
      <NoteEditor
        note={editingNote}
        isVisible={editorVisible}
        isPreview={isPreview}
        relatedNotes={relatedNotes}
        onSave={handleSaveNote}
        onCancel={() => {
          setEditorVisible(false);
          setEditingNote(null);
        }}
        onChange={(field, value) => {
          if (editingNote) {
            setEditingNote({ ...editingNote, [field]: value });
          }
        }}
        onTogglePreview={() => setIsPreview(!isPreview)}
        onRevertVersion={handleRevertVersion}
      />

      <Footer />
    </>
  );
};

export default Dashboard;

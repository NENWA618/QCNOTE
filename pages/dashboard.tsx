import Head from 'next/head';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import Footer from '../components/Footer';
import NoteList from '../components/NoteList';
import NoteEditor from '../components/NoteEditor';
import NoteStats from '../components/NoteStats';
import ImportExport from '../components/ImportExport';
import { NoteItem, NoteStorage, Stats, initWindowStorage } from '../lib/storage';

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

  // Editor state
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const s = initWindowStorage() || new NoteStorage();
    storageRef.current = s;
    loadNotes();
  }, []);

  const loadNotes = async () => {
    const s = storageRef.current;
    if (!s) return;
    const all = (await s.getDataAsync()) || [];
    setNotes(all);
    setCategories(await s.getCategoriesAsync());
    setStats(await s.getStatsAsync());
  };

  // Filtered and sorted notes
  const filteredNotes = useMemo(() => {
    let filtered = notes;

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(note =>
        note.title.toLowerCase().includes(searchLower) ||
        note.content.toLowerCase().includes(searchLower) ||
        note.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    // Category filter
    if (category !== 'all') {
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
  }, [notes, search, category, sortBy]);

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
                  placeholder="搜索笔记..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
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
            <div className="flex gap-2">
              <button
                onClick={handleNewNote}
                className="btn-primary flex items-center gap-2"
              >
                ➕ 新建笔记
              </button>
            </div>
          </div>

          {/* Stats */}
          <NoteStats stats={stats} categories={categories} />

          {/* Import/Export */}
          <ImportExport
            onExport={handleExport}
            onImport={handleImport}
            onClearAll={handleClearAll}
          />

          {/* Notes List */}
          <NoteList
            notes={filteredNotes}
            onEdit={handleEditNote}
            onDelete={handleDeleteNote}
            onToggleFavorite={handleToggleFavorite}
            onToggleArchive={handleToggleArchive}
          />
        </main>
      </div>

      {/* Note Editor Modal */}
      <NoteEditor
        note={editingNote}
        isVisible={editorVisible}
        isPreview={isPreview}
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
      />

      <Footer />
    </>
  );
};

export default Dashboard;

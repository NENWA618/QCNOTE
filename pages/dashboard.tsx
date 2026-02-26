import Head from 'next/head';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import Footer from '../components/Footer';
import { NoteItem, NoteStorage, initWindowStorage } from '../lib/storage';
import IDB from '../lib/idb';

const Dashboard: React.FC = () => {
  const storageRef = useRef<NoteStorage | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [categories, setCategories] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, number> | any>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // editor state
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const s = initWindowStorage() || new NoteStorage();
    storageRef.current = s;
    // 使用 IIFE 包装异步调用
    (async () => {
      await loadNotes();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadNotes() {
    const s = storageRef.current;
    if (!s) return;
    const all = (await s.getDataAsync()) || [];
    setNotes(all);
    setCategories(await s.getCategoriesAsync());
    setStats(await s.getStatsAsync());
  }

  async function handleNewNote() {
    const s = storageRef.current;
    if (!s) return;
    const newNote = await s.addNoteAsync({ title: '新笔记', content: '' });
    await loadNotes();
    setEditingNote(newNote);
    setEditorVisible(true);
  }

  async function handleSave() {
    const s = storageRef.current;
    if (!s || !editingNote) return;
    await s.updateNoteAsync(editingNote.id, editingNote);
    await loadNotes();
    setEditorVisible(false);
  }

  async function handleDelete(id: string) {
    const s = storageRef.current;
    if (!s) return;
    await s.deleteNoteAsync(id);
    await loadNotes();
  }

  // Export notes to JSON file
  async function handleExport() {
    const s = storageRef.current;
    if (!s) return;
    await s.exportToJSON();
  }

  // Import notes from JSON file
  async function handleImport(file: File) {
    const s = storageRef.current;
    if (!s) return;
    try {
      const count = await s.importFromJSON(file);
      loadNotes();
      alert(`成功导入 ${count} 条笔记`);
    } catch (err) {
      alert(String(err) || '导入失败');
    }
  }

  function handleClearAll() {
    const s = storageRef.current;
    if (!s) return;
    if (confirm('确定要删除所有笔记吗？此操作无法撤销。')) {
      if (s.useIndexedDB) {
        IDB.clearStore().then(() => {
          s.init();
          loadNotes();
        });
      } else {
        const ok = s.clearAll();
        if (ok) loadNotes();
      }
    }
  }

  const filtered = notes
    .filter((n) => {
      if (category !== 'all' && n.category !== category) return false;
      if (
        search &&
        !(
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          n.content.toLowerCase().includes(search.toLowerCase())
        )
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'date') return b.updatedAt - a.updatedAt;
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'favorite') return Number(b.isFavorite) - Number(a.isFavorite);
      return 0;
    });

  return (
    <>
      <Head>
        <title>笔记列表 - NOTE</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <Header />

      <div className="container">
        <main className="flex flex-col md:flex-row gap-6 md:gap-8">
          {/* Mobile sidebar toggle button */}
          <button
            className="md:hidden px-4 py-2 bg-primary-light text-primary-dark rounded-lg font-semibold self-start"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? '✕ 关闭菜单' : '☰ 打开菜单'}
          </button>

          {/* Sidebar - shown on desktop or when mobile menu is open */}
          <div
            className={`${sidebarOpen ? 'block' : 'hidden md:block'} w-full md:w-64 flex-shrink-0`}
          >
            <Sidebar
              categories={categories}
              stats={stats}
              onNewNote={handleNewNote}
              onSearch={(v) => setSearch(v)}
              onCategoryChange={(v) => setCategory(v)}
              onSortChange={(v) => setSortBy(v)}
              searchValue={search}
              selectedCategory={category}
              sortBy={sortBy}
              onExport={handleExport}
              onImport={handleImport}
              onClearAll={handleClearAll}
            />
          </div>

          <section className="flex-1">
            <h2 className="text-primary-dark mb-6 text-2xl md:text-3xl font-bold">📝 我的笔记</h2>
            <div id="notes-container">
              {filtered.length === 0 && (
                <div className="empty-state px-4 md:px-8 py-12 md:py-16">
                  <div className="mb-4 text-5xl md:text-6xl">📝</div>
                  <p className="text-xl md:text-2xl font-semibold text-primary-dark mb-2">
                    暂无笔记
                  </p>
                  <p className="text-text-light mb-8 text-sm md:text-base">
                    还没有笔记，点击新建或导入开始。
                  </p>
                  <div className="flex flex-col md:flex-row gap-3 md:gap-2 justify-center">
                    <button className="btn btn-primary w-full md:w-auto" onClick={handleNewNote}>
                      ✏️ 新建笔记
                    </button>
                    <button
                      className="btn btn-secondary w-full md:w-auto"
                      onClick={() => {
                        // trigger a hidden import input via DOM
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'application/json';
                        input.onchange = (e: any) => {
                          const f = e.target.files && e.target.files[0];
                          if (f) handleImport(f);
                        };
                        input.click();
                      }}
                    >
                      📥 导入 JSON
                    </button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((n) => (
                  <article key={n.id} className="card p-4" style={{ background: n.color }}>
                    <h3 className="font-bold mb-2">{n.title}</h3>
                    <p className="text-sm h-12 overflow-hidden">{n.content}</p>
                    <div className="flex justify-between items-center mt-4">
                      <small className="text-text-light text-xs">
                        {new Date(n.updatedAt).toLocaleString()}
                      </small>
                      <div className="space-x-2">
                        <button
                          className="btn btn-sm bg-accent-pink hover:opacity-80 text-white px-3 py-1 rounded transition-all hover:scale-110"
                          onClick={() => {
                            setEditingNote(n);
                            setEditorVisible(true);
                          }}
                        >
                          编辑
                        </button>
                        <button
                          className="btn btn-sm bg-accent-purple hover:opacity-80 text-white px-3 py-1 rounded transition-all hover:scale-110"
                          onClick={() => handleDelete(n.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>

      {editorVisible && editingNote && (
        <div
          id="editor-panel"
          className="fixed inset-0 md:right-5 md:top-20 md:w-96 w-full h-full md:h-auto md:rounded-2xl bg-white p-6 rounded-none shadow-dark md:shadow-dark border border-primary-light/50 z-50 backdrop-blur-sm overflow-y-auto md:overflow-y-visible flex flex-col md:flex md:max-h-[calc(100vh-100px)]"
        >
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-primary-light">
            <h2 className="text-xl font-bold text-primary-dark">✏️ 编辑笔记</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`px-3 py-1 rounded-md text-sm transition-all ${
                  isPreview ? 'bg-primary-medium text-white' : 'bg-primary-light text-primary-dark'
                }`}
                onClick={() => setIsPreview((v) => !v)}
              >
                {isPreview ? '编辑' : '预览'}
              </button>
              <button
                className="text-text-light hover:text-primary-dark transition-colors font-bold text-lg w-8 h-8 flex items-center justify-center hover:bg-primary-light rounded-lg"
                onClick={() => setEditorVisible(false)}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="space-y-4 mb-4">
            <div>
              <label
                htmlFor="note-title-input"
                className="block text-sm font-semibold text-primary-dark mb-2"
              >
                标题
              </label>
              <input
                id="note-title-input"
                className="input w-full"
                value={editingNote.title}
                onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
              />
            </div>
            <div>
              <label
                htmlFor="note-content-input"
                className="block text-sm font-semibold text-primary-dark mb-2"
              >
                内容
              </label>
              {isPreview ? (
                <div className="prose max-w-none text-sm leading-relaxed bg-white/20 p-3 rounded">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{editingNote.content}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  id="note-content-input"
                  className="input w-full h-36 resize-y"
                  spellCheck={false}
                  value={editingNote.content}
                  onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                />
              )}
            </div>
            <div>
              <label
                htmlFor="note-category-select"
                className="block text-sm font-semibold text-primary-dark mb-2"
              >
                分类
              </label>
              <select
                id="note-category-select"
                className="select w-full"
                value={editingNote.category}
                onChange={(e) => setEditingNote({ ...editingNote, category: e.target.value })}
              >
                <option value="生活">生活</option>
                <option value="工作">工作</option>
                <option value="学习">学习</option>
                <option value="灵感">灵感</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="note-tags-input"
                className="block text-sm font-semibold text-primary-dark mb-2"
              >
                标签 (用逗号分隔)
              </label>
              <input
                id="note-tags-input"
                className="input w-full"
                value={editingNote.tags.join(', ')}
                onChange={(e) =>
                  setEditingNote({
                    ...editingNote,
                    tags: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={handleSave}>
              ✓ 保存
            </button>
            <button className="btn btn-secondary flex-1" onClick={() => setEditorVisible(false)}>
              ✕ 关闭
            </button>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
};

export default Dashboard;

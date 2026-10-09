import Head from 'next/head';
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Layout from '../components/Layout';
import Sidebar from '../components/Sidebar';
import NoteList from '../components/NoteList';
import NoteEditor from '../components/NoteEditor';
import { usePublishedNotes } from '../lib/publicNotes';
import DashboardToolbar from '../components/DashboardToolbar';
import { Trash } from '../components/Trash';
import { Calendar } from '../components/Calendar';
import { Timeline } from '../components/Timeline';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import WebDAVSync from '../components/WebDAVSync';
import Conflicts from '../components/Conflicts';
import TagManager from '../components/TagManager';
import OneDriveSync from '../components/OneDriveSync';
import WebDAVSyncManager from '../lib/webdavSyncManager';
import {
  NoteItem,
  NoteStorage,
  Stats,
  NoteVersion,
  WebDAVConfig,
  OneDriveConfig,
  NoteConflict,
  initWindowStorage,
} from '../lib/storage';
import { Utils } from '../lib/utils';
import ClipImportDialog from '../components/ClipImportDialog';
import { CLIP_HASH_KEY, clipToNote, parseClipFromHash, type ClipPayload } from '../lib/clipImport';
import { useDeviceVerification } from '../lib/hooks/useDeviceVerification';
import { useLocalStorageFlag } from '../lib/hooks/useLocalStorageFlag';
import { useSemanticSearch } from '../lib/hooks/useSemanticSearch';

const SEMANTIC_SEARCH_STORAGE_KEY = 'qcnote:semantic-search-enabled';

// 存储层保存失败时会抛错（而不是假装成功），这里统一提示用户
const reportSaveError = (action: string, err: unknown) => {
  console.error(`[Dashboard] ${action}失败`, err);
  alert(`${action}失败：${err instanceof Error ? err.message : String(err)}`);
};

const Dashboard: React.FC = () => {
  // Created once on the client; null while rendering on the server.
  const [storage] = useState<NoteStorage | null>(() =>
    typeof window === 'undefined' ? null : initWindowStorage() || new NoteStorage(),
  );
  const storageRef = useRef<NoteStorage | null>(storage);
  const syncManager = useMemo(() => (storage ? new WebDAVSyncManager(storage) : null), [storage]);
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewingTrash, setViewingTrash] = useState(false);
  const [trashNotes, setTrashNotes] = useState<NoteItem[]>([]);
  const [conflicts, setConflicts] = useState<NoteConflict[]>([]);
  const [viewMode, setViewMode] = useState<
    'list' | 'calendar' | 'timeline' | 'graph' | 'conflicts' | 'tags' | 'cloud'
  >('list');
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
  const [onedriveConfig, setOnedriveConfig] = useState<OneDriveConfig>({
    accessToken: '',
    folderPath: 'Notes/notes.json',
    encryptionKey: '',
  });
  const [oneDriveConfigSaved, setOneDriveConfigSaved] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [, setSelectedTags] = useState<string[]>([]);
  const [semanticEnabled, setSemanticEnabled] = useLocalStorageFlag(SEMANTIC_SEARCH_STORAGE_KEY);
  const { data: session, status: sessionStatus } = useSession();
  const [pendingClip, setPendingClip] = useState<ClipPayload | null>(() =>
    typeof window === 'undefined' ? null : parseClipFromHash(window.location.hash),
  );
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const {
    published: publishedNotes,
    publish: publishNote,
    unpublish: unpublishNote,
    unpublishAll: unpublishAllNotes,
  } = usePublishedNotes(Boolean(currentUserId));

  // Editor state
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  // 存储层的异常状态：设备未解锁，或有笔记无法解密（已隐藏、不会被改动）
  const [storageLocked, setStorageLocked] = useState(false);
  const [undecryptableCount, setUndecryptableCount] = useState(0);

  const loadNotes = useCallback(async () => {
    const s = storageRef.current;
    if (!s) return;
    const all = (await s.getDataAsync()) || [];

    setNotes(all);
    setStorageLocked(s.notesDbLocked);
    setUndecryptableCount(s.undecryptableCount);
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
      setLastSyncTime(config.lastSyncTime ? new Date(config.lastSyncTime) : null);
    }

    const oneDriveConfig = await s.getOneDriveConfigAsync();
    if (oneDriveConfig) {
      setOnedriveConfig({
        accessToken: oneDriveConfig.accessToken,
        folderPath: oneDriveConfig.folderPath,
        encryptionKey: oneDriveConfig.encryptionKey,
      });
      setOneDriveConfigSaved(true);
    }

    // Load trash notes
    const trash = await s.getTrashNotesAsync();
    setTrashNotes(trash);

    // Load conflicts
    const conflicts = await s.getConflictsAsync();
    setConflicts(conflicts);
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const resetLoadedData = useCallback(() => {
    setNotes([]);
    setCategories([]);
    setStats({
      totalNotes: 0,
      favoriteNotes: 0,
      archivedNotes: 0,
      categories: {},
      totalTags: 0,
      createdToday: 0,
    });
    setTrashNotes([]);
    setConflicts([]);
  }, []);

  const { deviceVerificationStatus, deviceVerificationMessage, resetDeviceFingerprint } =
    useDeviceVerification({
      userId: currentUserId,
      storageRef,
      loadNotes,
      onUserChange: resetLoadedData,
    });

  // Auto-sync effect
  useEffect(() => {
    if (!webdavConfig.autoSyncEnabled || !storageRef.current) return;

    const interval = setInterval(async () => {
      const s = storageRef.current;
      if (!s) return;

      // Notes with unresolved conflicts are left alone by the sync itself, so
      // the rest can keep syncing.
      const config = { ...webdavConfig };
      if (await s.syncWithWebDAVAsync(config, Boolean(config.encryptionKey))) {
        setLastSyncTime(new Date());
        await loadNotes(); // Refresh data
      }
    }, webdavConfig.syncInterval);

    return () => clearInterval(interval);
  }, [webdavConfig, loadNotes]);

  const handleToggleSemantic = useCallback(() => {
    setSemanticEnabled(!semanticEnabled);
  }, [semanticEnabled, setSemanticEnabled]);

  const {
    ids: semanticIds,
    status: semanticStatus,
    progress: semanticProgress,
  } = useSemanticSearch({
    enabled: semanticEnabled,
    query: search,
    notes,
    viewingTrash,
    cacheStore: storage,
  });

  // Filtered and sorted notes
  const filteredNotes = useMemo(() => {
    let filtered = notes;

    // Exclude deleted notes from regular view
    if (!viewingTrash) {
      filtered = filtered.filter((n) => !n.isDeleted);
    }

    const preSearchPool = filtered;

    // Search filter
    if (search) {
      filtered = Utils.searchNotes(filtered, search);

      // Append semantic matches that keyword search missed (same-meaning, different wording)
      if (semanticEnabled && semanticIds.length > 0) {
        const existingIds = new Set(filtered.map((n) => n.id));
        const semanticExtras = semanticIds
          .map((id) => preSearchPool.find((n) => n.id === id))
          .filter((n): n is NoteItem => n !== undefined && !existingIds.has(n.id));
        filtered = [...filtered, ...semanticExtras];
      }
    }

    // Category filter
    if (category !== 'all' && !viewingTrash) {
      filtered = filtered.filter((note) => note.category === category);
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
  }, [notes, search, category, sortBy, viewingTrash, semanticEnabled, semanticIds]);

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

  // 浏览器扩展通过 URL hash 传来的网页剪藏：先读出并清掉 hash（刷新不会重复导入），确认后再保存
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.hash.slice(1)).has(CLIP_HASH_KEY)) return;
    const valid = parseClipFromHash(window.location.hash) !== null;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!valid) {
      alert('剪藏数据无效或过大，已忽略。');
    }
  }, []);

  // 登录用户要等设备验证完成、存储切换到该用户的命名空间后再导入，避免写进访客库
  const clipImportReady =
    sessionStatus !== 'loading' && (!currentUserId || deviceVerificationStatus === 'verified');

  const handleConfirmClip = async (clip: ClipPayload) => {
    const s = storageRef.current;
    if (!s) return;
    try {
      await s.addNoteAsync(clipToNote(clip));
    } catch (err) {
      reportSaveError('保存剪藏', err);
      return;
    }
    await loadNotes();
    setPendingClip(null);
  };

  const handleNewNote = async () => {
    const s = storageRef.current;
    if (!s) return;
    let newNote: NoteItem;
    try {
      newNote = await s.addNoteAsync({ title: '新笔记', content: '' });
    } catch (err) {
      reportSaveError('新建笔记', err);
      return;
    }
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
    let savedNote: NoteItem | null;
    try {
      savedNote = await s.updateNoteAsync(editingNote.id, editingNote);
    } catch (err) {
      // 保持编辑器打开，用户的修改还在，可以重试
      reportSaveError('保存笔记', err);
      return;
    }
    if (savedNote) {
      try {
        const payload = {
          noteId: savedNote.id,
          title: savedNote.title,
          score: savedNote.sentimentScore ?? 0,
          comparative: savedNote.sentimentComparative ?? 0,
        };
        window.dispatchEvent(new CustomEvent('qcnote:note-saved', { detail: payload }));
      } catch (error) {
        console.warn('[Dashboard] 无法触发情感保存事件', error);
      }
    }
    await loadNotes();
    setEditorVisible(false);
    setEditingNote(null);
  };

  // 删除本地笔记不会自动取消公开副本，所以在删除前问一句。
  // 返回 false 表示应中止删除（取消发布失败时保留笔记，用户才有机会重试）
  const confirmUnpublishBeforeRemoval = async (id: string): Promise<boolean> => {
    if (!publishedNotes[id]) return true;
    const alsoUnpublish = window.confirm(
      '这篇笔记已公开在你的个人主页。\n\n点“确定”：同时取消发布（删除服务器上的公开副本）\n点“取消”：保留公开副本，仅删除本地笔记',
    );
    if (!alsoUnpublish) return true;
    const result = await unpublishNote(id);
    if (!result.ok) {
      window.alert(`取消发布失败，笔记未删除：${result.error}`);
      return false;
    }
    return true;
  };

  const handleDeleteNote = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    if (!(await confirmUnpublishBeforeRemoval(id))) return;
    try {
      await s.deleteNoteAsync(id);
    } catch (err) {
      reportSaveError('删除笔记', err);
    }
    await loadNotes();
  };

  const handleToggleFavorite = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    const note = notes.find((n) => n.id === id);
    if (note) {
      try {
        await s.updateNoteAsync(id, { isFavorite: !note.isFavorite });
      } catch (err) {
        reportSaveError('收藏', err);
      }
      await loadNotes();
    }
  };

  const handleToggleArchive = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    const note = notes.find((n) => n.id === id);
    if (note) {
      try {
        await s.updateNoteAsync(id, { isArchived: !note.isArchived });
      } catch (err) {
        reportSaveError('归档', err);
      }
      await loadNotes();
    }
  };

  const handleExport = async () => {
    const s = storageRef.current;
    if (!s) return;
    try {
      await s.exportToJSON();
    } catch (err) {
      reportSaveError('导出', err);
    }
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
    const typed = prompt('此操作将删除所有笔记且无法撤销。请输入“清空”以确认：');
    if (typed?.trim() === '清空') {
      const publishedCount = Object.keys(publishedNotes).length;
      if (
        publishedCount > 0 &&
        window.confirm(
          `你有 ${publishedCount} 篇笔记公开在个人主页。\n\n点“确定”：同时取消发布全部公开笔记\n点“取消”：保留公开副本，仅清空本地笔记`,
        )
      ) {
        const result = await unpublishAllNotes();
        if (!result.ok) {
          window.alert(`取消发布失败，笔记未清空：${result.error}`);
          return;
        }
      }
      await s.clearAllAsync();
      await loadNotes();
    }
  };

  const handleSaveWebdavConfig = async (config: WebDAVConfig) => {
    const s = storageRef.current;
    if (!s) return false;
    const fullConfig = { ...config, lastSyncTime: lastSyncTime?.getTime() };
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
    const s = storageRef.current;
    if (!s) return;

    if (!oneDriveConfigSaved) {
      const saved = await s.setOneDriveConfigAsync(onedriveConfig);
      setOneDriveConfigSaved(saved);
      if (!saved) {
        alert('OneDrive 配置保存失败，无法执行同步');
        return;
      }
    }

    const success = await s.syncWithOneDriveAsync(
      onedriveConfig,
      Boolean(onedriveConfig.encryptionKey),
    );
    if (!success) {
      alert(
        'OneDrive 同步失败，远端文件未被改动。请检查访问令牌、路径，以及加密密钥是否与其他设备一致',
      );
      return;
    }
    await loadNotes();
    alert('OneDrive 同步完成');
  };

  const handleSaveOneDriveConfig = async (config: OneDriveConfig) => {
    setOnedriveConfig(config);
    setOneDriveConfigSaved(false);
    const s = storageRef.current;
    if (!s) return;
    const saved = await s.setOneDriveConfigAsync(config);
    if (!saved) {
      alert('OneDrive 配置保存失败');
    }
    setOneDriveConfigSaved(saved);
  };

  const handleClearOneDriveConfig = async () => {
    const s = storageRef.current;
    if (!s) return;
    const cleared = await s.clearOneDriveConfigAsync();
    if (!cleared) {
      alert('清除 OneDrive 配置失败');
      return;
    }
    setOnedriveConfig({ accessToken: '', folderPath: 'Notes/notes.json', encryptionKey: '' });
    setOneDriveConfigSaved(false);
  };

  const handleRestoreNote = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    try {
      await s.restoreNoteAsync(id);
    } catch (err) {
      reportSaveError('恢复笔记', err);
    }
    await loadNotes();
  };

  const handlePermanentlyDeleteNote = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    if (!(await confirmUnpublishBeforeRemoval(id))) return;
    try {
      await s.permanentlyDeleteNoteAsync(id);
    } catch (err) {
      reportSaveError('彻底删除', err);
    }
    await loadNotes();
  };

  const handleResolveConflict = async (id: string, resolvedNote: NoteItem) => {
    const s = storageRef.current;
    if (!s) return;
    if (!(await s.resolveConflictAsync(id, resolvedNote))) {
      reportSaveError('解决冲突', new Error('写入存储失败'));
    }
    await loadNotes();
  };

  const handleTagRename = async (oldTag: string, newTag: string) => {
    const s = storageRef.current;
    if (!s) return;

    try {
      await s.updateNotesAsync((current) =>
        current.map((note) => ({
          ...note,
          tags: note.tags?.map((tag) => (tag === oldTag ? newTag : tag)) || [],
        })),
      );
    } catch (err) {
      reportSaveError('重命名标签', err);
    }
    await loadNotes();
  };

  const handleTagDelete = async (tagToDelete: string) => {
    const s = storageRef.current;
    if (!s) return;

    try {
      await s.updateNotesAsync((current) =>
        current.map((note) => ({
          ...note,
          tags: note.tags?.filter((tag) => tag !== tagToDelete) || [],
        })),
      );
    } catch (err) {
      reportSaveError('删除标签', err);
    }
    await loadNotes();
  };

  const handleBulkTagOperation = async (
    operation: 'add' | 'remove',
    tag: string,
    noteIds: string[],
  ) => {
    const s = storageRef.current;
    if (!s) return;

    const applyBulkTag = (note: NoteItem): NoteItem => {
      if (!noteIds.includes(note.id)) return note;

      const currentTags = note.tags || [];
      let newTags: string[];

      if (operation === 'add') {
        newTags = currentTags.includes(tag) ? currentTags : [...currentTags, tag];
      } else {
        newTags = currentTags.filter((t) => t !== tag);
      }

      return { ...note, tags: newTags };
    };

    try {
      await s.updateNotesAsync((current) => current.map(applyBulkTag));
    } catch (err) {
      reportSaveError('批量修改标签', err);
    }
    await loadNotes();
  };

  const handleTagClick = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleClearWebdavConfig = async (): Promise<boolean> => {
    const s = storageRef.current;
    if (!s) return false;
    try {
      await s.clearWebDAVConfigAsync();
      setWebdavConfig({
        url: '',
        username: '',
        password: '',
        remotePath: 'notes.json',
        encryptionKey: '',
        autoSyncEnabled: false,
        syncInterval: 5 * 60 * 1000,
        conflictStrategy: 'manual',
      });
      setLastSyncTime(null);
      return true;
    } catch (error) {
      console.error('Failed to clear WebDAV config:', error);
      return false;
    }
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
      coloredRanges: version.coloredRanges,
      isFavorite: version.isFavorite,
      isArchived: version.isArchived,
      updatedAt: Date.now(),
    };

    try {
      await s.updateNoteAsync(editingNote.id, revertedNote);
    } catch (err) {
      reportSaveError('恢复版本', err);
      return;
    }
    await loadNotes();
    alert('✅ 成功恢复到版本！');
  };

  return (
    <>
      <Head>
        <title>笔记管理 - QCNOTE</title>
        <meta
          name="description"
          content="QCNOTE 笔记管理面板。创建、编辑和组织您的个人笔记，支持分类、搜索和多视图显示。"
        />
      </Head>

      <Layout>
        <div className="flex flex-col md:flex-row min-h-[calc(100vh-14rem)] lg:min-h-[calc(100vh-16rem)] gap-6">
          {deviceVerificationStatus !== 'idle' && (
            <div className="fixed top-24 left-1/2 z-20 w-[min(96vw,800px)] -translate-x-1/2 rounded-lg border px-4 py-3 shadow-lg transition-all duration-300 sm:top-28">
              <div
                className={`text-sm ${
                  deviceVerificationStatus === 'failed'
                    ? 'text-red-700 bg-red-50 border-red-200'
                    : 'text-blue-700 bg-blue-50 border-blue-200'
                } rounded-md border p-3`}
              >
                {deviceVerificationMessage ||
                  (deviceVerificationStatus === 'pending'
                    ? '正在校验当前设备指纹，加载笔记页面请稍候。'
                    : '当前设备已完成验证。')}
              </div>
              {deviceVerificationStatus === 'failed' && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-sm text-slate-600 dark:text-dark-text-secondary">
                    若当前设备为新设备，请在确认后重置设备指纹。
                  </span>
                  <button onClick={resetDeviceFingerprint} className="btn-primary btn-sm">
                    重置设备指纹
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Sidebar */}
          <Sidebar
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            categories={categories}
            stats={stats}
            currentCategory={category}
            onCategoryChange={setCategory}
            search={search}
            onSearchChange={setSearch}
            sortBy={sortBy}
            onSortChange={setSortBy}
            semanticEnabled={semanticEnabled}
            onToggleSemantic={handleToggleSemantic}
            semanticStatus={semanticStatus}
            semanticProgress={semanticProgress}
          />

          {/* Main Content */}
          <main className="flex-1 min-w-0 p-4 md:p-6">
            {(storageLocked || undecryptableCount > 0) && (
              <div
                role="alert"
                className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
              >
                {storageLocked
                  ? '当前设备未解锁（无法获取加密密钥），暂时无法读取或保存笔记。请检查网络连接，或重新验证当前设备后刷新页面。'
                  : `有 ${undecryptableCount} 条笔记无法解密，已暂时隐藏。它们不会被修改、删除或同步，原始数据仍保留在本机。`}
              </div>
            )}

            {/* Header Controls */}
            <div className="mb-6">
              <DashboardToolbar
                viewMode={viewMode}
                viewingTrash={viewingTrash}
                trashCount={trashNotes.length}
                conflictCount={conflicts.length}
                onSelectView={(view) => {
                  setViewingTrash(false);
                  setViewMode(view);
                }}
                onToggleTrash={() => setViewingTrash(!viewingTrash)}
                onNewNote={handleNewNote}
                onExport={handleExport}
                onImport={handleImport}
                onClearAll={handleClearAll}
              />
            </div>

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
              <Timeline notes={notes} onSelectNote={handleEditNote} />
            ) : viewMode === 'graph' ? (
              <KnowledgeGraph notes={notes} onSelectNote={handleEditNote} />
            ) : viewMode === 'tags' ? (
              <TagManager
                notes={notes}
                onTagRename={handleTagRename}
                onTagDelete={handleTagDelete}
                onBulkTagOperation={handleBulkTagOperation}
              />
            ) : viewMode === 'conflicts' ? (
              <Conflicts conflicts={conflicts} onResolve={handleResolveConflict} />
            ) : viewMode === 'cloud' ? (
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
                  configSaved={oneDriveConfigSaved}
                  onSync={handleOneDriveSync}
                  onSaveConfig={handleSaveOneDriveConfig}
                  onClearConfig={handleClearOneDriveConfig}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <NoteList
                  notes={filteredNotes}
                  onEdit={handleEditNote}
                  onTagClick={handleTagClick}
                  published={publishedNotes}
                />
              </div>
            )}
          </main>
        </div>
      </Layout>

      <ClipImportDialog
        clip={clipImportReady ? pendingClip : null}
        onConfirm={handleConfirmClip}
        onDiscard={() => setPendingClip(null)}
      />

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
          setEditingNote((prev) => (prev ? { ...prev, [field]: value } : prev));
        }}
        onTogglePreview={() => setIsPreview(!isPreview)}
        onDelete={handleDeleteNote}
        onToggleFavorite={handleToggleFavorite}
        onToggleArchive={handleToggleArchive}
        onOpenRelatedNote={handleEditNote}
        onRevertVersion={handleRevertVersion}
        onPublish={currentUserId ? publishNote : undefined}
        onUnpublish={currentUserId ? unpublishNote : undefined}
        publishInfo={editingNote ? publishedNotes[editingNote.id] : undefined}
      />
    </>
  );
};

export default Dashboard;

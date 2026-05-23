import Head from 'next/head';
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Layout from '../components/Layout';
import Sidebar from '../components/Sidebar';
import NoteList from '../components/NoteList';
import NoteEditor from '../components/NoteEditor';
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
  const [conflicts, setConflicts] = useState<NoteConflict[]>([]);
  const [viewMode, setViewMode] = useState<
    'list' | 'calendar' | 'timeline' | 'graph' | 'conflicts' | 'tags'
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
  const [noteCache, setNoteCache] = useState<Map<string, NoteItem>>(new Map());
  const [searchCache, setSearchCache] = useState<Map<string, NoteItem[]>>(new Map());
  const [syncManager, setSyncManager] = useState<WebDAVSyncManager | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [deviceVerificationStatus, setDeviceVerificationStatus] = useState<
    'idle' | 'pending' | 'verified' | 'failed'
  >('idle');
  const [deviceVerificationMessage, setDeviceVerificationMessage] = useState('');
  const { data: session } = useSession();

  const sentimentStats = useMemo(() => {
    const activeNotes = notes.filter((note) => !note.isDeleted);
    const total = activeNotes.length;
    const positive = activeNotes.filter((note) => note.sentimentCategory === 'positive').length;
    const negative = activeNotes.filter((note) => note.sentimentCategory === 'negative').length;
    const neutral = activeNotes.filter((note) => note.sentimentCategory === 'neutral').length;
    const averageComparative = total
      ? activeNotes.reduce((sum, note) => sum + (note.sentimentComparative || 0), 0) / total
      : 0;

    return {
      total,
      positive,
      negative,
      neutral,
      averageComparative,
    };
  }, [notes]);

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

  const userId = (session?.user as { id?: string } | undefined)?.id || null;

  const getDeviceFingerprint = useCallback(async (): Promise<string> => {
    if (typeof window === 'undefined' || !window.crypto?.subtle) {
      return '';
    }

    const parts = [
      navigator.userAgent,
      navigator.platform,
      navigator.language,
      Array.isArray(navigator.languages) ? navigator.languages.join(',') : '',
      String(screen.width),
      String(screen.height),
      String(screen.colorDepth),
      String((navigator as any).hardwareConcurrency ?? ''),
      String((navigator as any).deviceMemory ?? ''),
      String(navigator.maxTouchPoints ?? ''),
    ].filter(Boolean);

    const encoder = new TextEncoder();
    const data = encoder.encode(parts.join('||'));
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }, []);

  const verifyDeviceFingerprint = useCallback(async () => {
    if (!userId) {
      return { allowed: true, firstTime: false };
    }

    const fingerprint = await getDeviceFingerprint();
    if (!fingerprint) {
      return { allowed: false, message: '无法计算设备指纹，无法继续加载笔记。' };
    }

    try {
      const response = await fetch('/api/device/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        return {
          allowed: false,
          message:
            result?.error?.message || '设备未通过验证。请使用已登记设备登录，或点击下方重置指纹。',
        };
      }
      return {
        allowed: true,
        firstTime: result.data?.firstTime === true,
      };
    } catch (error) {
      console.error('[Device Verification] Error verifying device fingerprint', error);
      return {
        allowed: false,
        message: '设备验证遇到网络错误，请检查网络后重试。',
      };
    }
  }, [userId, getDeviceFingerprint]);

  const resetDeviceFingerprint = useCallback(async () => {
    if (!userId) return;

    setDeviceVerificationStatus('pending');
    setDeviceVerificationMessage('正在重置当前设备指纹，请稍候...');

    try {
      const response = await fetch('/api/device/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message || '设备指纹重置失败');
      }

      const verification = await verifyDeviceFingerprint();
      if (!verification.allowed) {
        setDeviceVerificationStatus('failed');
        setDeviceVerificationMessage(
          verification.message || '设备指纹重置后仍未通过验证，请使用已登记设备。',
        );
        return;
      }

      await storageRef.current?.setCurrentUser(userId);
      await storageRef.current?.migrateGuestDataToUser();
      await loadNotes();
      setDeviceVerificationStatus('verified');
      setDeviceVerificationMessage(
        verification.firstTime
          ? '已完成设备指纹重置，当前设备已登记为新设备。'
          : '当前设备已完成验证。',
      );
    } catch (error) {
      console.error('[Device Reset] Error resetting device fingerprint', error);
      setDeviceVerificationStatus('failed');
      setDeviceVerificationMessage(
        error instanceof Error ? error.message : '设备指纹重置失败，请稍后重试。',
      );
    }
  }, [userId, verifyDeviceFingerprint]);

  useEffect(() => {
    if (!storageRef.current) return;

    const updateUserStorage = async () => {
      if (!userId) {
        setDeviceVerificationStatus('idle');
        setDeviceVerificationMessage('');
        await storageRef.current?.setCurrentUser(null);
        await loadNotes();
        return;
      }

      setDeviceVerificationStatus('pending');
      setDeviceVerificationMessage('正在校验当前设备，加载个人笔记需要先完成验证。');
      await storageRef.current?.setCurrentUser(null);
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

      const verification = await verifyDeviceFingerprint();
      if (!verification.allowed) {
        setDeviceVerificationStatus('failed');
        setDeviceVerificationMessage(
          verification.message || '当前设备未通过验证，无法加载个人笔记。',
        );
        return;
      }

      await storageRef.current?.setCurrentUser(userId);
      await storageRef.current?.migrateGuestDataToUser();
      await loadNotes();
      setDeviceVerificationStatus('verified');
      setDeviceVerificationMessage(
        verification.firstTime ? '首次在此设备登录，已完成设备指纹登记。' : '当前设备已完成验证。',
      );
    };

    updateUserStorage();
  }, [userId, verifyDeviceFingerprint]);

  useEffect(() => {
    if (deviceVerificationStatus === 'verified' && deviceVerificationMessage) {
      const timer = window.setTimeout(() => {
        setDeviceVerificationMessage('');
        setDeviceVerificationStatus('idle');
      }, 7000);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [deviceVerificationStatus, deviceVerificationMessage]);

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
          setLastSyncTime(new Date());
          await loadNotes(); // Refresh data
        }
      }
    }, webdavConfig.syncInterval);

    return () => clearInterval(interval);
  }, [webdavConfig]);

  const loadNotes = async () => {
    const s = storageRef.current;
    if (!s) return;
    const all = (await s.getDataAsync()) || [];

    // 更新缓存
    const newCache = new Map();
    all.forEach((note) => newCache.set(note.id, note));
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
    const savedNote = await s.updateNoteAsync(editingNote.id, editingNote);
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

  const handleDeleteNote = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    await s.deleteNoteAsync(id);
    await loadNotes();
  };

  const handleToggleFavorite = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    const note = notes.find((n) => n.id === id);
    if (note) {
      await s.updateNoteAsync(id, { ...note, isFavorite: !note.isFavorite });
      await loadNotes();
    }
  };

  const handleToggleArchive = async (id: string) => {
    const s = storageRef.current;
    if (!s) return;
    const note = notes.find((n) => n.id === id);
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
      alert('OneDrive 同步失败，请检查令牌和路径');
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

    const updatedNotes = notes.map((note) => ({
      ...note,
      tags: note.tags?.map((tag) => (tag === oldTag ? newTag : tag)) || [],
    }));

    await s.setDataAsync(updatedNotes);
    await loadNotes();
  };

  const handleTagDelete = async (tagToDelete: string) => {
    const s = storageRef.current;
    if (!s) return;

    const updatedNotes = notes.map((note) => ({
      ...note,
      tags: note.tags?.filter((tag) => tag !== tagToDelete) || [],
    }));

    await s.setDataAsync(updatedNotes);
    await loadNotes();
  };

  const handleBulkTagOperation = async (
    operation: 'add' | 'remove',
    tag: string,
    noteIds: string[],
  ) => {
    const s = storageRef.current;
    if (!s) return;

    const updatedNotes = notes.map((note) => {
      if (!noteIds.includes(note.id)) return note;

      const currentTags = note.tags || [];
      let newTags: string[];

      if (operation === 'add') {
        newTags = currentTags.includes(tag) ? currentTags : [...currentTags, tag];
      } else {
        newTags = currentTags.filter((t) => t !== tag);
      }

      return { ...note, tags: newTags };
    });

    await s.setDataAsync(updatedNotes);
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
        <title>笔记管理 - QCNOTE</title>
        <meta
          name="description"
          content="QCNOTE 笔记管理面板。创建、编辑和组织您的个人笔记，支持分类、搜索和多视图显示。"
        />
      </Head>

      <Layout>
        <div className="flex min-h-[calc(100vh-14rem)] lg:min-h-[calc(100vh-16rem)] gap-6">
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
                  <span className="text-sm text-slate-600">
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
          />

          {/* Main Content */}
          <main className="flex-1 p-6">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-start items-start md:items-center gap-4 mb-6">
              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setViewingTrash(!viewingTrash)}
                  className="btn-secondary btn-sm flex items-center gap-1"
                >
                  {viewingTrash
                    ? '返回'
                    : `🗑️ 回收站 ${trashNotes.length > 0 ? `(${trashNotes.length})` : ''}`}
                </button>
                {!viewingTrash && (
                  <>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`btn-secondary btn-sm flex items-center gap-1 ${
                        viewMode === 'list' ? 'bg-blue-100 text-blue-600' : ''
                      }`}
                    >
                      📝 列表
                    </button>
                    <button
                      onClick={() => setViewMode('calendar')}
                      className={`btn-secondary btn-sm flex items-center gap-1 ${
                        viewMode === 'calendar' ? 'bg-blue-100 text-blue-600' : ''
                      }`}
                    >
                      📅 日历
                    </button>
                    <button
                      onClick={() => setViewMode('timeline')}
                      className={`btn-secondary btn-sm flex items-center gap-1 ${
                        viewMode === 'timeline' ? 'bg-blue-100 text-blue-600' : ''
                      }`}
                    >
                      📊 时间线
                    </button>
                    <button
                      onClick={() => setViewMode('graph')}
                      className={`btn-secondary btn-sm flex items-center gap-1 ${
                        viewMode === 'graph' ? 'bg-blue-100 text-blue-600' : ''
                      }`}
                    >
                      🧠 图谱
                    </button>
                    <button
                      onClick={() => setViewMode('conflicts')}
                      className={`btn-secondary btn-sm flex items-center gap-1 ${
                        viewMode === 'conflicts' ? 'bg-yellow-100 text-yellow-600' : ''
                      }`}
                    >
                      ⚠️ 冲突 {conflicts.length > 0 ? `(${conflicts.length})` : ''}
                    </button>
                    <button
                      onClick={() => setViewMode('tags')}
                      className={`btn-secondary btn-sm flex items-center gap-1 ${
                        viewMode === 'tags' ? 'bg-purple-100 text-purple-600' : ''
                      }`}
                    >
                      🏷️ 标签管理
                    </button>
                    <button
                      onClick={handleNewNote}
                      className="btn-primary btn-sm flex items-center gap-1"
                    >
                      ➕ 新建笔记
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Stats */}

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
                  configSaved={oneDriveConfigSaved}
                  onSync={handleOneDriveSync}
                  onSaveConfig={handleSaveOneDriveConfig}
                  onClearConfig={handleClearOneDriveConfig}
                />
                <NoteList
                  notes={filteredNotes}
                  onEdit={handleEditNote}
                  onTagClick={handleTagClick}
                />
              </div>
            )}
          </main>
        </div>
      </Layout>

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
        onDelete={handleDeleteNote}
        onToggleFavorite={handleToggleFavorite}
        onToggleArchive={handleToggleArchive}
        onOpenRelatedNote={handleEditNote}
        onRevertVersion={handleRevertVersion}
      />
    </>
  );
};

export default Dashboard;

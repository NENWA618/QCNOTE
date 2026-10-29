import Head from 'next/head';
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Layout from '../components/Layout';
import Sidebar from '../components/Sidebar';
import NoteList from '../components/NoteList';
import NoteEditor from '../components/NoteEditor';
import { usePublishedNotes } from '../lib/publicNotes';
import DashboardToolbar, { type DashboardView } from '../components/DashboardToolbar';
import { Trash } from '../components/Trash';
import { Calendar } from '../components/Calendar';
import { Timeline } from '../components/Timeline';
import { KnowledgeGraph } from '../components/KnowledgeGraph';
import WebDAVSync from '../components/WebDAVSync';
import Conflicts from '../components/Conflicts';
import TagManager from '../components/TagManager';
import OneDriveSync, { type OneDriveResult } from '../components/OneDriveSync';
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
  NOTES_DB_RETRY_MS,
} from '../lib/storage';
import { Utils } from '../lib/utils';
import ClipImportDialog from '../components/ClipImportDialog';
import CommandPalette, { type PaletteCommand } from '../components/CommandPalette';
import { toggleTheme } from '../components/DarkModeToggle';
import { isImeComposing } from '../lib/ime';
import { CLIP_HASH_KEY, clipToNote, parseClipFromHash, type ClipPayload } from '../lib/clipImport';
import { useDeviceVerification } from '../lib/hooks/useDeviceVerification';
import { useLocalStorageFlag } from '../lib/hooks/useLocalStorageFlag';
import { useMediaQuery } from '../lib/hooks/useMediaQuery';
import { useSemanticSearch } from '../lib/hooks/useSemanticSearch';
import { alertDialog, confirmDialog, promptDialog } from '../lib/dialog';
import { showNotification } from '../lib/ui';

const SEMANTIC_SEARCH_STORAGE_KEY = 'qcnote:semantic-search-enabled';

const DEFAULT_WEBDAV_CONFIG = {
  url: '',
  username: '',
  password: '',
  remotePath: 'notes.json',
  encryptionKey: '',
  autoSyncEnabled: false,
  syncInterval: 5 * 60 * 1000, // 5 minutes default
  conflictStrategy: 'manual' as 'manual' | 'prefer-local' | 'prefer-remote',
};

// 存储层保存失败时会抛错（而不是假装成功），这里统一提示用户
const reportSaveError = (action: string, err: unknown) => {
  console.error(`[Dashboard] ${action}失败`, err);
  showNotification(
    `${action}失败：${err instanceof Error ? err.message : String(err)}`,
    5000,
    'error',
  );
};

const Dashboard: React.FC = () => {
  // Created once on the client; null while rendering on the server.
  const [storage] = useState<NoteStorage | null>(() =>
    typeof window === 'undefined' ? null : initWindowStorage() || new NoteStorage(),
  );
  const storageRef = useRef<NoteStorage | null>(storage);
  const syncManager = useMemo(() => (storage ? new WebDAVSyncManager(storage) : null), [storage]);
  // The storage outlives this page (it's shared on window), so an auto-sync
  // timer left running would keep syncing after we navigate away, and a
  // second one would start on the next visit.
  useEffect(() => () => syncManager?.stop(), [syncManager]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [categories, setCategories] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalNotes: 0,
    categories: {},
    totalTags: 0,
    createdToday: 0,
  });
  // 移动端（< md，768px）默认收起侧边栏；用户手动切换过之后以用户的选择为准。
  // useMediaQuery 在 SSR 和首次水合时返回 false，避免水合不一致
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [sidebarToggled, setSidebarToggled] = useState<boolean | null>(null);
  const sidebarOpen = sidebarToggled ?? !isMobile;
  const [trashNotes, setTrashNotes] = useState<NoteItem[]>([]);
  const [conflicts, setConflicts] = useState<NoteConflict[]>([]);
  const [viewMode, setViewMode] = useState<DashboardView>('list');
  const viewingTrash = viewMode === 'trash';
  const [webdavConfig, setWebdavConfig] = useState(DEFAULT_WEBDAV_CONFIG);
  const [onedriveConfig, setOnedriveConfig] = useState<OneDriveConfig>({
    accessToken: '',
    folderPath: 'Notes/notes.json',
    encryptionKey: '',
  });
  const [oneDriveConfigSaved, setOneDriveConfigSaved] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [semanticEnabled, setSemanticEnabled] = useLocalStorageFlag(SEMANTIC_SEARCH_STORAGE_KEY);
  const { data: session, status: sessionStatus } = useSession();
  const [pendingClip, setPendingClip] = useState<ClipPayload | null>(() =>
    typeof window === 'undefined' ? null : parseClipFromHash(window.location.hash),
  );
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const {
    published: publishedNotes,
    suspension: publicSuspension,
    publish: publishNote,
    unpublish: unpublishNote,
    unpublishAll: unpublishAllNotes,
  } = usePublishedNotes(Boolean(currentUserId));

  const [paletteOpen, setPaletteOpen] = useState(false);

  // Editor state
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  // 存储层的异常状态：设备未解锁，或有笔记无法解密（已隐藏、不会被改动）
  const [storageLocked, setStorageLocked] = useState(false);
  const [storageLockReason, setStorageLockReason] = useState<string | null>(null);
  const [undecryptableCount, setUndecryptableCount] = useState(0);

  const loadNotes = useCallback(async () => {
    const s = storageRef.current;
    if (!s) return;
    const all = (await s.getDataAsync()) || [];

    setNotes(all);
    setStorageLocked(s.notesDbLocked);
    setStorageLockReason(s.notesDbError);
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
    } else {
      // No config for this user (or it can't be read): never keep showing,
      // or auto-syncing with, the previous user's.
      setWebdavConfig(DEFAULT_WEBDAV_CONFIG);
      setLastSyncTime(null);
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

  // 设备未解锁多半是取不到金库密钥（离线、后端不可用）：联网后立即重试，否则定时重试
  useEffect(() => {
    if (!storageLocked) return;
    const retry = () => void loadNotes();
    const timer = window.setInterval(retry, NOTES_DB_RETRY_MS);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
    };
  }, [storageLocked, loadNotes]);

  const resetLoadedData = useCallback(() => {
    setNotes([]);
    setCategories([]);
    setStats({
      totalNotes: 0,
      categories: {},
      totalTags: 0,
      createdToday: 0,
    });
    setTrashNotes([]);
    setConflicts([]);
  }, []);

  const { deviceVerificationStatus, deviceVerificationMessage } = useDeviceVerification({
    userId: currentUserId,
    storageRef,
    loadNotes,
    onUserChange: resetLoadedData,
  });

  // WebDAVSyncManager runs the only auto-sync loop, following the saved
  // config (it stops itself on a user switch). Keyed on the settings, not the
  // object: loadNotes() sets a fresh copy after every note change.
  const webdavConfigKey = JSON.stringify(webdavConfig);
  useEffect(() => {
    if (!syncManager) return;
    void syncManager.updateConfig(JSON.parse(webdavConfigKey) as WebDAVConfig);
  }, [syncManager, webdavConfigKey]);

  // Show what any manager sync (auto or "立即同步") merged in.
  useEffect(() => {
    if (!syncManager) return;
    let seen = syncManager.getStatus().lastSyncTime;
    return syncManager.onStatusChange(({ lastSyncStatus, lastSyncTime: time }) => {
      if (lastSyncStatus !== 'success' || time === null || time === seen) return;
      seen = time;
      setLastSyncTime(new Date(time));
      void loadNotes();
    });
  }, [syncManager, loadNotes]);

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

    // Tag filter: 点卡片上的标签筛选，多个标签同时满足
    if (selectedTags.length > 0 && !viewingTrash) {
      filtered = filtered.filter((note) => selectedTags.every((t) => note.tags.includes(t)));
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
  }, [notes, search, category, selectedTags, sortBy, viewingTrash, semanticEnabled, semanticIds]);

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
      showNotification('剪藏数据无效或过大，已忽略。', 4000, 'error');
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

  /**
   * 新建笔记：只在内存里打开一份草稿（id 为空），不写入存储。
   * 取消就直接丢弃，不会留下空笔记；第一次保存时才真正创建（见 handleSaveNote）。
   */
  const startNewNote = (title = '') => {
    const now = Date.now();
    setEditingNote({
      id: '',
      title,
      content: '',
      category: '生活',
      tags: [],
      color: '#dc96b4',
      createdAt: now,
      updatedAt: now,
      links: [],
      backlinks: [],
      versions: [],
    });
    setEditorVisible(true);
    setIsPreview(false);
  };

  // 不直接把 startNewNote 交给 onClick：事件对象会被当成标题传进去
  const handleNewNote = () => startNewNote();

  const handleEditNote = (note: NoteItem) => {
    setEditingNote(note);
    setEditorVisible(true);
    setIsPreview(false);
  };

  /** 返回 false 表示保存失败（编辑器据此继续显示“未保存”） */
  const handleSaveNote = async (options?: { keepOpen?: boolean }): Promise<boolean> => {
    const s = storageRef.current;
    if (!s || !editingNote) return false;
    // id 为空 = 还没入库的草稿：这是它第一次保存，在这里才真正创建
    const isDraft = !editingNote.id;
    let savedNote: NoteItem | null;
    try {
      savedNote = isDraft
        ? await s.addNoteAsync(editingNote)
        : await s.updateNoteAsync(editingNote.id, editingNote);
    } catch (err) {
      // 保持编辑器打开，用户的修改还在，可以重试
      reportSaveError('保存笔记', err);
      return false;
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
    if (options?.keepOpen) {
      // 留在编辑器里：只同步存储层算出来的字段（版本、双链、时间）。
      // 不能整篇换成 savedNote——保存的这一小会儿用户可能又输入了新内容，整篇替换会把它丢掉
      if (savedNote) {
        const saved = savedNote;
        setEditingNote((prev) =>
          prev && (prev.id === saved.id || (isDraft && prev.id === ''))
            ? {
                ...prev,
                // 草稿第一次保存：拿到存储分配的 id，之后的保存就是更新这篇
                id: saved.id,
                createdAt: saved.createdAt,
                versions: saved.versions,
                links: saved.links,
                backlinks: saved.backlinks,
                updatedAt: saved.updatedAt,
                sentimentScore: saved.sentimentScore,
                sentimentComparative: saved.sentimentComparative,
                sentimentCategory: saved.sentimentCategory,
              }
            : prev,
        );
      }
    } else {
      setEditorVisible(false);
      setEditingNote(null);
    }
    // 没有任何提示的话用户不确定有没有存上
    showNotification('已保存', 1800, 'success');
    return true;
  };

  // 删除本地笔记不会自动取消公开副本，所以在删除前问一句。
  // 返回 false 表示应中止删除（取消发布失败时保留笔记，用户才有机会重试）。
  // 主页被管理员关闭时用户无法取消发布，也就没有可问的：直接放行本地删除，服务器上的副本保留。
  const confirmUnpublishBeforeRemoval = async (id: string): Promise<boolean> => {
    if (!publishedNotes[id] || publicSuspension) return true;
    // danger：默认焦点落在“保留公开副本”（不会删除任何东西的那一项）
    const alsoUnpublish = await confirmDialog({
      title: '这篇笔记已公开',
      description:
        '它公开在你的个人主页上。\n\n“同时取消发布”会删除服务器上的公开副本；“保留公开副本”只删除本地笔记。',
      confirmLabel: '同时取消发布',
      cancelLabel: '保留公开副本',
      tone: 'danger',
    });
    if (!alsoUnpublish) return true;
    const result = await unpublishNote(id);
    if (!result.ok) {
      await alertDialog({
        title: '取消发布失败',
        description: `笔记未删除：${result.error}`,
      });
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
      showNotification(`成功导入 ${count} 条笔记`, 3000, 'success');
    } catch (err) {
      await alertDialog({ title: '导入失败', description: String(err) || '导入失败' });
    }
  };

  const handleClearAll = async () => {
    const s = storageRef.current;
    if (!s) return;
    const typed = await promptDialog({
      title: '清空所有笔记？',
      description: '此操作将删除所有笔记且无法撤销。请输入“清空”以确认：',
      placeholder: '清空',
      confirmLabel: '清空全部',
      tone: 'danger',
    });
    if (typed?.trim() === '清空') {
      const publishedCount = publicSuspension ? 0 : Object.keys(publishedNotes).length;
      if (
        publishedCount > 0 &&
        (await confirmDialog({
          title: `你有 ${publishedCount} 篇公开笔记`,
          description:
            '它们公开在你的个人主页上。\n\n“同时取消发布”会删除服务器上的全部公开副本；“保留公开副本”只清空本地笔记。',
          confirmLabel: '同时取消发布',
          cancelLabel: '保留公开副本',
          tone: 'danger',
        }))
      ) {
        const result = await unpublishAllNotes();
        if (!result.ok) {
          await alertDialog({
            title: '取消发布失败',
            description: `笔记未清空：${result.error}`,
          });
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

  const handleOneDriveSync = async (config: OneDriveConfig): Promise<OneDriveResult> => {
    const s = storageRef.current;
    if (!s) return { ok: false, error: '存储尚未就绪，请稍后再试' };

    const changed =
      config.accessToken !== onedriveConfig.accessToken ||
      config.folderPath !== onedriveConfig.folderPath ||
      (config.encryptionKey || '') !== (onedriveConfig.encryptionKey || '');
    if (changed || !oneDriveConfigSaved) {
      const saved = await s.setOneDriveConfigAsync(config);
      setOneDriveConfigSaved(saved);
      if (!saved) return { ok: false, error: 'OneDrive 配置保存失败，无法执行同步' };
      setOnedriveConfig(config);
    }

    const success = await s.syncWithOneDriveAsync(config, Boolean(config.encryptionKey));
    if (!success) {
      return {
        ok: false,
        error:
          'OneDrive 同步失败，远端文件未被改动。请检查访问令牌、路径，以及加密密钥是否与其他设备一致',
      };
    }
    await loadNotes();
    return { ok: true };
  };

  const handleSaveOneDriveConfig = async (config: OneDriveConfig): Promise<boolean> => {
    const s = storageRef.current;
    if (!s) return false;
    const saved = await s.setOneDriveConfigAsync(config);
    if (saved) setOnedriveConfig(config);
    setOneDriveConfigSaved(saved);
    return saved;
  };

  const handleClearOneDriveConfig = async (): Promise<boolean> => {
    const s = storageRef.current;
    if (!s) return false;
    const cleared = await s.clearOneDriveConfigAsync();
    if (!cleared) return false;
    setOnedriveConfig({ accessToken: '', folderPath: 'Notes/notes.json', encryptionKey: '' });
    setOneDriveConfigSaved(false);
    return true;
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

  // 命令面板：Ctrl/⌘+K。编辑器或对话框打开时不响应（它们是模态的，面板叠上去会抢焦点）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k')
        return;
      if (isImeComposing(e)) return;
      const modal = document.querySelector('[aria-modal="true"]');
      // 面板自己打开时再按一次就是关闭
      if (modal && !paletteOpen) return;
      e.preventDefault();
      setPaletteOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen]);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const go = (view: typeof viewMode) => () => {
      setViewMode(view);
    };
    return [
      {
        id: 'new',
        label: '新建笔记',
        icon: '➕',
        keywords: 'new create 创建 写',
        run: handleNewNote,
      },
      {
        id: 'list',
        label: '切换到列表视图',
        icon: '📝',
        keywords: 'list 笔记 首页',
        run: go('list'),
      },
      {
        id: 'calendar',
        label: '切换到日历视图',
        icon: '📅',
        keywords: 'calendar 月历',
        run: go('calendar'),
      },
      {
        id: 'timeline',
        label: '切换到时间线视图',
        icon: '📊',
        keywords: 'timeline',
        run: go('timeline'),
      },
      {
        id: 'graph',
        label: '切换到知识图谱',
        icon: '🧠',
        keywords: 'graph 双链 关系',
        run: go('graph'),
      },
      { id: 'tags', label: '标签管理', icon: '🏷️', keywords: 'tags 重命名', run: go('tags') },
      {
        id: 'cloud',
        label: '云端同步',
        icon: '☁️',
        keywords: 'sync webdav onedrive 同步',
        run: go('cloud'),
      },
      {
        id: 'conflicts',
        label: '同步冲突',
        icon: '⚠️',
        keywords: 'conflict',
        run: go('conflicts'),
      },
      {
        id: 'trash',
        label: '回收站',
        icon: '🗑️',
        keywords: 'trash 删除 恢复',
        run: go('trash'),
      },
      {
        id: 'theme',
        label: '切换深色 / 浅色模式',
        icon: '🌓',
        keywords: 'dark light theme 主题 夜间',
        run: toggleTheme,
      },
      {
        id: 'export',
        label: '导出数据',
        icon: '📤',
        keywords: 'export backup 备份',
        run: handleExport,
      },
    ];
    // 这些处理函数每次渲染都会重建，但只在面板打开时才会被调用；依赖放进来会让命令列表每次渲染都重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasFilters = !!search || category !== 'all' || selectedTags.length > 0;
  const clearFilters = () => {
    setSearch('');
    setCategory('all');
    setSelectedTags([]);
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
      setWebdavConfig(DEFAULT_WEBDAV_CONFIG);
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
      updatedAt: Date.now(),
    };

    try {
      await s.updateNoteAsync(editingNote.id, revertedNote);
    } catch (err) {
      reportSaveError('恢复版本', err);
      return;
    }
    await loadNotes();
    showNotification('已恢复到所选版本', 3000, 'success');
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
        {deviceVerificationStatus !== 'idle' && (
          <div
            role={deviceVerificationStatus === 'failed' ? 'alert' : 'status'}
            className={`fixed top-20 left-1/2 z-30 w-[min(calc(100vw-2rem),40rem)] -translate-x-1/2 rounded-2xl border p-4 text-sm shadow-lg sm:top-24 ${
              deviceVerificationStatus === 'failed'
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200'
            }`}
          >
            <div className="flex items-start gap-2">
              {deviceVerificationStatus === 'pending' && (
                <span
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              )}
              <p>
                {deviceVerificationMessage ||
                  (deviceVerificationStatus === 'pending'
                    ? '正在校验登录会话，加载笔记页面请稍候。'
                    : '登录会话已验证。')}
              </p>
            </div>
            {deviceVerificationStatus === 'failed' && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs opacity-80">
                  一个账号同一时间只能在一处登录，在别处登录会让这里退出。
                </span>
                <button
                  onClick={() => void signOut({ callbackUrl: '/signin' })}
                  className="btn btn-sm btn-primary shrink-0"
                >
                  重新登录
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex min-h-[calc(100vh-14rem)] flex-col gap-4 md:flex-row md:items-start md:gap-6">
          {/* Sidebar */}
          <Sidebar
            isOpen={sidebarOpen}
            onToggle={() => setSidebarToggled(!sidebarOpen)}
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

          {/* Main Content（Layout 已经提供 <main>，这里不能再嵌套一个） */}
          <section aria-labelledby="dashboard-title" className="min-w-0 flex-1">
            {(storageLocked || undecryptableCount > 0) && (
              <div
                role="alert"
                className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
              >
                {storageLocked
                  ? '当前设备未解锁（无法获取加密密钥），暂时无法读取或保存笔记。恢复联网后会自动重试；如果一直无法解锁，请重新验证当前设备。'
                  : `有 ${undecryptableCount} 条笔记无法解密，已暂时隐藏。它们不会被修改、删除或同步，原始数据仍保留在本机。`}
                {storageLocked && storageLockReason && (
                  <span className="mt-1 block break-all text-xs opacity-80">
                    原因：{storageLockReason}
                  </span>
                )}
              </div>
            )}

            {/* Header Controls */}
            <div className="mb-4 flex flex-col gap-3 sm:mb-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-baseline gap-2">
                <h1
                  id="dashboard-title"
                  className="text-xl font-bold text-ink sm:text-2xl dark:text-dark-text"
                >
                  笔记管理
                </h1>
                {viewMode === 'list' && (
                  <span className="text-sm tabular-nums text-text-light">
                    {hasFilters
                      ? `${filteredNotes.length} / ${stats.totalNotes} 篇`
                      : `${filteredNotes.length} 篇`}
                  </span>
                )}
              </div>
              <DashboardToolbar
                viewMode={viewMode}
                trashCount={trashNotes.length}
                conflictCount={conflicts.length}
                onSelectView={setViewMode}
                onNewNote={handleNewNote}
                onExport={handleExport}
                onImport={handleImport}
                onClearAll={handleClearAll}
              />
            </div>

            {/* 当前的标签筛选 */}
            {viewMode === 'list' && selectedTags.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-text-light">标签筛选：</span>
                {selectedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleTagClick(tag)}
                    aria-label={`取消按 #${tag} 筛选`}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-pink px-2.5 py-1 text-xs text-white hover:opacity-90"
                  >
                    #{tag} <span aria-hidden="true">✕</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-ink-pink hover:underline"
                >
                  清除
                </button>
              </div>
            )}

            {/* View Content */}
            {viewingTrash ? (
              <Trash
                trashNotes={trashNotes}
                onRestore={handleRestoreNote}
                onPermanentlyDelete={handlePermanentlyDeleteNote}
              />
            ) : viewMode === 'calendar' ? (
              <Calendar notes={notes} onSelectNote={handleEditNote} />
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
                onSelectNote={handleEditNote}
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
                  published={publicSuspension ? undefined : publishedNotes}
                  filtered={hasFilters}
                  onClearFilters={clearFilters}
                  onNewNote={handleNewNote}
                  selectedTags={selectedTags}
                />
              </div>
            )}
          </section>
        </div>
      </Layout>

      <ClipImportDialog
        clip={clipImportReady ? pendingClip : null}
        onConfirm={handleConfirmClip}
        onDiscard={() => setPendingClip(null)}
      />

      <CommandPalette
        isOpen={paletteOpen}
        notes={notes.filter((n) => !n.isDeleted)}
        commands={paletteCommands}
        onClose={() => setPaletteOpen(false)}
        onOpenNote={handleEditNote}
        onCreateNote={startNewNote}
      />

      {/* Note Editor Modal */}
      <NoteEditor
        note={editingNote}
        isVisible={editorVisible}
        isPreview={isPreview}
        relatedNotes={relatedNotes}
        allNotes={notes}
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
        onOpenRelatedNote={handleEditNote}
        onRevertVersion={handleRevertVersion}
        onPublish={currentUserId ? publishNote : undefined}
        onUnpublish={currentUserId ? unpublishNote : undefined}
        publishInfo={editingNote ? publishedNotes[editingNote.id] : undefined}
        publishSuspension={publicSuspension}
      />
    </>
  );
};

export default Dashboard;

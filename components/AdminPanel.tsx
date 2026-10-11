import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { withApiBaseUrl } from '../lib/api-client';
import PushNotificationManager from './PushNotificationManager';

type Role = 'user' | 'moderator' | 'admin';
type RoleFilter = 'all' | Role;
type Tab = 'users' | 'push';

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: number;
}

interface Notice {
  type: 'success' | 'error';
  text: string;
}

const PAGE_SIZE = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'user', label: '普通用户', description: '只能管理自己的笔记' },
  { value: 'moderator', label: '版主', description: '可以管理社区公开内容' },
  { value: 'admin', label: '管理员', description: '拥有全部权限，包括本面板' },
];

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  moderator: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  user: 'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
};

const getRoleText = (role: string) =>
  ROLE_OPTIONS.find((o) => o.value === role)?.label ?? '普通用户';

const getErrorMessage = (error: unknown, fallback: string) =>
  (axios.isAxiosError<{ error?: string }>(error) && error.response?.data?.error) || fallback;

const formatDate = (ts: number) => new Date(ts).toLocaleDateString('zh-CN');

const shortId = (id: string) => (id.length > 16 ? `${id.slice(0, 16)}…` : id);

type UsersResult = { users: User[]; error: null } | { users: null; error: string };

async function fetchAdminUsers(): Promise<UsersResult> {
  try {
    const response = await axios.get(withApiBaseUrl('/api/admin/users'));
    return { users: response.data.users ?? [], error: null };
  } catch (error) {
    console.error('Failed to load admin users:', error);
    return { users: null, error: getErrorMessage(error, '用户列表加载失败') };
  }
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[role] ?? ROLE_BADGE.user}`}
    >
      {getRoleText(role)}
    </span>
  );
}

const panelClass =
  'bg-white dark:bg-dark-surface rounded-2xl border border-primary-light/40 dark:border-dark-border';

export default function AdminPanel() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  // 列表的拉取时间，"近 7 天新增"以它为基准，避免在渲染中调用 Date.now()
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [tab, setTab] = useState<Tab>('users');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<Role>('user');
  const [saving, setSaving] = useState(false);
  const [showSetAdmin, setShowSetAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [settingAdmin, setSettingAdmin] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [page, setPage] = useState(1);

  const applyUsersResult = useCallback((result: UsersResult) => {
    if (result.users) {
      setUsers(result.users);
      setLoadedAt(Date.now());
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, []);

  const loadData = useCallback(async () => {
    applyUsersResult(await fetchAdminUsers());
  }, [applyUsersResult]);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminUsers().then((result) => {
      if (cancelled) return;
      applyUsersResult(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [applyUsersResult]);

  // 提示 4 秒后自动消失
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // 弹窗打开时：Esc 关闭，并锁住背景滚动（移动端底部弹层下拖时不会带动页面）
  useEffect(() => {
    if (!selectedUser) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) setSelectedUser(null);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedUser, saving]);

  const isSelf = useCallback(
    (user: User) => {
      const me = session?.user;
      if (!me) return false;
      if (me.id && me.id === user.id) return true;
      return !!me.email && me.email.toLowerCase() === user.email?.toLowerCase();
    },
    [session],
  );

  const openRoleModal = (user: User) => {
    setNewRole(user.role);
    setSelectedUser(user);
  };

  const updateUserRole = async () => {
    if (!selectedUser || saving) return;
    if (newRole === selectedUser.role) {
      setSelectedUser(null);
      return;
    }
    if (
      isSelf(selectedUser) &&
      newRole !== 'admin' &&
      !window.confirm('你正在修改自己的角色，降级后将失去管理员权限。确定继续吗？')
    ) {
      return;
    }

    setSaving(true);
    try {
      await axios.put(withApiBaseUrl('/api/admin/roles'), {
        userId: selectedUser.id,
        role: newRole,
      });
      setNotice({ type: 'success', text: '用户角色更新成功' });
      setSelectedUser(null);
      await loadData();
    } catch (error) {
      console.error('Failed to update user role:', error);
      setNotice({ type: 'error', text: getErrorMessage(error, '更新失败，请重试') });
    } finally {
      setSaving(false);
    }
  };

  const closeSetAdmin = () => {
    setShowSetAdmin(false);
    setAdminEmail('');
  };

  const setAdminByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (settingAdmin) return;
    if (!adminEmail.trim()) {
      setNotice({ type: 'error', text: '请输入邮箱地址' });
      return;
    }

    setSettingAdmin(true);
    try {
      const response = await axios.post(withApiBaseUrl('/api/admin/set-admin'), {
        email: adminEmail.trim(),
      });

      if (response.data.success) {
        setNotice({
          type: 'success',
          text: `管理员设置成功：${response.data.user.name} (${response.data.user.email})`,
        });
        closeSetAdmin();
        await loadData();
      }
    } catch (error: unknown) {
      console.error('Failed to set admin:', error);
      setNotice({ type: 'error', text: getErrorMessage(error, '设置失败，请重试') });
    } finally {
      setSettingAdmin(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const stats = useMemo(() => {
    const weekAgo = loadedAt - WEEK_MS;
    return {
      total: users.length,
      admin: users.filter((u) => u.role === 'admin').length,
      moderator: users.filter((u) => u.role === 'moderator').length,
      recent: users.filter((u) => u.createdAt >= weekAgo).length,
    };
  }, [users, loadedAt]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!keyword) return true;
      return [u.id, u.name, u.email].some((field) => field?.toLowerCase().includes(keyword));
    });
  }, [users, search, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center" role="status">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-pink"></div>
        <span className="sr-only">加载中…</span>
      </div>
    );
  }

  const filterChips: { value: RoleFilter; label: string; count: number }[] = [
    { value: 'all', label: '全部', count: stats.total },
    { value: 'admin', label: '管理员', count: stats.admin },
    { value: 'moderator', label: '版主', count: stats.moderator },
    { value: 'user', label: '普通用户', count: stats.total - stats.admin - stats.moderator },
  ];

  const statTiles = [
    { label: '用户总数', value: stats.total },
    { label: '管理员', value: stats.admin },
    { label: '版主', value: stats.moderator },
    { label: '近 7 天新增', value: stats.recent },
  ];

  const tabs: { value: Tab; label: string }[] = [
    { value: 'users', label: '用户管理' },
    { value: 'push', label: '推送通知' },
  ];

  const emptyText = users.length === 0 ? '暂无用户' : '没有匹配的用户';
  const thClass =
    'px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 tracking-wider';

  return (
    <div className="dark:text-dark-text">
      {/* 标题 */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-ink dark:text-dark-text">
            管理员面板
          </h1>
          <p className="mt-1 text-sm sm:text-base text-text-light">管理系统用户和推送通知</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="btn btn-secondary shrink-0"
          aria-label="刷新数据"
        >
          <span aria-hidden="true" className={refreshing ? 'inline-block animate-spin' : ''}>
            ↻
          </span>
          <span className="hidden sm:inline">{refreshing ? '刷新中…' : '刷新'}</span>
        </button>
      </div>

      {loadError && (
        <div
          role="alert"
          className="mb-6 flex items-center justify-between gap-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200"
        >
          <span>数据加载失败：{loadError}</span>
          <button
            type="button"
            onClick={refresh}
            className="shrink-0 font-medium underline min-h-[2.75rem]"
          >
            重试
          </button>
        </div>
      )}

      {/* 统计 */}
      <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statTiles.map((s) => (
          <div key={s.label} className={`${panelClass} px-4 py-3 sm:px-5 sm:py-4`}>
            <p className="text-xs sm:text-sm text-text-light">{s.label}</p>
            <p className="mt-1 text-2xl sm:text-3xl font-semibold tabular-nums text-ink dark:text-dark-text">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* 分区切换 */}
      <div
        role="tablist"
        aria-label="管理分区"
        className="mb-4 inline-flex w-full sm:w-auto rounded-full bg-white/70 dark:bg-dark-surface p-1 border border-primary-light/40 dark:border-dark-border"
      >
        {tabs.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              id={`admin-tab-${t.value}`}
              aria-selected={active}
              aria-controls={`admin-panel-${t.value}`}
              onClick={() => setTab(t.value)}
              className={`flex-1 sm:flex-none min-h-[2.5rem] px-5 rounded-full text-sm font-medium transition-colors ${
                active
                  ? 'bg-linear-to-r from-accent-pink to-accent-purple text-white shadow-sm'
                  : 'text-text-light hover:text-ink dark:hover:text-dark-text'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'push' && (
        <div role="tabpanel" id="admin-panel-push" aria-labelledby="admin-tab-push">
          <PushNotificationManager />
        </div>
      )}

      {tab === 'users' && (
        <section
          role="tabpanel"
          id="admin-panel-users"
          aria-labelledby="admin-tab-users"
          className={`${panelClass} overflow-hidden`}
        >
          {/* 工具栏 */}
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-dark-border space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text sm:mr-auto">
                用户列表
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  {filteredUsers.length} 人
                </span>
              </h2>
              <div className="flex gap-2 sm:gap-3">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索姓名 / 邮箱 / ID"
                  aria-label="搜索用户"
                  className="input py-2 min-w-0 flex-1 sm:w-64 sm:flex-none"
                />
                <button
                  type="button"
                  onClick={() => (showSetAdmin ? closeSetAdmin() : setShowSetAdmin(true))}
                  aria-expanded={showSetAdmin}
                  className={`btn shrink-0 ${showSetAdmin ? 'btn-secondary' : 'btn-primary'}`}
                >
                  {showSetAdmin ? '取消' : '设置管理员'}
                </button>
              </div>
            </div>

            {/* 角色筛选：窄屏下横向滚动，不换行挤占高度 */}
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto [scrollbar-width:none]">
              {filterChips.map((c) => {
                const active = roleFilter === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setRoleFilter(c.value);
                      setPage(1);
                    }}
                    className={`shrink-0 min-h-[2.25rem] rounded-full px-3 text-sm border transition-colors ${
                      active
                        ? 'border-accent-pink bg-primary-light text-ink-pink dark:bg-accent-pink/20'
                        : 'border-gray-200 text-gray-600 hover:border-accent-pink/60 dark:border-dark-border dark:text-dark-text-secondary'
                    }`}
                  >
                    {c.label}
                    <span className="ml-1.5 tabular-nums opacity-70">{c.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 设置管理员表单 */}
          {showSetAdmin && (
            <form
              onSubmit={setAdminByEmail}
              className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-primary-light/40 dark:bg-dark-surface-light/60"
            >
              <label
                htmlFor="admin-email"
                className="block text-sm font-medium text-gray-800 dark:text-dark-text mb-1"
              >
                新管理员的邮箱地址
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  id="admin-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoFocus
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="user@gmail.com"
                  disabled={settingAdmin}
                  className="input py-2 sm:max-w-md"
                />
                <button
                  type="submit"
                  disabled={settingAdmin || !adminEmail.trim()}
                  className="btn btn-danger shrink-0"
                >
                  {settingAdmin ? '设置中…' : '设置为管理员'}
                </button>
              </div>
              <p className="text-xs text-text-light mt-2">
                OAuth 用户的邮箱地址；对方需要先登录过一次
              </p>
            </form>
          )}

          {/* 桌面端：表格 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-gray-50 dark:bg-dark-surface-light">
                <tr>
                  <th className={thClass}>用户</th>
                  <th className={`${thClass} hidden lg:table-cell`}>用户ID</th>
                  <th className={thClass}>角色</th>
                  <th className={thClass}>注册时间</th>
                  <th className={`${thClass} text-right`}>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {pageUsers.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      {emptyText}
                    </td>
                  </tr>
                )}
                {pageUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-primary-light/30 dark:hover:bg-dark-surface-light transition-colors"
                  >
                    <td className="px-4 lg:px-6 py-3 max-w-xs">
                      <div className="text-sm font-medium text-gray-900 dark:text-dark-text truncate">
                        {user.name}
                        {isSelf(user) && (
                          <span className="ml-2 text-xs font-normal text-gray-400">（你）</span>
                        )}
                      </div>
                      <div
                        className="text-sm text-gray-500 dark:text-gray-400 truncate"
                        title={user.email}
                      >
                        {user.email}
                      </div>
                    </td>
                    <td
                      title={user.id}
                      className="hidden lg:table-cell px-4 lg:px-6 py-3 whitespace-nowrap text-xs font-mono text-gray-500 dark:text-gray-400"
                    >
                      {shortId(user.id)}
                    </td>
                    <td className="px-4 lg:px-6 py-3 whitespace-nowrap">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 lg:px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 lg:px-6 py-3 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => openRoleModal(user)}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-pink hover:bg-primary-light dark:hover:bg-accent-pink/15"
                      >
                        修改角色
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 移动端：卡片列表，整行可点 */}
          <ul className="md:hidden divide-y divide-gray-100 dark:divide-dark-border">
            {pageUsers.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                {emptyText}
              </li>
            )}
            {pageUsers.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => openRoleModal(user)}
                  aria-label={`修改 ${user.name} 的角色`}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-primary-light/40 dark:active:bg-dark-surface-light"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-dark-text">
                        {user.name}
                      </span>
                      {isSelf(user) && (
                        <span className="shrink-0 text-xs text-gray-400">（你）</span>
                      )}
                    </div>
                    <div className="truncate text-sm text-gray-500 dark:text-gray-400">
                      {user.email}
                    </div>
                    <div className="mt-1 text-xs text-gray-400 tabular-nums">
                      注册于 {formatDate(user.createdAt)}
                    </div>
                  </div>
                  <RoleBadge role={user.role} />
                  <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav
              aria-label="分页"
              className="px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-dark-border flex items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400"
            >
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="btn btn-sm btn-secondary"
              >
                上一页
              </button>
              <span className="tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="btn btn-sm btn-secondary"
              >
                下一页
              </button>
            </nav>
          )}
        </section>
      )}

      {/* 操作结果提示：固定在底部，滚动到哪里都能看到 */}
      {notice && (
        <div
          role="status"
          className={`fixed z-[60] left-4 right-4 bottom-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm flex items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${
            notice.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800'
              : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800'
          }`}
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <span className="flex-1 break-words">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="关闭提示"
            className="-m-1 p-1 opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* 修改角色：桌面端居中弹窗，移动端底部弹层 */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => !saving && setSelectedUser(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-dialog-title"
            className="w-full sm:max-w-md bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              aria-hidden="true"
              className="sm:hidden mx-auto -mt-1 mb-4 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600"
            />
            <h3
              id="role-dialog-title"
              className="text-lg font-semibold text-gray-900 dark:text-dark-text"
            >
              修改用户角色
            </h3>
            <div className="mt-3 mb-5 rounded-xl bg-gray-50 dark:bg-dark-surface-light px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-gray-900 dark:text-dark-text">
                  {selectedUser.name}
                </span>
                <RoleBadge role={selectedUser.role} />
              </div>
              <div className="truncate text-sm text-gray-500 dark:text-gray-400">
                {selectedUser.email}
              </div>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                新角色
              </legend>
              <div className="space-y-2">
                {ROLE_OPTIONS.map((o) => {
                  const checked = newRole === o.value;
                  return (
                    <label
                      key={o.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-colors ${
                        checked
                          ? 'border-accent-pink bg-primary-light/50 dark:bg-accent-pink/10'
                          : 'border-gray-200 hover:border-accent-pink/50 dark:border-dark-border'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={o.value}
                        checked={checked}
                        autoFocus={checked}
                        onChange={() => setNewRole(o.value)}
                        className="h-4 w-4 accent-[#dc96b4]"
                      />
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-gray-900 dark:text-dark-text">
                          {o.label}
                          {o.value === selectedUser.role && (
                            <span className="ml-2 text-xs font-normal text-gray-400">当前</span>
                          )}
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {o.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {isSelf(selectedUser) && (
                <p className="mt-3 text-xs text-red-600 dark:text-red-400">
                  这是你自己的账号，降级后将失去管理员权限。
                </p>
              )}
            </fieldset>

            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                disabled={saving}
                className="btn btn-secondary"
              >
                取消
              </button>
              <button
                type="button"
                onClick={updateUserRole}
                disabled={saving || newRole === selectedUser.role}
                className="btn btn-primary"
              >
                {saving ? '保存中…' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

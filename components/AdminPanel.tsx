import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { withApiBaseUrl } from '../lib/api-client';
import PushNotificationManager from './PushNotificationManager';
import { confirmDialog } from '../lib/dialog';

type Role = 'user' | 'admin';
// “主页已关闭”不是角色，但管理员同样需要按它筛选
type UserFilter = 'all' | Role | 'suspended';
type Tab = 'users' | 'push';

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: number;
  // 主页与公开笔记被管理员关闭：内容仍保留在服务器上，只是对外不可见、作者也不能再操作
  publicSuspended: boolean;
  publicSuspendedAt: number | null;
  publicSuspendedReason: string;
}

interface Notice {
  type: 'success' | 'error';
  text: string;
}

const PAGE_SIZE = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'user', label: '普通用户', description: '只能管理自己的笔记' },
  { value: 'admin', label: '管理员', description: '拥有全部权限，包括本面板' },
];

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  user: 'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200',
};

const getRoleText = (role: string) =>
  ROLE_OPTIONS.find((o) => o.value === role)?.label ?? '普通用户';

const getErrorMessage = (error: unknown, fallback: string) =>
  (axios.isAxiosError<{ error?: string }>(error) && error.response?.data?.error) || fallback;

const formatDate = (ts: number) => new Date(ts).toLocaleDateString('zh-CN');

const MAX_REASON_LENGTH = 500;

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

function SuspendedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
      主页已关闭
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
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendBusy, setSuspendBusy] = useState(false);
  const [showSetAdmin, setShowSetAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [settingAdmin, setSettingAdmin] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserFilter>('all');
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
    const busy = saving || suspendBusy;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setSelectedUser(null);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedUser, saving, suspendBusy]);

  const isSelf = useCallback(
    (user: User) => {
      const me = session?.user;
      if (!me) return false;
      if (me.id && me.id === user.id) return true;
      return !!me.email && me.email.toLowerCase() === user.email?.toLowerCase();
    },
    [session],
  );

  const openUserModal = (user: User) => {
    setNewRole(user.role);
    setSuspendReason('');
    setSelectedUser(user);
  };

  const updateUserRole = async () => {
    if (!selectedUser || saving) return;
    if (newRole === selectedUser.role) {
      setSelectedUser(null);
      return;
    }
    if (isSelf(selectedUser) && newRole !== 'admin') {
      const ok = await confirmDialog({
        title: '降低自己的权限？',
        description: '你正在修改自己的角色，降级后将失去管理员权限。确定继续吗？',
        confirmLabel: '确定降级',
        tone: 'danger',
      });
      if (!ok) return;
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

  // 关闭 / 恢复主页与公开笔记。关闭不会删除任何公开笔记，违规内容作为证据保留。
  const updatePublicSuspension = async (suspended: boolean) => {
    if (!selectedUser || suspendBusy || saving) return;
    const target = `${selectedUser.name}（${selectedUser.email}）`;
    const confirmed = await confirmDialog({
      title: suspended ? '关闭个人主页？' : '恢复个人主页？',
      description: suspended
        ? `确定关闭 ${target} 的个人主页和公开笔记吗？\n\n公开笔记不会被删除，会作为证据保留在服务器上。关闭后别人无法再访问，该用户也无法发布、更新发布或取消发布公开笔记。`
        : `确定恢复 ${target} 的个人主页和公开笔记吗？\n\n恢复后别人可以重新访问，该用户也可以重新管理公开笔记。`,
      confirmLabel: suspended ? '关闭' : '恢复',
      tone: suspended ? 'danger' : 'default',
    });
    if (!confirmed) return;

    setSuspendBusy(true);
    try {
      await axios.post(
        withApiBaseUrl(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/public-suspension`),
        suspended ? { suspended, reason: suspendReason.trim() } : { suspended },
      );
      setNotice({
        type: 'success',
        text: suspended ? '已关闭该用户的主页和公开笔记' : '已恢复该用户的主页和公开笔记',
      });
      setSelectedUser(null);
      await loadData();
    } catch (error) {
      console.error('Failed to update public suspension:', error);
      setNotice({ type: 'error', text: getErrorMessage(error, '操作失败，请重试') });
    } finally {
      setSuspendBusy(false);
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
      suspended: users.filter((u) => u.publicSuspended).length,
      recent: users.filter((u) => u.createdAt >= weekAgo).length,
    };
  }, [users, loadedAt]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter((u) => {
      if (
        roleFilter === 'suspended'
          ? !u.publicSuspended
          : roleFilter !== 'all' && u.role !== roleFilter
      ) {
        return false;
      }
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

  const filterChips: { value: UserFilter; label: string; count: number }[] = [
    { value: 'all', label: '全部', count: stats.total },
    { value: 'admin', label: '管理员', count: stats.admin },
    { value: 'user', label: '普通用户', count: stats.total - stats.admin },
    { value: 'suspended', label: '主页已关闭', count: stats.suspended },
  ];

  const statTiles = [
    { label: '用户总数', value: stats.total },
    { label: '管理员', value: stats.admin },
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
      <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
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
                      <div className="flex items-center gap-2">
                        <RoleBadge role={user.role} />
                        {user.publicSuspended && <SuspendedBadge />}
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 lg:px-6 py-3 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => openUserModal(user)}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-pink hover:bg-primary-light dark:hover:bg-accent-pink/15"
                      >
                        管理
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
                  onClick={() => openUserModal(user)}
                  aria-label={`管理 ${user.name}`}
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
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <RoleBadge role={user.role} />
                    {user.publicSuspended && <SuspendedBadge />}
                  </div>
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
          onClick={() => !saving && !suspendBusy && setSelectedUser(null)}
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
              管理用户
            </h3>
            <div className="mt-3 mb-5 rounded-xl bg-gray-50 dark:bg-dark-surface-light px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-gray-900 dark:text-dark-text">
                  {selectedUser.name}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <RoleBadge role={selectedUser.role} />
                  {selectedUser.publicSuspended && <SuspendedBadge />}
                </div>
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

            {/* 主页与公开笔记：独立于角色，点按钮立即生效 */}
            {!isSelf(selectedUser) && (
              <section
                aria-labelledby="suspension-title"
                className="mt-5 rounded-xl border border-gray-200 dark:border-dark-border px-4 py-3"
              >
                <h4
                  id="suspension-title"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  主页与公开笔记
                </h4>
                {selectedUser.publicSuspended ? (
                  <>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      已于{' '}
                      {selectedUser.publicSuspendedAt
                        ? formatDate(selectedUser.publicSuspendedAt)
                        : '—'}{' '}
                      关闭：别人无法访问，该用户不能发布、更新发布或取消发布。公开笔记仍保留在服务器上。
                    </p>
                    {selectedUser.publicSuspendedReason && (
                      <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                        原因：{selectedUser.publicSuspendedReason}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => updatePublicSuspension(false)}
                      disabled={suspendBusy || saving}
                      className="btn btn-secondary btn-sm mt-3 w-full sm:w-auto"
                    >
                      {suspendBusy ? '处理中…' : '恢复主页与公开笔记'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      关闭后别人无法访问其主页和公开笔记，该用户也无法发布、更新发布或取消发布。公开笔记不会被删除，会作为证据保留。
                    </p>
                    <label htmlFor="suspend-reason" className="sr-only">
                      关闭原因
                    </label>
                    <textarea
                      id="suspend-reason"
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      maxLength={MAX_REASON_LENGTH}
                      rows={2}
                      disabled={suspendBusy}
                      placeholder="关闭原因（选填，会显示给该用户）"
                      className="input mt-2 py-2 resize-y"
                    />
                    <button
                      type="button"
                      onClick={() => updatePublicSuspension(true)}
                      disabled={suspendBusy || saving}
                      className="btn btn-danger btn-sm mt-3 w-full sm:w-auto"
                    >
                      {suspendBusy ? '处理中…' : '关闭主页与公开笔记'}
                    </button>
                  </>
                )}
              </section>
            )}

            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                disabled={saving || suspendBusy}
                className="btn btn-secondary"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={updateUserRole}
                disabled={saving || suspendBusy || newRole === selectedUser.role}
                className="btn btn-primary"
              >
                {saving ? '保存中…' : '保存角色'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

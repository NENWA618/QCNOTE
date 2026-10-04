import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { withApiBaseUrl } from '../lib/api-client';
import PushNotificationManager from './PushNotificationManager';

type Role = 'user' | 'moderator' | 'admin';

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

interface Notice {
  type: 'success' | 'error';
  text: string;
}

const PAGE_SIZE = 20;

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'user', label: '普通用户' },
  { value: 'moderator', label: '版主' },
  { value: 'admin', label: '管理员' },
];

const getRoleColor = (role: string) => {
  switch (role) {
    case 'admin':
      return 'bg-red-100 text-red-800';
    case 'moderator':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getRoleText = (role: string) =>
  ROLE_OPTIONS.find((o) => o.value === role)?.label ?? '普通用户';

const getErrorMessage = (error: unknown, fallback: string) =>
  (axios.isAxiosError<{ error?: string }>(error) && error.response?.data?.error) || fallback;

export default function AdminPanel() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<Role>('user');
  const [saving, setSaving] = useState(false);
  const [showSetAdmin, setShowSetAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    try {
      const response = await axios.get(withApiBaseUrl('/api/admin/users'));
      setUsers(response.data.users ?? []);
      setLoadError(null);
    } catch (error) {
      console.error('Failed to load admin users:', error);
      setLoadError(getErrorMessage(error, '用户列表加载失败'));
    }
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  // 提示 4 秒后自动消失
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Esc 关闭弹窗
  useEffect(() => {
    if (!selectedUser) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) setSelectedUser(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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

  const setAdminByEmail = async () => {
    if (!adminEmail.trim()) {
      setNotice({ type: 'error', text: '请输入邮箱地址' });
      return;
    }

    try {
      const response = await axios.post(withApiBaseUrl('/api/admin/set-admin'), {
        email: adminEmail.trim(),
        username: adminUsername.trim() || adminEmail.split('@')[0],
      });

      if (response.data.success) {
        setNotice({
          type: 'success',
          text: `管理员设置成功：${response.data.user.name} (${response.data.user.email})`,
        });
        setAdminEmail('');
        setAdminUsername('');
        setShowSetAdmin(false);
        await loadData();
      }
    } catch (error: unknown) {
      console.error('Failed to set admin:', error);
      setNotice({ type: 'error', text: getErrorMessage(error, '设置失败，请重试') });
    }
  };

  const retry = async () => {
    setLoading(true);
    await loadData();
    setLoading(false);
  };

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((u) =>
      [u.id, u.name, u.email].some((field) => field?.toLowerCase().includes(keyword)),
    );
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-pink dark:border-accent-pink"></div>
      </div>
    );
  }

  const thClass =
    'px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider';

  return (
    <div className="dark:text-dark-text">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary-dark dark:text-dark-text mb-2">
          管理员面板
        </h1>
        <p className="text-gray-600 dark:text-dark-text-secondary">管理系统用户和内容</p>
      </div>

      {notice && (
        <div
          role="status"
          className={`mb-6 flex items-start justify-between rounded-md px-4 py-3 text-sm ${
            notice.type === 'success'
              ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
              : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
          }`}
        >
          <span>{notice.text}</span>
          <button
            onClick={() => setNotice(null)}
            aria-label="关闭提示"
            className="ml-4 opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="mb-6 flex items-center justify-between rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200"
        >
          <span>数据加载失败：{loadError}</span>
          <button onClick={retry} className="ml-4 font-medium underline">
            重试
          </button>
        </div>
      )}

      {/* 推送通知管理 */}
      <div className="mb-8">
        <PushNotificationManager />
      </div>

      {/* 用户管理 */}
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm border border-primary-light/30 dark:border-dark-border">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3 justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text">
            用户管理
            <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
              共 {filteredUsers.length} 人
            </span>
          </h2>
          <div className="flex items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="搜索姓名 / 邮箱 / ID"
              aria-label="搜索用户"
              className="w-56 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <button
              onClick={() => setShowSetAdmin(!showSetAdmin)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              {showSetAdmin ? '取消' : '设置管理员'}
            </button>
          </div>
        </div>

        {/* 设置管理员表单 */}
        {showSetAdmin && (
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
            <h3 className="text-md font-medium text-gray-900 dark:text-dark-text mb-3">
              设置新管理员
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  邮箱地址 *
                </label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="user@gmail.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 mt-1">OAuth用户的邮箱地址</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  用户名
                </label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="自动从邮箱生成"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 mt-1">可选，不填则从邮箱自动生成</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowSetAdmin(false);
                  setAdminEmail('');
                  setAdminUsername('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                取消
              </button>
              <button
                onClick={setAdminByEmail}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                设置为管理员
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-dark-surface-light">
              <tr>
                <th className={thClass}>用户ID</th>
                <th className={thClass}>姓名</th>
                <th className={thClass}>邮箱</th>
                <th className={thClass}>角色</th>
                <th className={thClass}>注册时间</th>
                <th className={thClass}>操作</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-surface divide-y divide-gray-200 dark:divide-gray-700">
              {pageUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    {users.length === 0 ? '暂无用户' : '没有匹配的用户'}
                  </td>
                </tr>
              )}
              {pageUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-dark-surface-light">
                  <td
                    title={user.id}
                    className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-dark-text"
                  >
                    {user.id.length > 16 ? `${user.id.slice(0, 16)}…` : user.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text">
                    {user.name}
                    {isSelf(user) && (
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">（你）</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}
                    >
                      {getRoleText(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => openRoleModal(user)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4"
                    >
                      修改角色
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>
              第 {currentPage} / {totalPages} 页
            </span>
            <div className="space-x-2">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-40"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 修改角色模态框 */}
      {selectedUser && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => !saving && setSelectedUser(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-dialog-title"
            className="bg-white dark:bg-dark-surface rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="role-dialog-title"
              className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4"
            >
              修改用户角色
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              用户: {selectedUser.name} ({selectedUser.email})
              <br />
              当前角色: {getRoleText(selectedUser.role)}
            </p>

            <div className="mb-4">
              <label
                htmlFor="role-select"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                新角色
              </label>
              <select
                id="role-select"
                autoFocus
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {isSelf(selectedUser) && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  这是你自己的账号，降级后将失去管理员权限。
                </p>
              )}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setSelectedUser(null)}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={updateUserRole}
                disabled={saving || newRole === selectedUser.role}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
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

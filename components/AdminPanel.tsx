import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { withApiBaseUrl } from '../lib/api-client';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'moderator' | 'admin';
  createdAt: string;
}

interface AdminStats {
  totalUsers: number;
  totalPosts: number;
  totalReplies: number;
  totalCategories: number;
}

export default function AdminPanel() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalPosts: 0,
    totalReplies: 0,
    totalCategories: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<'user' | 'moderator' | 'admin'>('user');
  const [showSetAdmin, setShowSetAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // 加载用户列表
      const usersResponse = await axios.get(withApiBaseUrl('/api/admin/users'));
      setUsers(usersResponse.data.users);

      // 加载统计数据
      const statsResponse = await axios.get(withApiBaseUrl('/api/admin/stats'));
      setStats(statsResponse.data.stats);

    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, role: 'user' | 'moderator' | 'admin') => {
    try {
      await axios.put(withApiBaseUrl('/api/forum/roles'), {
        userId,
        role,
      });

      // 重新加载用户列表
      await loadData();
      alert('用户角色更新成功！');
    } catch (error) {
      console.error('Failed to update user role:', error);
      alert('更新失败，请重试');
    }
  };

  const setAdminByEmail = async () => {
    if (!adminEmail.trim()) {
      alert('请输入邮箱地址');
      return;
    }

    try {
      const response = await axios.post(withApiBaseUrl('/api/admin/set-admin'), {
        email: adminEmail.trim(),
        username: adminUsername.trim() || adminEmail.split('@')[0],
      });

      if (response.data.success) {
        alert(`管理员设置成功！\n用户: ${response.data.user.name} (${response.data.user.email})`);
        setAdminEmail('');
        setAdminUsername('');
        setShowSetAdmin(false);
        // 重新加载用户列表
        await loadData();
      }
    } catch (error: any) {
      console.error('Failed to set admin:', error);
      alert(error.response?.data?.error || '设置失败，请重试');
    }
  };

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

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin':
        return '管理员';
      case 'moderator':
        return '版主';
      default:
        return '普通用户';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 dark:bg-dark-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary-dark dark:text-dark-text mb-2">管理员面板</h1>
          <p className="text-gray-600 dark:text-gray-400">管理系统用户和内容</p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm p-6 border border-primary-light/30 dark:border-dark-border">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white font-semibold">👥</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">总用户数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{stats.totalUsers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm p-6 border border-primary-light/30 dark:border-dark-border">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                <span className="text-white font-semibold">📝</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">总帖子数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{stats.totalPosts}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm p-6 border border-primary-light/30 dark:border-dark-border">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                <span className="text-white font-semibold">💬</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">总回复数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{stats.totalReplies}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm p-6 border border-primary-light/30 dark:border-dark-border">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                <span className="text-white font-semibold">📂</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">总分类数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text">{stats.totalCategories}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 用户管理 */}
        <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm border border-primary-light/30 dark:border-dark-border">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text">用户管理</h2>
            <button
              onClick={() => setShowSetAdmin(!showSetAdmin)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              {showSetAdmin ? '取消' : '设置管理员'}
            </button>
          </div>

          {/* 设置管理员表单 */}
          {showSetAdmin && (
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
              <h3 className="text-md font-medium text-gray-900 dark:text-dark-text mb-3">设置新管理员</h3>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    用户ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    姓名
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    邮箱
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    角色
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    注册时间
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-surface divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-dark-surface-light">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-dark-text">
                      {user.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                        {getRoleText(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => setSelectedUser(user)}
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
        </div>

        {/* 修改角色模态框 */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-dark-surface rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-4">
                修改用户角色
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                用户: {selectedUser.name} ({selectedUser.email})
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  新角色
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'user' | 'moderator' | 'admin')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="user">普通用户</option>
                  <option value="moderator">版主</option>
                  <option value="admin">管理员</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    updateUserRole(selectedUser.id, newRole);
                    setSelectedUser(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  确认修改
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
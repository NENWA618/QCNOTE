import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { withApiBaseUrl } from '../lib/api-client';
import type { UserProfile } from '../types/ugc-types';

interface ProfileProps {
  userId: string;
}

const Profile: React.FC<ProfileProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  const [bio, setBio] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(withApiBaseUrl(`/api/ugc/user/${userId}`));
      if (response.data.success) {
        const p: UserProfile = response.data.profile;
        setProfile(p);
        setUsername(p.username ?? '');
        setAvatar(p.avatar ?? '');
        setBio(p.bio ?? '');
        setIsPublic(p.isPublic ?? true);
      } else {
        setError(response.data.error || '加载个人主页失败');
      }
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response
          ? `${err.response.status} ${err.response.statusText}`
          : err instanceof Error
            ? err.message
            : '未知错误';
      setError(`加载个人主页失败：${message}`);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const response = await axios.put(withApiBaseUrl(`/api/ugc/user/${userId}`), {
        username,
        avatar,
        bio,
        isPublic,
      });
      if (response.data.success) {
        setProfile(response.data.profile);
        setStatus('已保存');
      } else {
        setError(response.data.error || '保存失败');
      }
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response
          ? `${err.response.status} ${err.response.statusText}`
          : err instanceof Error
            ? err.message
            : '未知错误';
      setError(`保存失败：${message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-primary-dark dark:text-dark-text">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 text-primary-dark dark:bg-dark-bg p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-primary-dark dark:text-dark-text">个人主页</h1>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {profile && (
          <div className="mb-6 flex gap-8 text-center">
            <div>
              <p className="text-2xl font-bold text-accent-pink">{profile.followers ?? 0}</p>
              <p className="text-sm text-text-light dark:text-dark-text-secondary">关注者</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-pink">{profile.following ?? 0}</p>
              <p className="text-sm text-text-light dark:text-dark-text-secondary">正在关注</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-pink">{profile.credit ?? 0}</p>
              <p className="text-sm text-text-light dark:text-dark-text-secondary">积分</p>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSave}
          className="card dark:bg-dark-surface dark:border-dark-border space-y-6"
        >
          <div className="flex items-center gap-4">
            <img
              src={avatar || '/images/default-avatar.png'}
              alt="头像预览"
              className="w-16 h-16 rounded-full border-2 border-white dark:border-dark-border object-cover"
            />
            <div className="flex-1">
              <label className="block text-primary-dark dark:text-dark-text mb-2 font-medium">
                头像地址
              </label>
              <input
                type="url"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://example.com/avatar.png"
                className="form-input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-primary-dark dark:text-dark-text mb-2 font-medium">
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input w-full"
            />
          </div>

          <div>
            <label className="block text-primary-dark dark:text-dark-text mb-2 font-medium">
              简介
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              className="form-input w-full"
              placeholder="介绍一下你自己..."
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-primary-dark dark:text-dark-text">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="rounded"
              />
              公开我的主页
            </label>
          </div>

          <div className="flex items-center gap-4">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
            {status && (
              <span className="text-sm text-text-light dark:text-dark-text-secondary">
                {status}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Profile;

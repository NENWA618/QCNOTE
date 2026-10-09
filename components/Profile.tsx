import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { withApiBaseUrl } from '../lib/api-client';
import type { UserProfile } from '../types/ugc-types';
import ManagePublicNotes from './ManagePublicNotes';
import UserAvatar, { PROFILE_UPDATED_EVENT } from './UserAvatar';

interface ProfileProps {
  userId: string;
}

const Profile: React.FC<ProfileProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  const [bio, setBio] = useState('');

  // 切换用户时回到加载状态（渲染期调整，避免在 effect 里同步 setState）
  const [loadedFor, setLoadedFor] = useState(userId);
  if (loadedFor !== userId) {
    setLoadedFor(userId);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await axios.get(withApiBaseUrl(`/api/ugc/user/${userId}`));
        if (cancelled) return;
        if (response.data.success) {
          const p: UserProfile = response.data.profile;
          setUsername(p.username ?? '');
          setAvatar(p.avatar ?? '');
          setBio(p.bio ?? '');
        } else {
          setError(response.data.error || '加载个人主页失败');
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          axios.isAxiosError(err) && err.response
            ? `${err.response.status} ${err.response.statusText}`
            : err instanceof Error
              ? err.message
              : '未知错误';
        setError(`加载个人主页失败：${message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
      });
      if (response.data.success) {
        setStatus('已保存');
        window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
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
    return <div className="p-8 text-center text-ink dark:text-dark-text">加载中...</div>;
  }

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-ink dark:text-dark-text">编辑个人资料</h1>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSave}
          className="card dark:bg-dark-surface dark:border-dark-border space-y-6"
        >
          <div className="flex items-center gap-4">
            <UserAvatar
              src={avatar}
              name={username}
              size={64}
              className="border-2 border-white dark:border-dark-border"
            />
            <div className="flex-1">
              <label className="block text-ink dark:text-dark-text mb-2 font-medium">
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
            <label className="block text-ink dark:text-dark-text mb-2 font-medium">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input w-full"
            />
          </div>

          <div>
            <label className="block text-ink dark:text-dark-text mb-2 font-medium">简介</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              className="form-input w-full"
              placeholder="介绍一下你自己..."
            />
          </div>

          <p className="text-sm text-text-light dark:text-dark-text-secondary break-all">
            你的个人主页对所有人公开，访问地址：
            <a
              href={`/u/${encodeURIComponent(userId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-pink hover:underline"
            >
              {typeof window !== 'undefined' ? window.location.origin : ''}/u/
              {encodeURIComponent(userId)}
            </a>
          </p>

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

        <ManagePublicNotes userId={userId} />
      </div>
    </div>
  );
};

export default Profile;

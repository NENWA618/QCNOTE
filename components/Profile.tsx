import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { withApiBaseUrl } from '../lib/api-client';
import type { UserProfile } from '../types/ugc-types';
import dynamic from 'next/dynamic';
import ManagePublicNotes from './ManagePublicNotes';
import UserAvatar, { PROFILE_UPDATED_EVENT } from './UserAvatar';
import CopyLinkButton from './CopyLinkButton';
import DeleteAccount from './DeleteAccount';

// 订阅状态只能在浏览器里读，不参与服务端渲染
const PushNotificationSettings = dynamic(() => import('./PushNotificationSettings'), {
  ssr: false,
});

// 与服务端 PUT /api/ugc/user/:id 的校验保持一致
const USERNAME_MAX = 100;
const BIO_MAX = 1000;

export const profilePanelClass =
  'bg-white/95 dark:bg-dark-surface rounded-2xl border border-primary-light/40 dark:border-dark-border p-5 sm:p-6';

interface ProfileProps {
  userId: string;
}

interface ProfileFields {
  username: string;
  avatar: string;
  bio: string;
}

const EMPTY_FIELDS: ProfileFields = { username: '', avatar: '', bio: '' };

const isValidAvatar = (value: string) => {
  if (!value) return true;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const describeError = (err: unknown) =>
  axios.isAxiosError<{ error?: string }>(err) && err.response
    ? err.response.data?.error || `${err.response.status} ${err.response.statusText}`
    : err instanceof Error
      ? err.message
      : '未知错误';

export function ProfileSkeleton() {
  return (
    <div className="animate-pulse grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]" aria-hidden="true">
      <div className={`${profilePanelClass} flex lg:flex-col items-center gap-4`}>
        <div className="h-16 w-16 lg:h-24 lg:w-24 rounded-full bg-primary-light dark:bg-dark-surface-light" />
        <div className="flex-1 w-full space-y-2">
          <div className="h-5 w-32 rounded bg-primary-light dark:bg-dark-surface-light lg:mx-auto" />
          <div className="h-4 w-48 rounded bg-primary-light/70 dark:bg-dark-surface-light lg:mx-auto" />
        </div>
      </div>
      <div className={`${profilePanelClass} space-y-4`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 rounded-lg bg-primary-light/70 dark:bg-dark-surface-light" />
        ))}
        <div className="h-28 rounded-lg bg-primary-light/70 dark:bg-dark-surface-light" />
      </div>
    </div>
  );
}

const Profile: React.FC<ProfileProps> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 加载失败时不显示表单（否则会出现一张空表单，保存还会把资料清空）
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const [fields, setFields] = useState<ProfileFields>(EMPTY_FIELDS);
  // 最近一次加载/保存成功的值：用来判断有没有未保存的更改，以及左侧预览卡片显示什么
  const [saved, setSaved] = useState<ProfileFields>(EMPTY_FIELDS);

  // 切换用户时回到加载状态（渲染期调整，避免在 effect 里同步 setState）
  const [loadedFor, setLoadedFor] = useState(userId);
  if (loadedFor !== userId) {
    setLoadedFor(userId);
    setLoading(true);
    setError(null);
    setLoadError(null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await axios.get(withApiBaseUrl(`/api/ugc/user/${userId}`));
        if (cancelled) return;
        if (response.data.success) {
          const p: UserProfile = response.data.profile;
          const loaded = { username: p.username ?? '', avatar: p.avatar ?? '', bio: p.bio ?? '' };
          setFields(loaded);
          setSaved(loaded);
        } else {
          setLoadError(response.data.error || '加载个人资料失败');
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(`加载个人资料失败：${describeError(err)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const retryLoad = () => {
    setLoading(true);
    setLoadError(null);
    setReloadKey((k) => k + 1);
  };

  // “已保存”提示 3 秒后消失
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [status]);

  const setField = (key: keyof ProfileFields) => (value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setStatus(null);
  };

  const dirty =
    fields.username !== saved.username ||
    fields.avatar !== saved.avatar ||
    fields.bio !== saved.bio;
  const usernameInvalid = !fields.username.trim();
  const avatarInvalid = !isValidAvatar(fields.avatar.trim());
  const canSave = dirty && !saving && !usernameInvalid && !avatarInvalid;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    const payload = {
      username: fields.username.trim(),
      avatar: fields.avatar.trim(),
      bio: fields.bio,
    };
    try {
      const response = await axios.put(withApiBaseUrl(`/api/ugc/user/${userId}`), payload);
      if (response.data.success) {
        setFields(payload);
        setSaved(payload);
        setStatus('已保存');
        window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
      } else {
        setError(response.data.error || '保存失败');
      }
    } catch (err) {
      setError(`保存失败：${describeError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div role="status">
        <span className="sr-only">加载中…</span>
        <ProfileSkeleton />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 text-center">
        <p role="alert" className="text-ink dark:text-dark-text">
          {loadError}
        </p>
        <button type="button" onClick={retryLoad} className="btn btn-primary mt-4">
          重试
        </button>
      </div>
    );
  }

  const publicPath = `/u/${encodeURIComponent(userId)}`;
  const labelClass = 'block text-sm font-medium text-ink dark:text-dark-text mb-1.5';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink dark:text-dark-text">个人资料</h1>
        <p className="mt-1 text-sm sm:text-base text-text-light">
          编辑公开的个人信息，管理通知、已公开的笔记与账号
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        {/* 预览卡片：显示已保存的资料，即别人在主页上看到的样子。桌面端吸顶 */}
        <aside className={`${profilePanelClass} lg:sticky lg:top-24`}>
          <div className="flex lg:flex-col items-center gap-4 lg:text-center">
            {/* 显隐类放在外层：UserAvatar 自带 inline-flex，会盖过传进去的 hidden */}
            <span className="hidden lg:flex">
              <UserAvatar
                src={saved.avatar}
                name={saved.username}
                size={96}
                className="border-4 border-white dark:border-dark-border shadow-md"
              />
            </span>
            <span className="flex lg:hidden">
              <UserAvatar
                src={saved.avatar}
                name={saved.username}
                size={64}
                className="border-2 border-white dark:border-dark-border shadow-sm"
              />
            </span>
            <div className="min-w-0 flex-1 lg:w-full">
              <p className="text-lg font-semibold text-ink dark:text-dark-text truncate">
                {saved.username || '未命名用户'}
              </p>
              <p className="mt-0.5 text-sm text-text-light line-clamp-2 lg:line-clamp-4 whitespace-pre-wrap break-words">
                {saved.bio || '还没有简介'}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-dark-border">
            <p className="text-xs text-text-light mb-2">个人主页对所有人公开</p>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={publicPath}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary"
              >
                查看主页
              </Link>
              <CopyLinkButton path={publicPath} className="btn btn-sm btn-secondary" />
            </div>
          </div>
        </aside>

        <div className="space-y-6 min-w-0">
          <form onSubmit={handleSave} className={profilePanelClass} noValidate>
            <h2 className="text-lg font-semibold text-ink dark:text-dark-text mb-5">基本资料</h2>

            {error && (
              <div
                role="alert"
                className="mb-5 p-3 rounded-xl text-sm bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              >
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label htmlFor="profile-username" className={labelClass}>
                  用户名 <span className="text-red-500">*</span>
                </label>
                <input
                  id="profile-username"
                  type="text"
                  value={fields.username}
                  onChange={(e) => setField('username')(e.target.value)}
                  maxLength={USERNAME_MAX}
                  autoComplete="nickname"
                  aria-invalid={usernameInvalid}
                  aria-describedby={usernameInvalid ? 'profile-username-error' : undefined}
                  className="input py-2"
                />
                {usernameInvalid && (
                  <p
                    id="profile-username-error"
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                  >
                    用户名不能为空
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="profile-avatar" className={labelClass}>
                  头像地址
                </label>
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={avatarInvalid ? '' : fields.avatar.trim()}
                    name={fields.username}
                    size={44}
                    className="border-2 border-white dark:border-dark-border"
                  />
                  <input
                    id="profile-avatar"
                    type="url"
                    inputMode="url"
                    autoCapitalize="off"
                    value={fields.avatar}
                    onChange={(e) => setField('avatar')(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                    aria-invalid={avatarInvalid}
                    aria-describedby="profile-avatar-hint"
                    className="input py-2 min-w-0 flex-1"
                  />
                </div>
                <p
                  id="profile-avatar-hint"
                  className={`mt-1 text-xs ${avatarInvalid ? 'text-red-600 dark:text-red-400' : 'text-text-light'}`}
                >
                  {avatarInvalid
                    ? '请输入以 http:// 或 https:// 开头的图片地址'
                    : '留空则显示用户名首字母'}
                </p>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="profile-bio" className={labelClass}>
                    简介
                  </label>
                  <span
                    className={`text-xs tabular-nums ${fields.bio.length > BIO_MAX * 0.9 ? 'text-ink-pink' : 'text-text-light'}`}
                  >
                    {fields.bio.length}/{BIO_MAX}
                  </span>
                </div>
                <textarea
                  id="profile-bio"
                  value={fields.bio}
                  onChange={(e) => setField('bio')(e.target.value)}
                  rows={4}
                  maxLength={BIO_MAX}
                  className="input py-2 resize-y"
                  placeholder="介绍一下你自己..."
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
              <span
                role="status"
                className={`text-sm text-center sm:text-right ${status ? 'text-green-700 dark:text-green-400' : 'text-text-light'}`}
              >
                {status ? `✓ ${status}` : dirty ? '有未保存的更改' : ''}
              </span>
              {dirty && (
                <button
                  type="button"
                  onClick={() => setFields(saved)}
                  disabled={saving}
                  className="btn btn-secondary"
                >
                  撤销更改
                </button>
              )}
              <button type="submit" className="btn btn-primary sm:min-w-[7rem]" disabled={!canSave}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>

          <PushNotificationSettings />

          <ManagePublicNotes userId={userId} />

          <DeleteAccount userId={userId} />
        </div>
      </div>
    </div>
  );
};

export default Profile;

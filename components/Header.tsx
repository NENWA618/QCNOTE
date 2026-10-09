import Image from 'next/image';
import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { withApiBaseUrl } from '../lib/api-client';
import DarkModeToggle from './DarkModeToggle';
import UserAvatar, { PROFILE_UPDATED_EVENT } from './UserAvatar';

const Header: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('user');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [profile, setProfile] = useState<{ username?: string; avatar?: string } | null>(null);
  const { data: session } = useSession();
  const displayName = profile?.username || session?.user?.name || '';
  // 只认个人资料里的头像，不回退 session.image，避免资料加载前先闪出登录方的头像
  const avatarSrc = profile?.avatar;

  useEffect(() => {
    if (session?.user) {
      // 获取用户角色 - 优先使用邮箱（最可靠的标识）
      const userEmail = session.user.email;
      const userId = session.user.id;

      if (!userEmail && !userId) {
        console.warn('No email or id found in session');
        return;
      }

      const query = userEmail
        ? `email=${encodeURIComponent(userEmail)}`
        : `userId=${encodeURIComponent(userId)}`;

      fetch(withApiBaseUrl(`/api/admin/roles?${query}`))
        .then((res) => res.json())
        .then((data: { success?: boolean; role?: string; error?: string }) => {
          if (data.success) {
            setUserRole(data.role ?? 'user');
          } else {
            console.error('Failed to fetch user role:', data.error);
          }
        })
        .catch((err) => console.error('Failed to fetch user role:', err));
    }
  }, [session]);

  // 头像和用户名以个人资料（UGC）为准，未加载到时回退 session
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancelled = false;
    const load = () => {
      fetch(withApiBaseUrl(`/api/ugc/user/${encodeURIComponent(userId)}`))
        .then((res) => res.json())
        .then((data: { success?: boolean; profile?: { username?: string; avatar?: string } }) => {
          if (!cancelled && data.success && data.profile) {
            setProfile({ username: data.profile.username, avatar: data.profile.avatar });
          }
        })
        .catch(() => {});
    };
    load();
    window.addEventListener(PROFILE_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_UPDATED_EVENT, load);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuOpen && !(event.target as Element).closest('.user-menu')) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  return (
    <header className="nav-shell">
      <nav className="relative max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 text-2xl font-bold text-ink no-underline hover:text-ink-pink transition-all hover:scale-105"
        >
          <Image
            src="/images/icons/note_icon.png"
            alt="QCNOTE logo"
            width={48}
            height={48}
            quality={75}
            className="rounded-lg shadow-light"
            priority
          />
          <span className="hidden sm:inline">QCNOTE</span>
        </Link>

        <div className="flex items-center gap-2">
          <DarkModeToggle />
          {session && (
            <div className="relative user-menu">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-label="用户菜单"
                className="rounded-full hover:scale-110 transition-transform"
              >
                <UserAvatar src={avatarSrc} name={displayName} size={36} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-dark-surface rounded-3xl shadow-xl border border-gray-100 dark:border-dark-border py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-dark-border">
                    <p className="text-sm font-medium text-gray-900 dark:text-dark-text">
                      {displayName || '用户'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                      {session.user?.email}
                    </p>
                  </div>
                  <Link
                    href="/dashboard"
                    prefetch={false}
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-surface-light transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    控制台
                  </Link>
                  <Link
                    href="/profile"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-surface-light transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    编辑个人资料
                  </Link>
                  <Link
                    href="/models"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    AI 模型
                  </Link>
                  <button
                    onClick={() => {
                      signOut();
                      setUserMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    登出
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            className="md:hidden p-2 text-ink hover:bg-primary-light rounded-2xl transition-colors dark:text-dark-text dark:hover:bg-dark-surface-light"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        <ul
          className={`absolute top-full left-0 right-0 md:static md:flex gap-4 md:gap-8 list-none bg-white/95 dark:bg-dark-surface/95 shadow-xl md:shadow-none rounded-b-3xl md:rounded-none p-4 md:p-0 transition-all ${
            menuOpen ? 'flex flex-col' : 'hidden md:flex'
          }`}
        >
          <li>
            <Link
              href="/"
              className="block py-2 md:py-0 text-ink font-medium no-underline transition-colors hover:text-ink-pink"
              onClick={() => setMenuOpen(false)}
            >
              首页
            </Link>
          </li>
          {session && (
            <>
              <li>
                <Link
                  href="/diejie"
                  className="block py-2 md:py-0 text-ink font-medium no-underline transition-colors hover:text-ink-pink"
                  onClick={() => setMenuOpen(false)}
                >
                  叠界
                </Link>
              </li>
              <li>
                <Link
                  href="/leaderboard"
                  className="block py-2 md:py-0 text-ink font-medium no-underline transition-colors hover:text-ink-pink"
                  onClick={() => setMenuOpen(false)}
                >
                  排行榜
                </Link>
              </li>
              {userRole === 'admin' && (
                <li>
                  <Link
                    href="/admin"
                    className="block py-2 md:py-0 text-red-600 font-medium no-underline transition-colors hover:text-red-800"
                    onClick={() => setMenuOpen(false)}
                  >
                    管理员
                  </Link>
                </li>
              )}
            </>
          )}
          {!session && (
            <li>
              <button
                onClick={() => signIn()}
                className="block py-2 md:py-0 text-ink font-medium no-underline transition-colors hover:text-ink-pink bg-transparent border-none cursor-pointer"
              >
                登录
              </button>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
};

export default Header;

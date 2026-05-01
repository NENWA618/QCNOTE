import Image from 'next/image';
import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { withApiBaseUrl } from '../lib/api-client';
import DarkModeToggle from './DarkModeToggle';

const Header: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('user');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user) {
      // 获取用户角色 - 优先使用邮箱（最可靠的标识）
      const sessionUser = session.user as any;
      const userEmail = sessionUser.email;
      
      if (!userEmail) {
        console.warn('No email found in session');
        return;
      }

      fetch(withApiBaseUrl(`/api/forum/roles?email=${encodeURIComponent(userEmail)}`))
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setUserRole(data.role);
          } else {
            console.error('Failed to fetch user role:', data.error);
          }
        })
        .catch(err => console.error('Failed to fetch user role:', err));
    }
  }, [session]);

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
    <header>
      <nav className="max-w-6xl mx-auto flex justify-between items-center px-4 md:px-8 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 text-2xl font-bold text-primary-dark no-underline hover:text-accent-pink transition-colors hover:scale-105"
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

        {/* Mobile menu button */}
        <div className="flex items-center gap-2">
          <DarkModeToggle />
          {session && (
            <div className="relative user-menu">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-8 h-8 bg-gradient-to-br from-accent-pink to-accent-purple rounded-full flex items-center justify-center text-white text-sm font-semibold hover:scale-110 transition-transform"
              >
                {session.user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{session.user?.name || '用户'}</p>
                    <p className="text-xs text-gray-500">{session.user?.email}</p>
                  </div>
                  <Link
                    href="/dashboard"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    控制台
                  </Link>
                  <Link
                    href="/models"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    模型
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
            className="md:hidden p-2 text-primary-dark hover:bg-primary-light rounded-lg transition-colors dark:text-dark-text dark:hover:bg-dark-surface-light"
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

        {/* Desktop and mobile menu */}
        <ul
          className={`absolute top-full left-0 right-0 md:relative md:top-auto md:flex gap-4 md:gap-8 list-none bg-white md:bg-transparent shadow-md md:shadow-none rounded-b-lg md:rounded-none p-4 md:p-0 transition-all ${
            menuOpen ? 'flex flex-col' : 'hidden md:flex'
          }`}
        >
          <li>
            <Link
              href="/"
              className="block py-2 md:py-0 text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
              onClick={() => setMenuOpen(false)}
            >
              首页
            </Link>
          </li>
          <li>
            <Link
              href="/#about"
              className="block py-2 md:py-0 text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
              onClick={() => setMenuOpen(false)}
            >
                  论坛
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="block py-2 md:py-0 text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
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
                className="block py-2 md:py-0 text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink bg-transparent border-none cursor-pointer"
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

import Image from 'next/image';
import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { withApiBaseUrl } from '../lib/api-client';
import DarkModeToggle from './DarkModeToggle';

const Header: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('user');
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
              帮助
            </Link>
          </li>
          {session && (
            <>
              <li>
                <Link
                  href="/models"
                  className="block py-2 md:py-0 text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
                  onClick={() => setMenuOpen(false)}
                >
                  模型
                </Link>
              </li>
              <li>
                <Link
                  href="/forum"
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
                  控制台
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
          <li>
            {session ? (
              <button
                onClick={() => signOut()}
                className="block py-2 md:py-0 text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink bg-transparent border-none cursor-pointer"
              >
                登出
              </button>
            ) : (
              <button
                onClick={() => signIn()}
                className="block py-2 md:py-0 text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink bg-transparent border-none cursor-pointer"
              >
                登录
              </button>
            )}
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default Header;

import Link from 'next/link';
import React from 'react';

const Header: React.FC = () => {
  return (
    <header>
      <nav className="max-w-6xl mx-auto flex justify-between items-center px-8 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 text-2xl font-bold text-primary-dark no-underline hover:text-accent-pink transition-colors hover:scale-105"
        >
          <img
            src="/images/icons/note_icon.png"
            alt="NOTE"
            className="w-12 h-12 rounded-lg shadow-light"
          />
          <span>NOTE</span>
        </Link>
        <ul className="flex gap-8 list-none">
          <li>
            <Link
              href="/"
              className="text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
            >
              首页
            </Link>
          </li>
          <li>
            <Link
              href="/dashboard"
              className="text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
            >
              笔记
            </Link>
          </li>
          <li>
            <a
              href="#about"
              className="text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
            >
              帮助
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default Header;

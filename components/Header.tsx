import Image from 'next/image';
import Link from 'next/link';
import React, { useState } from 'react';

const Header: React.FC = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header>
      <nav className="max-w-6xl mx-auto flex justify-between items-center px-4 md:px-8 py-4">
        <Link
          href="/"
          className="flex items-center gap-3 text-2xl font-bold text-primary-dark no-underline hover:text-accent-pink transition-colors hover:scale-105"
        >
          <Image
            src="/images/icons/note_icon.png"
            alt="NOTE"
            width={48}
            height={48}
            className="rounded-lg shadow-light"
            priority
          />
          <span className="hidden sm:inline">NOTE</span>
        </Link>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 text-primary-dark hover:bg-primary-light rounded-lg transition-colors"
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
              href="/dashboard"
              className="block py-2 md:py-0 text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
              onClick={() => setMenuOpen(false)}
            >
              笔记
            </Link>
          </li>
          <li>
            <a
              href="#about"
              className="block py-2 md:py-0 text-primary-dark font-medium no-underline transition-colors hover:text-accent-pink"
              onClick={() => setMenuOpen(false)}
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

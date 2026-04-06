import React, { useEffect, useState } from 'react';

/**
 * DarkModeToggle Component
 * 
 * 切换亮黑模式的按钮组件
 * - 自动检测系统偏好
 * - 将选择保存到localStorage
 * - 更新HTML class以启用暗黑模式样式
 */
export default function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // 初始化：检查localStorage或系统偏好
  useEffect(() => {
    setIsMounted(true);
    
    // 检查localStorage中保存的主题设置
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // 决定是否使用暗黑模式
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    } else {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    }
  }, []);

  // 处理模式切换
  const toggleDarkMode = () => {
    const newIsDark = !isDark;
    
    // 更新React状态
    setIsDark(newIsDark);
    
    // 更新DOM
    if (newIsDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // 保存用户偏好到localStorage
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
  };

  // 防止服务端渲染的不匹配
  if (!isMounted) {
    return <div className="w-10 h-10" />;
  }

  return (
    <button
      onClick={toggleDarkMode}
      aria-label={isDark ? '切换到亮色模式' : '切换到暗黑模式'}
      title={isDark ? '亮色模式' : '暗黑模式'}
      className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg 
                 bg-gray-100 dark:bg-gray-800 
                 hover:bg-gray-200 dark:hover:bg-gray-700 
                 transition-colors duration-200
                 focus:outline-none focus:ring-2 focus:ring-accent-pink focus:ring-offset-2 
                 dark:focus:ring-offset-gray-900"
    >
      {isDark ? (
        // 暗黑模式：显示太阳图标
        <svg
          className="w-5 h-5 text-yellow-500"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 1.78a1 1 0 011.415 0l.707.707a1 1 0 11-1.415 1.415l-.707-.707a1 1 0 010-1.415zm2.828 2.828a1 1 0 011.415 0l.707.707a1 1 0 11-1.415 1.415l-.707-.707a1 1 0 010-1.415zM18 10a1 1 0 110 2h-1a1 1 0 110-2h1zm-1.22 4.22a1 1 0 011.415 0l.707.707a1 1 0 11-1.415 1.415l-.707-.707a1 1 0 010-1.415zM10 18a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-4.22-1.78a1 1 0 011.415 0l.707.707a1 1 0 11-1.415 1.415l-.707-.707a1 1 0 010-1.415zM3.99 10a1 1 0 110-2H3a1 1 0 110 2h.99zM2.78 5.78a1 1 0 011.415 0l.707.707a1 1 0 11-1.415 1.415l-.707-.707a1 1 0 010-1.415zm0 8.44a1 1 0 011.415 0l.707.707a1 1 0 11-1.415 1.415l-.707-.707a1 1 0 010-1.415zM10 10a2 2 0 100-4 2 2 0 000 4z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        // 亮色模式：显示月亮图标
        <svg
          className="w-5 h-5 text-gray-700"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}

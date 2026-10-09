import { useEffect, useSyncExternalStore } from 'react';

const THEME_CHANGE_EVENT = 'qcnote:theme-change';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeToTheme(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  window.addEventListener('storage', onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  media.addEventListener('change', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    media.removeEventListener('change', onChange);
  };
}

// 决定是否使用暗黑模式：localStorage 中保存的主题设置优先，否则跟随系统偏好
function getIsDark() {
  const savedTheme = localStorage.getItem('theme');
  return savedTheme === 'dark' || (!savedTheme && window.matchMedia(DARK_QUERY).matches);
}

const subscribeNothing = () => () => {};

/**
 * DarkModeToggle Component
 *
 * 切换亮黑模式的按钮组件
 * - 自动检测系统偏好
 * - 将选择保存到localStorage
 * - 更新HTML class以启用暗黑模式样式
 */
export default function DarkModeToggle() {
  // 服务端和首次水合时按亮色渲染，水合后再读取真实偏好，避免不匹配
  const isDark = useSyncExternalStore(subscribeToTheme, getIsDark, () => false);
  const isMounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  // 把当前主题同步到 <html> 的 class
  useEffect(() => {
    if (!isMounted) return;
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark, isMounted]);

  // 处理模式切换
  const toggleDarkMode = () => {
    // 保存用户偏好到localStorage，并通知订阅者（class 由上面的 effect 更新）
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
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
                 focus:outline-hidden focus:ring-2 focus:ring-accent-pink focus:ring-offset-2 
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

import React, { useEffect, useState } from 'react';

interface BackToTopProps {
  /** 滚动超过多少 px 后显示，默认 600 */
  threshold?: number;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useScrolledPast(threshold: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return past;
}

/** 回到顶部按钮：页面滚动超过 threshold 后出现在右下角 */
const BackToTop: React.FC<BackToTopProps> = ({ threshold = 600 }) => {
  const visible = useScrolledPast(threshold);
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() =>
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }
      aria-label="回到顶部"
      className="fixed right-4 bottom-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-primary-light/60 bg-white/90 text-ink shadow-md backdrop-blur sm:right-6 sm:bottom-6 dark:border-dark-border dark:bg-dark-surface/90 dark:text-dark-text"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      ↑
    </button>
  );
};

export default BackToTop;

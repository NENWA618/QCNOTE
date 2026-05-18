/**
 * UI and DOM Utilities
 */

/**
 * Check if user prefers dark mode
 */
export function prefersDarkMode(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/**
 * Check if system prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Get viewport dimensions
 */
export function getViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  return {
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight,
  };
}

/**
 * Check if element is in viewport
 */
export function isInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Scroll element into view
 */
export function scrollIntoView(element: Element, options?: ScrollIntoViewOptions): void {
  if (element && element.scrollIntoView) {
    element.scrollIntoView(options);
  }
}

const domUtils = {
  prefersDarkMode,
  prefersReducedMotion,
  getViewportSize,
  isInViewport,
  scrollIntoView,
};

export default domUtils;

/**
 * Function Utilities
 * Debounce, throttle, and other function composition utilities
 */

/**
 * Debounce function - delays execution until after wait ms of inactivity
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number = 300,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function - limits execution to once every limit ms
 */
export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number = 300,
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Compose multiple functions
 */
export function compose<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduceRight((acc, fn) => fn(acc), arg);
}

/**
 * Pipe multiple functions (left to right)
 */
export function pipe<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduce((acc, fn) => fn(acc), arg);
}

/**
 * Memoize function results
 */
export function memoize<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const cache = new Map<string, R>();

  return (...args: A) => {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key) as R;
    }

    const result = fn(...args);
    cache.set(key, result);

    return result;
  };
}

const functionUtils = {
  debounce,
  throttle,
  compose,
  pipe,
  memoize,
};

export default functionUtils;

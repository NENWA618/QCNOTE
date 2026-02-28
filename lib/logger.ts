// simple logger wrapper so we can control verbosity or redirect to remote in future
const isDev = process.env.NODE_ENV !== 'production';

export function info(...args: unknown[]) {
  if (isDev) console.log('[NOTE]', ...args);
}
export function warn(...args: unknown[]) {
  console.warn('[NOTE]', ...args);
}
export function error(...args: unknown[]) {
  console.error('[NOTE]', ...args);
}

export default { info, warn, error };

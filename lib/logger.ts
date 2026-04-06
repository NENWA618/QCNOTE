// simple logger wrapper so we can control verbosity or redirect to remote in future
const isDev = process.env.NODE_ENV !== 'production';

function sendRemote(level: string, msg: unknown[]) {
  const url = process.env.LOG_ENDPOINT;
  if (!url) return;
  try {
    // fire-and-forget POST, do not block
    const body = JSON.stringify({ level, message: msg, time: new Date().toISOString() });
    // eslint-disable-next-line no-void
    void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  } catch {
    // ignore failures
  }
}

export function info(...args: unknown[]) {
  if (isDev) console.log('[QCNOTE]', ...args);
  sendRemote('info', args);
}
export function warn(...args: unknown[]) {
  console.warn('[QCNOTE]', ...args);
  sendRemote('warn', args);
}
export function error(...args: unknown[]) {
  console.error('[QCNOTE]', ...args);
  sendRemote('error', args);
}

const logger = { info, warn, error };
export default logger;

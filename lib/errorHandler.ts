/**
 * 全局错误兜底：把未捕获的错误和未处理的 Promise 拒绝统一交给 logger。
 * 只在浏览器端调用（见 pages/_app.tsx）。
 */
import logger from './logger';

export function setupGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    logger.error('Uncaught error:', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled promise rejection:', {
      reason: event.reason,
    });
    // Prevent the default handling (which would log to console)
    event.preventDefault();
  });
}

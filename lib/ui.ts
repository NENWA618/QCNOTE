/**
 * 轻量的全局提示（toast）。
 * 样式见 styles/globals.css 里的 `.notification` / `.notification.show`。
 */
export function showNotification(message: string, duration = 2000) {
  if (typeof document === 'undefined') {
    return;
  }

  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

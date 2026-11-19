/**
 * 轻量的全局提示（toast）。
 * 样式见 styles/globals.css 里的 `.toast-region` / `.toast`。
 *
 * - 多条提示纵向堆叠，而不是互相盖住；同时最多显示 3 条。
 * - 容器是 aria-live 区域，读屏软件会播报；错误提示用 role="alert" 立即播报。
 */
export type ToastTone = 'info' | 'success' | 'error';

const MAX_VISIBLE = 3;
const EXIT_MS = 250;

function getRegion(): HTMLElement {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  return region;
}

export function showNotification(message: string, duration = 2000, tone: ToastTone = 'info') {
  if (typeof document === 'undefined') {
    return;
  }

  const region = getRegion();
  // 超过上限时，直接移走最早的，避免屏幕被提示占满
  while (region.children.length >= MAX_VISIBLE) {
    region.firstElementChild?.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.dataset.tone = tone;
  if (tone === 'error') toast.setAttribute('role', 'alert');
  toast.textContent = message;
  region.appendChild(toast);

  // 下一帧再加 show，入场过渡才会生效
  requestAnimationFrame(() => toast.classList.add('show'));

  // 错误信息需要更长的阅读时间
  const visibleFor = tone === 'error' ? Math.max(duration, 5000) : duration;
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), EXIT_MS);
  }, visibleFor);
}

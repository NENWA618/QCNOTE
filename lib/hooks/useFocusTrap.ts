import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * 模态面板的焦点管理：
 * - 打开时把焦点移进面板（`initialFocus` 指定的元素，缺省为面板本身）；
 * - Tab / Shift+Tab 只在面板内循环；
 * - 关闭（或卸载）后，把焦点还给打开前的元素。
 *
 * 监听挂在面板元素上，因此只处理发生在面板内部的按键。
 * 叠在上面的另一个对话框（如 DialogHost，渲染在别处）有自己的焦点锁，互不干扰。
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
  initialFocus?: () => HTMLElement | null | undefined,
) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!active || !panel) return;

    const previous = document.activeElement as HTMLElement | null;
    (initialFocus?.() ?? panel).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      // 跳过看不见的控件（display:none 等）。不用 offsetParent：
      // position:fixed 的元素它也是 null，会把可见控件误判成不可聚焦
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hidden && el.checkVisibility?.() !== false,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
    // initialFocus 只在打开那一刻读取，不应因它变化而重新抢焦点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, panelRef]);
}

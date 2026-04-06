import React, { useEffect, useRef, useCallback } from 'react';

/**
 * A11y (Accessibility) Utilities
 * 
 * 提供无障碍访问增强的工具函数和hooks
 * - 焦点陷阱（Focus Trap）
 * - 键盘导航
 * - ARIA标签管理
 */

/**
 * useFocusTrap Hook
 * 
 * 在模态框或其他容器中实现焦点陷阱
 * - 防止焦点离开容器
 * - 支持ESC键关闭
 * - 自动恢复上一个焦点元素
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLDivElement>,
  onClose?: () => void
) {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    // 保存之前的活跃元素
    previousActiveElement.current = document.activeElement as HTMLElement;

    // 获取容器内所有可聚焦的元素
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // 设置初始焦点
    if (firstElement) {
      firstElement.focus();
    }

    // 处理键盘事件
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC键关闭
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }

      // Tab键导航
      if (e.key === 'Tab') {
        const activeElement = document.activeElement as HTMLElement;

        if (e.shiftKey) {
          // Shift+Tab - 向后导航
          if (activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab - 向前导航
          if (activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // 清理函数
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      // 恢复之前的焦点
      previousActiveElement.current?.focus();
    };
  }, [ref, onClose]);
}

/**
 * useKeyboardNavigation Hook
 * 
 * 为列表项启用上下箭头键导航
 */
export function useKeyboardNavigation(
  ref: React.RefObject<HTMLUListElement | HTMLDivElement>,
  itemSelector = 'li, [role="option"]'
) {
  const handleKeyDown = useCallback((e: Event) => {
    const keyboardEvent = e as KeyboardEvent;
    const container = ref.current;
    if (!container) return;

    const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
    const currentIndex = items.findIndex(item => item === document.activeElement);

    if (currentIndex === -1) return;

    let nextIndex = currentIndex;

    switch (keyboardEvent.key) {
      case 'ArrowDown':
        keyboardEvent.preventDefault();
        nextIndex = Math.min(currentIndex + 1, items.length - 1);
        break;
      case 'ArrowUp':
        keyboardEvent.preventDefault();
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'Home':
        keyboardEvent.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        keyboardEvent.preventDefault();
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    items[nextIndex]?.focus();
  }, [ref, itemSelector]);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [ref, handleKeyDown]);
}

/**
 * useAriaAnnounce Hook
 * 
 * 为屏幕阅读器宣布动态变化的内容
 * 例如：表单验证错误、数据加载完成等
 */
export function useAriaAnnounce(message: string, type: 'polite' | 'assertive' = 'polite') {
  useEffect(() => {
    if (!message) return;

    // 创建或获取宣布容器
    let announcer = document.getElementById('aria-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'aria-announcer';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', type);
      announcer.setAttribute('aria-atomic', 'true');
      announcer.className = 'sr-only'; // 仅屏幕阅读器可见
      document.body.appendChild(announcer);
    }

    // 更新宣布内容
    announcer.setAttribute('aria-live', type);
    announcer.textContent = message;

    // 清理消息（300ms后）
    const timeout = setTimeout(() => {
      announcer.textContent = '';
    }, 300);

    return () => clearTimeout(timeout);
  }, [message, type]);
}

/**
 * getAriaLabel 工具函数
 * 
 * 生成更好的ARIA标签
 */
export function getAriaLabel(type: string, value?: string | number): string {
  const labels: Record<string, string> = {
    close: '关闭',
    delete: '删除',
    save: '保存',
    cancel: '取消',
    edit: '编辑',
    search: '搜索',
    menu: '菜单',
    logout: '退出登录',
    login: '登录',
    submit: '提交',
  };

  return labels[type] || type;
}

/**
 * A11y Utilities - 其他工具函数
 */

/**
 * 宣布消息给屏幕阅读器
 */
export function announceToScreenReader(
  message: string,
  type: 'polite' | 'assertive' = 'polite'
) {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', type);
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  announcer.textContent = message;
  document.body.appendChild(announcer);

  setTimeout(() => {
    document.body.removeChild(announcer);
  }, 1000);
}

/**
 * 跳过导航链接（Skip to content）
 * 帮助键盘用户快速跳到主要内容
 */
export function createSkipLink(targetId: string, label = '跳转到主要内容') {
  const link = document.createElement('a');
  link.href = `#${targetId}`;
  link.textContent = label;
  link.className = 'sr-only focus:not-sr-only absolute top-0 left-0 z-50';
  return link;
}

/**
 * 检查元素是否在视口内
 */
export function isElementInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * 平滑滚动到元素并设置焦点
 */
export function focusElementAndScroll(element: HTMLElement) {
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  element.focus();
}

// Setup file specifically for DOM tests (jsdom environment)
import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia (only if window exists)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// jsdom 没有 Range 的布局方法；CodeMirror 测量光标位置（补全菜单定位）要用。
// 返回一个固定的矩形：测试只关心“有位置”，不关心具体数值。
if (typeof Range !== 'undefined') {
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    right: 0,
    top: 0,
    bottom: 16,
    width: 0,
    height: 16,
    toJSON: () => ({}),
  };
  const rects = Object.assign([rect], { item: (i: number) => (i === 0 ? rect : null) });
  Range.prototype.getBoundingClientRect ??= () => rect as DOMRect;
  Range.prototype.getClientRects ??= () => rects as unknown as DOMRectList;
}

import React, { useRef } from 'react';
import { useFocusTrap } from '../lib/a11y';

/**
 * AccessibleModal Component
 * 
 * 一个可访问的模态框组件，集成了焦点陷阱和ARIA属性
 */

interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export default function AccessibleModal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}: AccessibleModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // 使用焦点陷阱
  useFocusTrap(modalRef, onClose);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  };

  return (
    // 背景遮罩
    <div
      className="fixed inset-0 z-40 bg-black/50 dark:bg-black/70 transition-opacity"
      onClick={onClose}
      role="presentation"
      aria-hidden="true"
    >
      {/* 模态框容器 */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* 模态框内容 */}
        <div
          ref={modalRef}
          className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl max-h-screen overflow-auto
                       ${sizeClasses[size]} w-full animation-fade-in`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2
              id="modal-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="关闭模态框"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 
                         focus:outline-none focus:ring-2 focus:ring-accent-pink rounded"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* 内容 */}
          <div className="p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

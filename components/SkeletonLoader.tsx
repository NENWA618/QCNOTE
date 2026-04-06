import React from 'react';

/**
 * SkeletonLoader Component
 * 
 * 用于显示加载占位符的骨架屏组件
 * 通过pulse动画给用户视觉反馈
 */

interface SkeletonLoaderProps {
  lines?: number;
  type?: 'text' | 'card' | 'avatar' | 'custom';
  className?: string;
}

/**
 * 简单文本骨架屏
 */
export function SkeletonText({ lines = 3, className = '' }: Omit<SkeletonLoaderProps, 'type'>) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 
                       dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 
                       rounded animate-pulse ${i === lines - 1 ? 'w-5/6' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/**
 * 卡片骨架屏
 */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-4 ${className}`}>
      {/* Header */}
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3" />
      
      {/* Content lines */}
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-full" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-5/6" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-4/6" />
      </div>
      
      {/* Footer */}
      <div className="pt-4 flex gap-2">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-20" />
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-20" />
      </div>
    </div>
  );
}

/**
 * 头像+文本骨架屏
 */
export function SkeletonAvatar({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* Avatar circle */}
      <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse flex-shrink-0" />
      
      {/* Text content */}
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2" />
      </div>
    </div>
  );
}

/**
 * 列表骨架屏
 */
export function SkeletonList({ lines = 5, className = '' }: Omit<SkeletonLoaderProps, 'type'>) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded">
          <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/3" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 通用骨架屏组件 - 可选择不同类型
 */
export default function SkeletonLoader({
  lines = 3,
  type = 'text',
  className = '',
}: SkeletonLoaderProps) {
  switch (type) {
    case 'card':
      return <SkeletonCard className={className} />;
    case 'avatar':
      return <SkeletonAvatar className={className} />;
    case 'custom':
      return <SkeletonText lines={lines} className={className} />;
    case 'text':
    default:
      return <SkeletonText lines={lines} className={className} />;
  }
}

/**
 * 简化版骨架屏容器 - 用于包装可能加载的内容
 */
export function SkeletonWrapper({
  isLoading,
  children,
  skeleton = <SkeletonText lines={3} />,
}: {
  isLoading: boolean;
  children: React.ReactNode;
  skeleton?: React.ReactNode;
}) {
  return isLoading ? <div>{skeleton}</div> : <div>{children}</div>;
}

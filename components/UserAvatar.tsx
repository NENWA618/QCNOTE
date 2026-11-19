import React, { useState } from 'react';

/** 个人资料保存后派发，Header 据此刷新头像和用户名 */
export const PROFILE_UPDATED_EVENT = 'qcnote:profile-updated';

interface UserAvatarProps {
  /** 头像地址；为空或加载失败时显示渐变圆形 + 用户名首字母 */
  src?: string | null;
  name?: string | null;
  /** 直径（px） */
  size?: number;
  className?: string;
}

// 按字素簇取首字符，避免把带肤色/组合型 emoji、国旗等拆开；不支持 Intl.Segmenter 时退回按码点取
const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function firstGrapheme(text: string): string {
  if (!text) return '';
  if (segmenter) {
    const first = segmenter.segment(text)[Symbol.iterator]().next();
    return first.done ? '' : first.value.segment;
  }
  return Array.from(text)[0] ?? '';
}

// 用原生 <img> 而不是 next/image：头像是用户填写的任意外链，
// next.config 没有配置 images.remotePatterns，next/image 会直接拒绝这些域名（CSP 的 img-src 已放行 https:）。
const UserAvatar: React.FC<UserAvatarProps> = ({ src, name, size = 40, className = '' }) => {
  // Remember which src failed to load, so a new src gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc !== null && failedSrc === src;

  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) };
  const label = name?.trim() ?? '';

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label ? `${label} 的头像` : '头像'}
        style={style}
        className={`rounded-full object-cover shrink-0 ${className}`}
        onError={() => setFailedSrc(src ?? null)}
      />
    );
  }

  return (
    <span
      aria-label={label ? `${label} 的头像` : '头像'}
      style={style}
      className={`bg-linear-to-br from-accent-pink to-accent-purple rounded-full inline-flex items-center justify-center text-white font-semibold shrink-0 select-none ${className}`}
    >
      {firstGrapheme(label).toUpperCase() || 'U'}
    </span>
  );
};

export default UserAvatar;

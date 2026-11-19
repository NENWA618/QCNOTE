import React, { useEffect, useState } from 'react';

interface CopyLinkButtonProps {
  /** 站内路径，如 /u/xxx；复制时拼上当前 origin */
  path: string;
  className?: string;
}

/** 复制站内链接到剪贴板，按钮文字短暂变成“已复制” */
const CopyLinkButton: React.FC<CopyLinkButtonProps> = ({ path, className = '' }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <button type="button" onClick={handleCopy} className={className} aria-live="polite">
      {state === 'copied' ? '✓ 已复制' : state === 'failed' ? '复制失败' : '复制链接'}
    </button>
  );
};

export default CopyLinkButton;

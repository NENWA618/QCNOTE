import React, { useState } from 'react';
import type { FormatAction } from './formatActions';

interface FormatToolbarProps {
  actions: FormatAction[];
  onRun: (action: FormatAction) => void;
}

/** 格式工具栏：同一时刻只有一个按钮在 Tab 顺序里（roving tabindex），方向键在按钮间移动 */
export const FormatToolbar: React.FC<FormatToolbarProps> = ({ actions, onRun }) => {
  const [toolIndex, setToolIndex] = useState(0);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const buttons = Array.from(e.currentTarget.querySelectorAll('button'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    const n = buttons.length;
    const next =
      e.key === 'ArrowRight'
        ? (current + 1) % n
        : e.key === 'ArrowLeft'
          ? (current - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : n - 1;
    e.preventDefault();
    buttons[next].focus();
  };

  return (
    <div
      role="toolbar"
      aria-label="Markdown 格式"
      onKeyDown={handleKeyDown}
      className="-mx-1 mb-2 flex gap-0.5 overflow-x-auto px-1 pb-1"
    >
      {actions.map((action, i) => (
        <button
          key={action.key}
          type="button"
          tabIndex={i === toolIndex ? 0 : -1}
          aria-label={action.aria}
          title={action.title}
          className={`tool-btn ${action.className ?? ''}`}
          // 阻止按下时 textarea 失焦，选区才不会丢
          onMouseDown={(e) => e.preventDefault()}
          onFocus={() => setToolIndex(i)}
          onClick={() => onRun(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
};

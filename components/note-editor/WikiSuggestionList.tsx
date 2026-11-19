import React from 'react';
import type { NoteItem } from '../../lib/storage';

interface WikiSuggestionListProps {
  id: string;
  items: NoteItem[];
  activeIndex: number;
  left: number;
  top: number;
  flip: boolean;
  onHover: (index: number) => void;
  onAccept: (title: string) => void;
}

export const WikiSuggestionList: React.FC<WikiSuggestionListProps> = ({
  id,
  items,
  activeIndex,
  left,
  top,
  flip,
  onHover,
  onAccept,
}) => (
  <ul
    id={id}
    role="listbox"
    aria-label="链接到笔记"
    className="absolute z-20 max-h-56 w-64 overflow-y-auto rounded-lg border border-primary-dark/20 bg-white p-1 shadow-lg dark:border-dark-border dark:bg-dark-surface"
    style={{ left, top, transform: flip ? 'translateY(-100%)' : undefined }}
  >
    {items.map((n, i) => (
      <li
        key={n.id}
        id={`${id}-${i}`}
        role="option"
        aria-selected={i === activeIndex}
        // mousedown 默认会让 textarea 失焦（并关闭菜单）：阻止它
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => i !== activeIndex && onHover(i)}
        onClick={() => onAccept(n.title)}
        className={`cursor-pointer truncate rounded-md px-2 py-1.5 text-sm text-ink dark:text-dark-text ${
          i === activeIndex ? 'bg-primary-light dark:bg-dark-surface-light' : ''
        }`}
      >
        {n.title}
      </li>
    ))}
  </ul>
);

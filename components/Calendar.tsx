import React, { useState, useMemo } from 'react';
import { NoteItem } from '../lib/storage';

interface CalendarProps {
  notes: NoteItem[];
  onSelectDate?: (date: Date) => void;
  /** 点击当天列表里的笔记时打开它 */
  onSelectNote?: (note: NoteItem) => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 本地时区的日期键，如 2026-10-12 */
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// 热力色阶：沿用站点的粉色，而不是另起一套蓝色
const heatClass = (count: number) =>
  count === 0
    ? 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-dark-surface-light dark:text-dark-text dark:hover:bg-dark-border'
    : count === 1
      ? 'bg-pink-100 text-pink-900 hover:bg-pink-200 dark:bg-pink-900/40 dark:text-pink-100 dark:hover:bg-pink-900/60'
      : count === 2
        ? 'bg-pink-300 text-pink-950 hover:bg-pink-400 dark:bg-pink-700 dark:text-white dark:hover:bg-pink-600'
        : 'bg-pink-500 text-white hover:bg-pink-600 dark:bg-pink-500';

export const Calendar: React.FC<CalendarProps> = ({ notes, onSelectDate, onSelectNote }) => {
  const [today] = useState(() => new Date());
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);

  // 按最后修改日期分组
  const notesByDay = useMemo(() => {
    const map = new Map<string, NoteItem[]>();
    notes
      .filter((n) => !n.isDeleted)
      .forEach((note) => {
        const key = dayKey(new Date(note.updatedAt));
        const list = map.get(key);
        if (list) list.push(note);
        else map.set(key, [note]);
      });
    map.forEach((list) => list.sort((a, b) => b.updatedAt - a.updatedAt));
    return map;
  }, [notes]);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = new Date(year, monthIndex, 1).getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  let monthTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    monthTotal += notesByDay.get(dayKey(new Date(year, monthIndex, d)))?.length ?? 0;
  }

  const isCurrentMonth = year === today.getFullYear() && monthIndex === today.getMonth();
  const selectedNotes = notesByDay.get(dayKey(selected)) ?? [];

  const shiftMonth = (delta: number) => setMonth(new Date(year, monthIndex + delta, 1));
  const goToday = () => {
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(today);
  };

  const navButton =
    'flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-primary-light dark:text-dark-text dark:hover:bg-dark-surface-light';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="rounded-2xl border border-primary-light/40 bg-white/95 p-4 sm:p-6 dark:border-dark-border dark:bg-dark-surface">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-ink sm:text-xl dark:text-dark-text">
              {year} 年 {monthIndex + 1} 月
            </h2>
            <p className="text-xs text-text-light">本月修改过 {monthTotal} 篇笔记</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="上个月"
              className={navButton}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goToday}
              disabled={isCurrentMonth && dayKey(selected) === dayKey(today)}
              className="h-9 rounded-full px-3 text-sm text-ink hover:bg-primary-light disabled:opacity-40 dark:text-dark-text dark:hover:bg-dark-surface-light"
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="下个月"
              className={navButton}
            >
              ›
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              aria-hidden="true"
              className="py-1 text-center text-xs font-medium text-text-light"
            >
              {d}
            </div>
          ))}

          {cells.map((day, index) => {
            if (day === null) return <div key={`blank-${index}`} aria-hidden="true" />;

            const date = new Date(year, monthIndex, day);
            const key = dayKey(date);
            const count = notesByDay.get(key)?.length ?? 0;
            const isToday = key === dayKey(today);
            const isSelected = key === dayKey(selected);

            return (
              <button
                key={key}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${monthIndex + 1} 月 ${day} 日，${count} 篇笔记${isToday ? '（今天）' : ''}`}
                onClick={() => {
                  setSelected(date);
                  onSelectDate?.(date);
                }}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors ${heatClass(count)} ${
                  isSelected
                    ? 'ring-2 ring-ink-pink ring-offset-1 dark:ring-offset-dark-surface'
                    : ''
                }`}
              >
                <span
                  className={`tabular-nums ${isToday ? 'font-bold underline underline-offset-2' : 'font-medium'}`}
                >
                  {day}
                </span>
                {count > 0 && (
                  <span className="hidden text-[10px] leading-none tabular-nums opacity-80 sm:block">
                    {count} 篇
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-text-light">
          <span className="flex items-center gap-1.5">
            少
            {[0, 1, 2, 3].map((c) => (
              <span key={c} aria-hidden="true" className={`h-3.5 w-3.5 rounded ${heatClass(c)}`} />
            ))}
            多
          </span>
          <span>
            <span className="font-bold text-ink underline underline-offset-2 dark:text-dark-text">
              12
            </span>{' '}
            今天
          </span>
        </div>
      </section>

      {/* 选中当天的笔记 */}
      <section
        aria-live="polite"
        className="rounded-2xl border border-primary-light/40 bg-white/95 p-4 sm:p-5 lg:sticky lg:top-24 lg:self-start dark:border-dark-border dark:bg-dark-surface"
      >
        <h3 className="font-semibold text-ink dark:text-dark-text">
          {selected.getMonth() + 1} 月 {selected.getDate()} 日
          <span className="ml-1.5 text-sm font-normal text-text-light">
            周{WEEKDAYS[selected.getDay()]} · {selectedNotes.length} 篇
          </span>
        </h3>
        {selectedNotes.length === 0 ? (
          <p className="mt-3 text-sm text-text-light">这一天没有修改过笔记</p>
        ) : (
          <ul className="mt-3 -mx-2 max-h-[60vh] space-y-0.5 overflow-y-auto">
            {selectedNotes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => onSelectNote?.(note)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-primary-light/40 dark:hover:bg-dark-surface-light"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: note.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink dark:text-dark-text">
                    {note.title || '无标题'}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-text-light">
                    {new Date(note.updatedAt).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

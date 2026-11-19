import React, { useMemo } from 'react';
import { NoteItem } from '../lib/storage';

interface TimelineProps {
  notes: NoteItem[];
  onSelectNote?: (note: NoteItem) => void;
}

interface DayGroup {
  key: string;
  date: Date;
  notes: NoteItem[];
}

interface MonthGroup {
  key: string;
  label: string;
  days: DayGroup[];
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const Timeline: React.FC<TimelineProps> = ({ notes, onSelectNote }) => {
  // 按最后修改时间倒序，再按月、按天分组。用数字时间戳排序：
  // 原先拿 "2026年10月" 这样的本地化字符串去 new Date()，得到的是无效日期，月份顺序并不可靠
  const months = useMemo<MonthGroup[]>(() => {
    const sorted = notes.filter((n) => !n.isDeleted).sort((a, b) => b.updatedAt - a.updatedAt);
    const result: MonthGroup[] = [];
    for (const note of sorted) {
      const d = new Date(note.updatedAt);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const dayKey = `${monthKey}-${d.getDate()}`;
      let month = result[result.length - 1];
      if (!month || month.key !== monthKey) {
        month = { key: monthKey, label: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`, days: [] };
        result.push(month);
      }
      let day = month.days[month.days.length - 1];
      if (!day || day.key !== dayKey) {
        day = {
          key: dayKey,
          date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
          notes: [],
        };
        month.days.push(day);
      }
      day.notes.push(note);
    }
    return result;
  }, [notes]);

  const todayKey = new Date().toDateString();

  if (months.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-primary-dark/40 px-4 py-14 text-center text-text-light dark:border-dark-border">
        <div className="mb-3 text-4xl" aria-hidden="true">
          🕰️
        </div>
        暂无笔记
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {months.map((month) => (
        <section key={month.key} aria-labelledby={`tl-${month.key}`}>
          <h2
            id={`tl-${month.key}`}
            className="sticky top-16 z-10 -mx-1 mb-3 flex items-baseline gap-2 rounded-lg bg-white/80 px-1 py-1 backdrop-blur sm:top-20 dark:bg-dark-bg/80"
          >
            <span className="text-lg font-bold text-ink dark:text-dark-text">{month.label}</span>
            <span className="text-xs text-text-light">
              {month.days.reduce((n, d) => n + d.notes.length, 0)} 篇
            </span>
          </h2>

          <ol className="relative ml-2 space-y-4 border-l-2 border-primary-light pl-4 sm:ml-3 sm:pl-6 dark:border-dark-border">
            {month.days.map((day) => {
              const isToday = day.date.toDateString() === todayKey;
              return (
                <li key={day.key} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute top-1.5 -left-[1.4rem] h-3 w-3 rounded-full border-2 border-white sm:-left-[1.9rem] dark:border-dark-bg ${
                      isToday ? 'bg-accent-pink' : 'bg-primary-dark dark:bg-dark-text-secondary'
                    }`}
                  />
                  <p className="mb-2 text-sm font-semibold text-ink dark:text-dark-text">
                    {isToday ? '今天' : `${day.date.getMonth() + 1} 月 ${day.date.getDate()} 日`}
                    <span className="ml-1.5 font-normal text-text-light">
                      周{WEEKDAYS[day.date.getDay()]} · {day.notes.length} 篇
                    </span>
                  </p>
                  <ul className="overflow-hidden rounded-2xl border border-primary-light/40 bg-white/95 divide-y divide-gray-100 dark:divide-dark-border dark:border-dark-border dark:bg-dark-surface">
                    {day.notes.map((note) => (
                      <li key={note.id}>
                        <button
                          type="button"
                          onClick={() => onSelectNote?.(note)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-primary-light/30 dark:hover:bg-dark-surface-light"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: note.color }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate font-medium text-ink dark:text-dark-text">
                                {note.title || '无标题'}
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-text-light">
                                {new Date(note.updatedAt).toLocaleTimeString('zh-CN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </span>
                            {note.content.trim() && (
                              <span className="mt-0.5 block truncate text-xs text-text-light">
                                {note.content
                                  .replace(/[#*`>]/g, '')
                                  .trim()
                                  .slice(0, 120)}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
};

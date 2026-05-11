import React, { useState, useMemo } from 'react';
import { NoteItem } from '../lib/storage';

interface CalendarProps {
  notes: NoteItem[];
  onSelectDate?: (date: Date) => void;
}

export const Calendar: React.FC<CalendarProps> = ({
  notes,
  onSelectDate,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const notesPerDay = useMemo(() => {
    const map: Record<string, number> = {};

    notes
      .filter((n) => !n.isDeleted)
      .forEach((note) => {
        const date = new Date(note.updatedAt);
        const dateStr = date.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        map[dateStr] = (map[dateStr] || 0) + 1;
      });

    return map;
  }, [notes]);

  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
  ).getDate();

  const firstDayOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
  ).getDay();

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const prevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1),
    );
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1),
    );
  };

  const getDateStr = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const today = new Date();
  const todayStr = today.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">📆 日历热力图</h2>
        <div className="flex gap-2">
          <button
            onClick={prevMonth}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded transition"
          >
            ◀
          </button>
          <span className="px-4 py-1 font-semibold text-gray-700 min-w-48 text-center">
            {currentDate.toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
            })}
          </span>
          <button
            onClick={nextMonth}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded transition"
          >
            ▶
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
          <div key={day} className="text-center font-semibold text-gray-600 py-2 text-sm">
            {day}
          </div>
        ))}

        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="bg-gray-50 rounded" />;
          }

          const dateStr = getDateStr(day);
          const count = notesPerDay[dateStr] || 0;
          const isToday = dateStr === todayStr;
          const intensity = Math.min(count / 3, 1);

          return (
            <button
              key={day}
              onClick={() => onSelectDate?.(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
              className={`
                aspect-square rounded flex flex-col items-center justify-center transition
                ${
                  isToday
                    ? 'ring-2 ring-red-500'
                    : ''
                }
                ${
                  count === 0
                    ? 'bg-gray-100 hover:bg-gray-200'
                    : count === 1
                      ? 'bg-blue-100 hover:bg-blue-200'
                      : count === 2
                        ? 'bg-blue-300 hover:bg-blue-400'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                }
              `}
              title={`${count} 条笔记`}
            >
              <span className="text-sm font-semibold">{day}</span>
              {count > 0 && (
                <span className="text-xs mt-1">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 text-xs mt-4">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-gray-100 rounded border border-gray-300" />
          <span>无</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-blue-100 rounded" />
          <span>1</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-blue-300 rounded" />
          <span>2</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-blue-500 rounded" />
          <span>3+</span>
        </div>
        <div className="ml-4 flex items-center gap-1">
          <span className="text-gray-400">🔴</span>
          <span>今天</span>
        </div>
      </div>
    </div>
  );
};

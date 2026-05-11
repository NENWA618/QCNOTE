import React, { useState, useMemo } from 'react';
import { NoteItem } from '../lib/storage';

interface TimelineProps {
  notes: NoteItem[];
  onSelectNote?: (note: NoteItem) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  notes,
  onSelectNote,
}) => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, NoteItem[]> = {};

    notes
      .filter((n) => !n.isDeleted)
      .forEach((note) => {
        const date = new Date(note.updatedAt);
        const dateStr = date.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        if (!groups[dateStr]) {
          groups[dateStr] = [];
        }
        groups[dateStr].push(note);
      });

    // Sort by date descending
    return Object.entries(groups).sort(([a], [b]) => {
      const aDate = new Date(a);
      const bDate = new Date(b);
      return bDate.getTime() - aDate.getTime();
    });
  }, [notes]);

  const monthGroups = useMemo(() => {
    const months: Record<string, [string, NoteItem[]][]> = {};

    groupedByDate.forEach(([date, items]) => {
      const d = new Date(date);
      const monthStr = d.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
      });

      if (!months[monthStr]) {
        months[monthStr] = [];
      }
      months[monthStr].push([date, items]);
    });

    return Object.entries(months).sort(([a], [b]) => {
      const aDate = new Date(a);
      const bDate = new Date(b);
      return bDate.getTime() - aDate.getTime();
    });
  }, [groupedByDate]);

  return (
    <div className="bg-white rounded-lg shadow p-6 max-h-96 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">📅 时间线视图</h2>

      {monthGroups.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <p>暂无笔记</p>
        </div>
      ) : (
        <div className="space-y-6">
          {monthGroups.map(([monthStr, dateEntries]) => (
            <div key={monthStr}>
              <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center">
                <span className="text-2xl mr-2">📆</span>
                {monthStr}
              </h3>

              <div className="ml-4 space-y-2 border-l-2 border-blue-300">
                {dateEntries.map(([dateStr, items]) => (
                  <div key={dateStr}>
                    <p className="text-sm text-gray-500 font-semibold px-4">
                      {new Date(dateStr).toLocaleDateString('zh-CN', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                      ({items.length})
                    </p>

                    <div className="space-y-1">
                      {items.map((note) => (
                        <button
                          key={note.id}
                          onClick={() => onSelectNote?.(note)}
                          className={`w-full text-left px-4 py-2 rounded hover:bg-blue-50 transition border-l-4 ${
                            selectedDate === dateStr
                              ? 'bg-blue-50 border-blue-500'
                              : 'border-transparent'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-800 truncate">
                              {note.title || '无标题'}
                            </span>
                            <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                              {new Date(note.updatedAt).toLocaleTimeString(
                                'zh-CN',
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                },
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 truncate">
                            {note.content.slice(0, 80)}
                            {note.content.length > 80 ? '...' : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

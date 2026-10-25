import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Calendar } from '../components/Calendar';
import { NoteItem } from '../lib/storage';

// 本地时间构造，避免 '2026-04-15' 这种 UTC 字符串在不同时区落到前一天
const at = (month: number, day: number, hour = 10) =>
  new Date(2026, month - 1, day, hour).getTime();

const makeNote = (over: Partial<NoteItem>): NoteItem => ({
  id: 'n',
  title: 'Note',
  content: '',
  category: 'Work',
  tags: [],
  color: '#ff0000',
  createdAt: at(4, 1),
  updatedAt: at(4, 1),
  ...over,
});

describe('Calendar Component', () => {
  const mockNotes: NoteItem[] = [
    makeNote({ id: '1', title: 'Meeting Note', updatedAt: at(4, 15, 9) }),
    makeNote({ id: '2', title: 'Second Meeting', updatedAt: at(4, 15, 14) }),
    makeNote({ id: '3', title: 'Personal Note', updatedAt: at(4, 13) }),
    makeNote({ id: '4', title: 'Trashed Note', updatedAt: at(4, 13), isDeleted: true }),
    makeNote({ id: '5', title: 'May Note', updatedAt: at(5, 2) }),
  ];

  const onSelectDate = vi.fn();
  const onSelectNote = vi.fn();
  const renderCalendar = () =>
    render(<Calendar notes={mockNotes} onSelectDate={onSelectDate} onSelectNote={onSelectNote} />);

  beforeEach(() => {
    vi.clearAllMocks();
    // 固定"今天"为 2026-04-20，只伪造 Date，不影响事件和定时器
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 3, 20, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the current month with its note count, ignoring deleted notes', () => {
    renderCalendar();
    expect(screen.getByRole('heading', { name: '2026 年 4 月' })).toBeInTheDocument();
    expect(screen.getByText('本月修改过 3 篇笔记')).toBeInTheDocument();
  });

  it('labels each day with how many notes were modified on it', () => {
    renderCalendar();
    expect(screen.getByRole('button', { name: '4 月 15 日，2 篇笔记' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4 月 13 日，1 篇笔记' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4 月 20 日，0 篇笔记（今天）' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('selects a date, lists its notes newest first, and opens a clicked note', () => {
    renderCalendar();
    expect(screen.getByText('这一天没有修改过笔记')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '4 月 15 日，2 篇笔记' }));

    expect(onSelectDate).toHaveBeenCalledWith(new Date(2026, 3, 15));
    const listed = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(listed[0]).toContain('Second Meeting');
    expect(listed[1]).toContain('Meeting Note');

    fireEvent.click(screen.getByRole('button', { name: /Meeting Note/ }));
    expect(onSelectNote).toHaveBeenCalledWith(mockNotes[0]);
  });

  it('navigates between months and back to today', () => {
    renderCalendar();
    const today = screen.getByRole('button', { name: '今天' });
    expect(today).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '下个月' }));
    expect(screen.getByRole('heading', { name: '2026 年 5 月' })).toBeInTheDocument();
    expect(screen.getByText('本月修改过 1 篇笔记')).toBeInTheDocument();
    expect(today).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '上个月' }));
    fireEvent.click(screen.getByRole('button', { name: '上个月' }));
    expect(screen.getByRole('heading', { name: '2026 年 3 月' })).toBeInTheDocument();

    fireEvent.click(today);
    expect(screen.getByRole('heading', { name: '2026 年 4 月' })).toBeInTheDocument();
  });
});

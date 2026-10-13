import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import NoteList from '../components/NoteList';
import { NoteItem } from '../lib/storage';
import type { PublishedNoteInfo } from '../types/ugc-types';

const makeNote = (over: Partial<NoteItem>): NoteItem => ({
  id: 'n',
  title: 'Note',
  content: '',
  category: '工作',
  tags: [],
  color: '#ff0000',
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

const published = (localNoteId: string, sourceUpdatedAt: number): PublishedNoteInfo => ({
  id: `pub-${localNoteId}`,
  localNoteId,
  title: 'published',
  sourceUpdatedAt,
  publishedAt: sourceUpdatedAt,
});

describe('NoteList Component', () => {
  const mockNotes: NoteItem[] = [
    makeNote({
      id: '1',
      title: 'First Note',
      content: '# Heading\n**bold** body',
      tags: ['test', 'sample', 'extra', 'more'],
      links: ['Second Note'],
      backlinks: ['2', '3'],
    }),
    makeNote({ id: '2', title: 'Second Note', category: '生活', tags: ['personal'] }),
  ];

  const onEdit = vi.fn();
  const onTagClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const cardOf = (title: string) => screen.getByRole('button', { name: title }).closest('li')!;

  it('renders one card per note with its category and a plain-text preview', () => {
    render(<NoteList notes={mockNotes} onEdit={onEdit} onTagClick={onTagClick} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const first = within(cardOf('First Note'));
    expect(first.getByText('工作')).toBeInTheDocument();
    expect(first.getByText(/^Heading\s+bold body$/)).toBeInTheDocument();
    expect(within(cardOf('Second Note')).getByText('（无内容）')).toBeInTheDocument();
  });

  it('opens a note when its card or its title button is clicked', () => {
    render(<NoteList notes={mockNotes} onEdit={onEdit} onTagClick={onTagClick} />);

    fireEvent.click(cardOf('Second Note'));
    expect(onEdit).toHaveBeenLastCalledWith(mockNotes[1]);

    fireEvent.click(screen.getByRole('button', { name: 'First Note' }));
    expect(onEdit).toHaveBeenLastCalledWith(mockNotes[0]);
  });

  it('filters by tag without opening the note, showing at most three tags', () => {
    render(
      <NoteList
        notes={mockNotes}
        onEdit={onEdit}
        onTagClick={onTagClick}
        selectedTags={['sample']}
      />,
    );
    const first = within(cardOf('First Note'));

    fireEvent.click(first.getByRole('button', { name: '#test' }));
    expect(onTagClick).toHaveBeenCalledWith('test');
    expect(onEdit).not.toHaveBeenCalled();

    expect(first.getByRole('button', { name: '#sample' })).toHaveAttribute('aria-pressed', 'true');
    expect(first.getByRole('button', { name: '#test' })).toHaveAttribute('aria-pressed', 'false');
    expect(first.queryByRole('button', { name: '#more' })).not.toBeInTheDocument();
    expect(first.getByText('+1')).toBeInTheDocument();
  });

  it('shows link and backlink counts only for linked notes', () => {
    render(<NoteList notes={mockNotes} onEdit={onEdit} onTagClick={onTagClick} />);
    expect(within(cardOf('First Note')).getByTitle('链接 1 · 被引用 2')).toBeInTheDocument();
    expect(within(cardOf('Second Note')).queryByText(/🔗/)).not.toBeInTheDocument();
  });

  it('marks published notes, and flags ones edited since publishing', () => {
    render(
      <NoteList
        notes={mockNotes}
        onEdit={onEdit}
        onTagClick={onTagClick}
        published={{ '1': published('1', 1000), '2': published('2', 500) }}
      />,
    );
    expect(within(cardOf('First Note')).getByText('已公开')).toBeInTheDocument();
    expect(within(cardOf('Second Note')).getByText('已公开·有更新')).toBeInTheDocument();
  });
});

describe('NoteList empty states', () => {
  it('invites writing the first note when there are no notes', () => {
    const onNewNote = vi.fn();
    render(<NoteList notes={[]} onEdit={vi.fn()} onTagClick={vi.fn()} onNewNote={onNewNote} />);

    expect(screen.getByRole('heading', { name: '还没有笔记' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /写第一篇/ }));
    expect(onNewNote).toHaveBeenCalled();
  });

  it('offers to clear filters when nothing matches', () => {
    const onClearFilters = vi.fn();
    render(
      <NoteList
        notes={[]}
        onEdit={vi.fn()}
        onTagClick={vi.fn()}
        filtered
        onClearFilters={onClearFilters}
        onNewNote={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '没有匹配的笔记' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /写第一篇/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(onClearFilters).toHaveBeenCalled();
  });
});

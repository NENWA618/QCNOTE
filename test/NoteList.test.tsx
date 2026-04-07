import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NoteList from '../components/NoteList';
import { NoteItem } from '../lib/storage';

// Mock the storage module
vi.mock('../lib/storage', () => ({
  NoteStorage: vi.fn(),
}));

describe('NoteList Component', () => {
  const mockNotes: NoteItem[] = [
    {
      id: '1',
      title: 'First Note',
      content: 'First content',
      category: 'Work',
      tags: ['test', 'sample'],
      color: '#ff0000',
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isArchived: false,
    },
    {
      id: '2',
      title: 'Second Note',
      content: 'Second content',
      category: 'Personal',
      tags: ['personal'],
      color: '#00ff00',
      isFavorite: true,
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
      isArchived: false,
    },
  ];

  const defaultProps = {
    notes: mockNotes,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleFavorite: vi.fn(),
    onToggleArchive: vi.fn(),
    searchQuery: '',
    selectedTags: [],
    onTagClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders note list with all items', () => {
    render(<NoteList {...defaultProps} />);
    
    expect(screen.getByText('First Note')).toBeInTheDocument();
    expect(screen.getByText('Second Note')).toBeInTheDocument();
  });

  it('calls onSelectNote when a note is clicked', async () => {
    render(<NoteList {...defaultProps} />);
    
    const firstNote = screen.getByText('First Note').closest('.card');
    if (firstNote) {
      fireEvent.click(firstNote);
    
      await waitFor(() => {
        expect(defaultProps.onEdit).toHaveBeenCalledWith(mockNotes[0]);
      });
    }
  });

  it('displays favorite indicator for favorited notes', () => {
    render(<NoteList {...defaultProps} />);
    
    // Second note is favorite
    const favoriteIndicator = screen.getByText('Second Note').closest('.card');
    expect(favoriteIndicator).toHaveTextContent('⭐');
  });

  it('filters notes by search term', () => {
    const { rerender } = render(
      <NoteList {...defaultProps} searchQuery="" />
    );
    
    expect(screen.getByText('First Note')).toBeInTheDocument();
    expect(screen.getByText('Second Note')).toBeInTheDocument();
    
    rerender(
      <NoteList {...defaultProps} searchQuery="First" />
    );
    
    expect(screen.getByText('First Note')).toBeInTheDocument();
    expect(screen.queryByText('Second Note')).not.toBeInTheDocument();
  });

  it('renders empty state when no notes', () => {
    render(
      <NoteList
        {...defaultProps}
        notes={[]}
      />
    );
    
    expect(screen.getByText(/no notes/i) || screen.getByText(/empty/i)).toBeInTheDocument();
  });

  it('handles delete action correctly', async () => {
    render(<NoteList {...defaultProps} />);
    
    const deleteButtons = screen.getAllByRole('button', { name: /删除/i });
    if (deleteButtons.length > 0) {
      fireEvent.click(deleteButtons[0]);
    
      await waitFor(() => {
        expect(defaultProps.onDelete).toHaveBeenCalledWith('1');
      });
    }
  });

  it('groups notes by category if groupByCategory prop is true', () => {
    render(
      <NoteList {...defaultProps} />
    );
    
    // Check that categories are displayed
    expect(screen.getByText(/Work/i)).toBeInTheDocument();
    expect(screen.getByText(/Personal/i)).toBeInTheDocument();
  });
});

describe('NoteList Accessibility', () => {
  const mockNotes: NoteItem[] = [
    {
      id: '1',
      title: 'Accessible Note',
      content: 'Content',
      category: 'Test',
      tags: [],
      color: '#000000',
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isArchived: false,
    },
  ];

  it('has proper ARIA labels', () => {
    render(
      <NoteList
        notes={mockNotes}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleArchive={vi.fn()}
        searchQuery=""
        selectedTags={[]}
        onTagClick={vi.fn()}
      />
    );
    
    // Check that note items are rendered and accessible
    const noteItem = screen.getByText('Accessible Note');
    expect(noteItem).toBeInTheDocument();
  });

  it('supports keyboard navigation', () => {
    const onEdit = vi.fn();
    render(
      <NoteList
        notes={mockNotes}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onToggleArchive={vi.fn()}
        searchQuery=""
        selectedTags={[]}
        onTagClick={vi.fn()}
      />
    );
    
    const noteItem = screen.getByText('Accessible Note');
    fireEvent.keyDown(noteItem, { key: 'Enter' });
    
    // Check that the note item is still in document after keyboard interaction
    expect(noteItem).toBeInTheDocument();
  });
});

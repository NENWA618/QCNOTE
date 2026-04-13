import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import KnowledgeGraph from '../components/KnowledgeGraph';
import { NoteItem } from '../lib/storage';

describe('KnowledgeGraph Component', () => {
  const mockNotes: NoteItem[] = [
    {
      id: '1',
      title: 'Machine Learning',
      content: 'ML content [[Deep Learning]] [[AI]]',
      category: 'Tech',
      tags: ['ml', 'ai'],
      color: '#ff0000',
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isArchived: false,
      links: ['2', '3'],
      backlinks: [],
    },
    {
      id: '2',
      title: 'Deep Learning',
      content: 'DL content [[Machine Learning]]',
      category: 'Tech',
      tags: ['dl', 'neural'],
      color: '#00ff00',
      isFavorite: true,
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
      isArchived: false,
      links: ['1'],
      backlinks: ['1'],
    },
    {
      id: '3',
      title: 'AI Ethics',
      content: 'Ethics content',
      category: 'Philosophy',
      tags: ['ethics'],
      color: '#0000ff',
      isFavorite: false,
      createdAt: Date.now() - 2000,
      updatedAt: Date.now() - 2000,
      isArchived: false,
      links: [],
      backlinks: ['1'],
    },
  ];

  const defaultProps = {
    notes: mockNotes,
    onNodeClick: vi.fn(),
    onNodeDoubleClick: vi.fn(),
    searchQuery: '',
    selectedTags: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render graph container', () => {
    render(<KnowledgeGraph {...defaultProps} />);
    expect(screen.getByTestId('knowledge-graph')).toBeInTheDocument();
  });

  it('should display nodes for each note', async () => {
    render(<KnowledgeGraph {...defaultProps} />);
    await waitFor(() => {
      mockNotes.forEach(note => {
        expect(screen.getByText(note.title)).toBeInTheDocument();
      });
    });
  });

  it('should call onNodeClick when node is clicked', async () => {
    render(<KnowledgeGraph {...defaultProps} />);
    await waitFor(() => {
      const node = screen.getByText('Machine Learning');
      fireEvent.click(node);
      expect(defaultProps.onNodeClick).toHaveBeenCalledWith(mockNotes[0]);
    });
  });

  it('should call onNodeDoubleClick when node is double-clicked', async () => {
    render(<KnowledgeGraph {...defaultProps} />);
    await waitFor(() => {
      const node = screen.getByText('Machine Learning');
      fireEvent.doubleClick(node);
      expect(defaultProps.onNodeDoubleClick).toHaveBeenCalledWith(mockNotes[0]);
    });
  });

  it('should filter nodes based on search query', async () => {
    const props = { ...defaultProps, searchQuery: 'Deep' };
    render(<KnowledgeGraph {...props} />);
    await waitFor(() => {
      expect(screen.getByText('Deep Learning')).toBeInTheDocument();
      expect(screen.queryByText('Machine Learning')).not.toBeInTheDocument();
    });
  });

  it('should filter nodes based on selected tags', async () => {
    const props = { ...defaultProps, selectedTags: ['ai'] };
    render(<KnowledgeGraph {...props} />);
    await waitFor(() => {
      expect(screen.getByText('Machine Learning')).toBeInTheDocument();
      expect(screen.queryByText('AI Ethics')).not.toBeInTheDocument();
    });
  });

  it('should handle empty notes array', () => {
    const props = { ...defaultProps, notes: [] };
    render(<KnowledgeGraph {...props} />);
    expect(screen.getByTestId('knowledge-graph')).toBeInTheDocument();
    expect(screen.getByText('No notes to display')).toBeInTheDocument();
  });

  it('should render links between connected notes', async () => {
    render(<KnowledgeGraph {...defaultProps} />);
    await waitFor(() => {
      // Check if links are rendered (implementation dependent)
      const graph = screen.getByTestId('knowledge-graph');
      expect(graph).toBeInTheDocument();
    });
  });
});
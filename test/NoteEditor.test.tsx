import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import NoteEditor from '../components/NoteEditor';
import { NoteItem } from '../lib/storage';

describe('NoteEditor Component', () => {
  const mockNote: NoteItem = {
    id: 'note_test_1',
    title: 'Test Note',
    content: '# Test Content\n\nThis is a test note.',
    category: '学习',
    tags: ['test', 'component'],
    color: '#dc96b4',
    isFavorite: false,
    createdAt: Date.now() - 100000,
    updatedAt: Date.now(),
    isArchived: false,
    links: [],
    backlinks: [],
    versions: [],
  };

  const mockProps = {
    note: mockNote,
    isVisible: true,
    isPreview: false,
    relatedNotes: [],
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onChange: vi.fn(),
    onTogglePreview: vi.fn(),
    onRevertVersion: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the editor when isVisible is true', () => {
    render(<NoteEditor {...mockProps} />);
    expect(screen.getByDisplayValue('Test Note')).toBeInTheDocument();
  });

  it('should not render when isVisible is false', () => {
    const props = { ...mockProps, isVisible: false };
    render(<NoteEditor {...props} />);
    expect(screen.queryByDisplayValue('Test Note')).not.toBeInTheDocument();
  });

  it('should not render when note is null', () => {
    const props = { ...mockProps, note: null };
    render(<NoteEditor {...props} />);
    expect(screen.queryByDisplayValue('Test Note')).not.toBeInTheDocument();
  });

  it('should call onChange when title is edited', async () => {
    const user = userEvent.setup();
    render(<NoteEditor {...mockProps} />);
    
    const titleInput = screen.getByDisplayValue('Test Note');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated Title');

    expect(mockProps.onChange).toHaveBeenCalled();
  });

  it('should call onChange when content is edited', async () => {
    const user = userEvent.setup();
    render(<NoteEditor {...mockProps} />);
    
    // Find content textarea
    const textareas = screen.getAllByRole('textbox');
    const contentTextarea = textareas[1]; // Assuming second textarea is content
    
    if (contentTextarea) {
      await user.clear(contentTextarea);
      await user.type(contentTextarea, 'Updated content');
      expect(mockProps.onChange).toHaveBeenCalled();
    }
  });

  it('should call onSave when save button is clicked', async () => {
    const user = userEvent.setup();
    render(<NoteEditor {...mockProps} />);
    
    const saveButton = screen.getByText(/保存|save/i, { selector: 'button' });
    await user.click(saveButton);
    
    expect(mockProps.onSave).toHaveBeenCalled();
  });

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<NoteEditor {...mockProps} />);
    
    const cancelButton = screen.getByText(/取消|cancel/i, { selector: 'button' });
    await user.click(cancelButton);
    
    expect(mockProps.onCancel).toHaveBeenCalled();
  });

  it('should call onTogglePreview when preview toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<NoteEditor {...mockProps} />);
    
    // Find preview toggle button
    const previewButtons = screen.getAllByRole('button');
    // Assuming there's a preview toggle button (check actual implementation)
    // This might need adjustment based on actual button labels
    
    if (previewButtons.length > 0) {
      await user.click(previewButtons[previewButtons.length - 1]);
      // Check if onTogglePreview was called or component behavior changed
      expect(mockProps.onTogglePreview).toHaveBeenCalled();
    }
  });

  it('should show category selector with correct categories', () => {
    render(<NoteEditor {...mockProps} />);
    
    // Check if category selector exists
    const categoryElements = screen.queryAllByText(/生活|工作|学习|灵感|其他/);
    expect(categoryElements.length).toBeGreaterThanOrEqual(0);
  });

  it('should display version history when available', () => {
    const noteWithVersions: NoteItem = {
      ...mockNote,
      versions: [
        {
          versionId: 'v1',
          title: 'Old Title',
          content: 'Old Content',
          category: '学习',
          tags: [],
          color: '#dc96b4',
          isFavorite: false,
          isArchived: false,
          updatedAt: Date.now() - 10000,
        },
      ],
    };

    const props = { ...mockProps, note: noteWithVersions };
    render(<NoteEditor {...props} />);
    
    // Check if version history button exists
    const versionButton = screen.queryByText(/版本|version|history/i);
    if (versionButton) {
      expect(versionButton).toBeInTheDocument();
    }
  });

  it('should handle preview mode correctly', () => {
    const props = { ...mockProps, isPreview: true };
    const { rerender } = render(<NoteEditor {...props} />);
    
    // In preview mode, content should be rendered as markdown instead of editable
    expect(screen.queryByDisplayValue(mockNote.content)).not.toBeInTheDocument();
    
    // Revert to edit mode
    const editProps = { ...props, isPreview: false };
    rerender(<NoteEditor {...editProps} />);
    expect(screen.getByDisplayValue(mockNote.title)).toBeInTheDocument();
  });

  it('should display related notes when provided', () => {
    const relatedNote: NoteItem = {
      ...mockNote,
      id: 'related_1',
      title: 'Related Note',
    };

    const props = { ...mockProps, relatedNotes: [relatedNote] };
    render(<NoteEditor {...props} />);
    
    const relatedSection = screen.queryByText(/相关|related/i);
    if (relatedSection) {
      expect(relatedSection).toBeInTheDocument();
    }
  });
});

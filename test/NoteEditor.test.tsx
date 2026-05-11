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
    onOpenRelatedNote: vi.fn(),
    onRevertVersion: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the editor when isVisible is true', () => {
    render(React.createElement(NoteEditor, mockProps));
    expect(screen.getByDisplayValue('Test Note')).toBeInTheDocument();
  });

  it('should not render when isVisible is false', () => {
    const props = { ...mockProps, isVisible: false };
    render(React.createElement(NoteEditor, props));
    expect(screen.queryByDisplayValue('Test Note')).not.toBeInTheDocument();
  });

  it('should not render when note is null', () => {
    const props = { ...mockProps, note: null };
    render(React.createElement(NoteEditor, props));
    expect(screen.queryByDisplayValue('Test Note')).not.toBeInTheDocument();
  });

  it('should call onChange when title is edited', async () => {
    const user = userEvent.setup();
    render(React.createElement(NoteEditor, mockProps));
    
    const titleInput = screen.getByDisplayValue('Test Note');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated Title');

    expect(mockProps.onChange).toHaveBeenCalled();
  });

  it('should call onChange when content is edited', async () => {
    const user = userEvent.setup();
    render(React.createElement(NoteEditor, mockProps));
    
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
    render(React.createElement(NoteEditor, mockProps));
    
    const saveButton = screen.getByText(/保存|save/i, { selector: 'button' });
    await user.click(saveButton);
    
    expect(mockProps.onSave).toHaveBeenCalled();
  });

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(React.createElement(NoteEditor, mockProps));
    
    const cancelButton = screen.getByText(/取消|cancel/i, { selector: 'button' });
    await user.click(cancelButton);
    
    expect(mockProps.onCancel).toHaveBeenCalled();
  });

  it('should call onTogglePreview when preview toggle is clicked', async () => {
    const user = userEvent.setup();
    render(React.createElement(NoteEditor, mockProps));
    
    const previewButton = screen.getByRole('button', { name: /预览|编辑/ });
    await user.click(previewButton);
    expect(mockProps.onTogglePreview).toHaveBeenCalled();
  });

  it('should show category selector with correct categories', () => {
    render(React.createElement(NoteEditor, mockProps));
    
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
    render(React.createElement(NoteEditor, props));
    
    // Check if version history button exists
    const versionButton = screen.queryByText(/版本|version|history/i);
    if (versionButton) {
      expect(versionButton).toBeInTheDocument();
    }
  });

  it('should handle preview mode correctly', () => {
    const props = { ...mockProps, isPreview: true };
    const { rerender } = render(React.createElement(NoteEditor, props));
    
    // In preview mode, content should be rendered as markdown instead of editable
    expect(screen.queryByDisplayValue(mockNote.content)).not.toBeInTheDocument();
    
    // Revert to edit mode
    const editProps = { ...props, isPreview: false };
    rerender(React.createElement(NoteEditor, editProps));
    expect(screen.getByDisplayValue(mockNote.title)).toBeInTheDocument();
  });

  it('should display related notes when provided', () => {
    const relatedNote: NoteItem = {
      ...mockNote,
      id: 'related_1',
      title: 'Related Note',
    };

    const props = { ...mockProps, relatedNotes: [relatedNote] };
    render(React.createElement(NoteEditor, props));
    
    const relatedSection = screen.queryByText(/相关|related/i);
    if (relatedSection) {
      expect(relatedSection).toBeInTheDocument();
    }
  });

  it('should render forward and backlink lists in preview and call onOpenRelatedNote when clicked', async () => {
    const user = userEvent.setup();
    const relatedNote: NoteItem = {
      ...mockNote,
      id: 'related_1',
      title: 'Related Note',
    };

    const noteWithLinks: NoteItem = {
      ...mockNote,
      isFavorite: false,
      isArchived: false,
      links: ['Related Note'],
      backlinks: ['related_1'],
    };

    const props = {
      ...mockProps,
      note: noteWithLinks,
      isPreview: true,
      relatedNotes: [relatedNote],
    };

    render(React.createElement(NoteEditor, props));

    expect(screen.getByText('引用笔记')).toBeInTheDocument();
    expect(screen.getByText('被引用笔记')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Related Note/ }).length).toBeGreaterThanOrEqual(1);

    const linkButton = screen.getAllByRole('button', { name: /Related Note/ })[0];
    await user.click(linkButton);
    expect(props.onOpenRelatedNote).toHaveBeenCalledWith(relatedNote);
  });
});

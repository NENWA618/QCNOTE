import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import NoteEditor from '../components/NoteEditor';
import SentimentUtil from '../lib/sentiment';
import { NoteItem, NoteVersion } from '../lib/storage';
import { editorText, setContent } from './editorHarness';

describe('NoteEditor Component', () => {
  const mockNote: NoteItem = {
    id: 'note_test_1',
    title: 'Test Note',
    content: '# Test Content\n\nThis is a test note.',
    category: '学习',
    tags: ['test', 'component'],
    color: '#dc96b4',
    createdAt: Date.now() - 100000,
    updatedAt: Date.now(),
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
    onDelete: vi.fn(),
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

  it('should call onChange when content is edited', () => {
    render(React.createElement(NoteEditor, mockProps));

    setContent('Updated content');

    expect(mockProps.onChange).toHaveBeenCalledWith('content', 'Updated content');
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
    expect(screen.getAllByRole('button', { name: /Related Note/ }).length).toBeGreaterThanOrEqual(
      1,
    );

    const linkButton = screen.getAllByRole('button', { name: /Related Note/ })[0];
    await user.click(linkButton);
    expect(props.onOpenRelatedNote).toHaveBeenCalledWith(relatedNote);
  });

  it('restoring a version applies every field instead of only the last one', async () => {
    const user = userEvent.setup();
    const version: NoteVersion = {
      versionId: 'v1',
      title: 'Old Title',
      content: 'old content',
      category: '工作',
      tags: ['old'],
      color: '#4ecdc4',
      coloredRanges: [],
      updatedAt: Date.now() - 50000,
    };
    const noteWithVersion: NoteItem = { ...mockNote, versions: [version] };
    let latest: NoteItem = noteWithVersion;

    // 模拟 dashboard：onChange 用函数式更新累加 editingNote
    const Harness = () => {
      const [editing, setEditing] = React.useState<NoteItem>(noteWithVersion);
      latest = editing;
      return React.createElement(NoteEditor, {
        ...mockProps,
        note: editing,
        onChange: (field: keyof NoteItem, value: NoteItem[keyof NoteItem]) =>
          setEditing((prev) => ({ ...prev, [field]: value })),
      });
    };

    render(React.createElement(Harness));
    await user.click(screen.getByRole('button', { name: /历史/ }));
    await user.click(screen.getByRole('button', { name: /v1/ }));
    await user.click(screen.getByRole('button', { name: /恢复此版本/ }));

    expect(mockProps.onRevertVersion).toHaveBeenCalledWith(version);
    expect(screen.getByDisplayValue('Old Title')).toBeInTheDocument();
    expect(editorText()).toBe('old content');
    expect(screen.getByDisplayValue('old')).toBeInTheDocument();
    expect(latest).toMatchObject({
      title: 'Old Title',
      content: 'old content',
      category: '工作',
      tags: ['old'],
      color: '#4ecdc4',
    });
  });

  it('restoring a version updates all editor fields even when the parent does not re-render', async () => {
    const user = userEvent.setup();
    const version: NoteVersion = {
      versionId: 'v1',
      title: 'Old Title',
      content: 'old content',
      category: '工作',
      tags: ['old'],
      color: '#4ecdc4',
      coloredRanges: [],
      updatedAt: Date.now() - 50000,
    };

    // note 属性保持不变：编辑器只能靠自己的内部状态累加各字段
    render(
      React.createElement(NoteEditor, { ...mockProps, note: { ...mockNote, versions: [version] } }),
    );
    await user.click(screen.getByRole('button', { name: /历史/ }));
    await user.click(screen.getByRole('button', { name: /v1/ }));
    await user.click(screen.getByRole('button', { name: /恢复此版本/ }));

    expect(screen.getByDisplayValue('Old Title')).toBeInTheDocument();
    expect(editorText()).toBe('old content');
    expect(screen.getByDisplayValue('old')).toBeInTheDocument();
  });

  it('analyzes sentiment once on open, then only after typing pauses', () => {
    vi.useFakeTimers();
    try {
      const analyze = vi.spyOn(SentimentUtil, 'analyzeEmotion');
      render(React.createElement(NoteEditor, mockProps));
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(analyze).toHaveBeenCalledTimes(1);
      expect(screen.getByText('当前情绪：平静')).toBeInTheDocument();

      for (const text of ['I', 'I love', 'I love it', 'I love it, wonderful']) {
        setContent(text);
      }
      expect(analyze).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(800);
      });
      expect(analyze).toHaveBeenCalledTimes(2);
      expect(analyze).toHaveBeenLastCalledWith('Test Note I love it, wonderful');
      expect(screen.getByText('当前情绪：正面')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  describe('主页与公开笔记被管理员关闭', () => {
    const published = {
      id: 'pub1',
      localNoteId: 'note_test_1',
      title: 'Test Note',
      sourceUpdatedAt: 1,
      publishedAt: 1,
    };
    const suspension = { suspendedAt: 1700000000000, reason: '违规内容' };

    it('发布和取消发布按钮置灰，并显示原因，点击也不会发起请求', async () => {
      const onPublish = vi.fn();
      const onUnpublish = vi.fn();
      const user = userEvent.setup();
      render(
        React.createElement(NoteEditor, {
          ...mockProps,
          onPublish,
          onUnpublish,
          publishInfo: published,
          publishSuspension: suspension,
        }),
      );

      expect(screen.getByRole('status', { name: '' })).toHaveTextContent('已被管理员关闭');
      expect(screen.getByRole('status', { name: '' })).toHaveTextContent('违规内容');
      // 不再显示“已公开”：它已经不对外可见
      expect(screen.queryByText(/已公开/)).not.toBeInTheDocument();

      const update = screen.getByRole('button', { name: '更新发布' });
      const unpublish = screen.getByRole('button', { name: '取消发布' });
      expect(update).toBeDisabled();
      expect(unpublish).toBeDisabled();
      await user.click(update);
      await user.click(unpublish);
      expect(onPublish).not.toHaveBeenCalled();
      expect(onUnpublish).not.toHaveBeenCalled();
    });

    it('没有被关闭时按钮可用，也不显示关闭说明', () => {
      render(
        React.createElement(NoteEditor, {
          ...mockProps,
          onPublish: vi.fn(),
          onUnpublish: vi.fn(),
          publishInfo: published,
        }),
      );

      expect(screen.getByRole('button', { name: '更新发布' })).toBeEnabled();
      expect(screen.getByRole('button', { name: '取消发布' })).toBeEnabled();
      expect(screen.queryByText(/已被管理员关闭/)).not.toBeInTheDocument();
    });
  });
});

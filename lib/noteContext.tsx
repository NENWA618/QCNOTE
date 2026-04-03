import React, { createContext, useContext, useState, ReactNode } from 'react';
import { NoteItem, NoteVersion } from './storage';

/**
 * Editor Context - Manages note editing state globally
 * This reduces prop drilling and makes state accessible to all editor components
 */

interface NoteEditorState {
  // Editor state
  editingNote: NoteItem | null;
  isEditorVisible: boolean;
  isPreviewMode: boolean;
  relatedNotes: NoteItem[];
  
  // Version history
  showVersionHistory: boolean;
  
  // Callbacks
  openEditor: (note: NoteItem) => void;
  closeEditor: () => void;
  updateNote: (field: keyof NoteItem, value: any) => void;
  saveNote: () => Promise<void>;
  cancelEdit: () => void;
  togglePreview: () => void;
  showVersions: () => void;
  hideVersions: () => void;
  revertToVersion: (version: NoteVersion) => Promise<void>;
}

const NoteEditorContext = createContext<NoteEditorState | undefined>(undefined);

/**
 * Provider component to wrap your app
 * Pass in handlers for persistence logic
 */
interface NoteEditorProviderProps {
  children: ReactNode;
  onSave?: (note: NoteItem) => Promise<void>;
  onCancel?: () => void;
  onRevertVersion?: (noteId: string, version: NoteVersion) => Promise<void>;
  getRelatedNotes?: (note: NoteItem) => NoteItem[];
}

export const NoteEditorProvider: React.FC<NoteEditorProviderProps> = ({
  children,
  onSave,
  onCancel,
  onRevertVersion,
  getRelatedNotes,
}): React.ReactElement => {
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [isEditorVisible, setIsEditorVisible] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [relatedNotes, setRelatedNotes] = useState<NoteItem[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const value: NoteEditorState = {
    editingNote,
    isEditorVisible,
    isPreviewMode,
    relatedNotes,
    showVersionHistory,

    openEditor: (note: NoteItem) => {
      if (getRelatedNotes) {
        setRelatedNotes(getRelatedNotes(note));
      }
      setEditingNote(note);
      setIsEditorVisible(true);
      setIsPreviewMode(false);
    },

    closeEditor: () => {
      setIsEditorVisible(false);
      setEditingNote(null);
      setRelatedNotes([]);
    },

    updateNote: (field: keyof NoteItem, value: any) => {
      if (!editingNote) return;
      setEditingNote({
        ...editingNote,
        [field]: value,
      });
    },

    saveNote: async () => {
      if (!editingNote || !onSave) return;
      try {
        await onSave(editingNote);
        setIsEditorVisible(false);
        setEditingNote(null);
      } catch (error) {
        console.error('Error saving note:', error);
        throw error;
      }
    },

    cancelEdit: () => {
      if (onCancel) {
        onCancel();
      }
      setEditingNote(null);
      setIsEditorVisible(false);
      setIsPreviewMode(false);
    },

    togglePreview: () => {
      setIsPreviewMode(!isPreviewMode);
    },

    showVersions: () => {
      setShowVersionHistory(true);
    },

    hideVersions: () => {
      setShowVersionHistory(false);
    },

    revertToVersion: async (version: NoteVersion) => {
      if (!editingNote || !onRevertVersion) return;
      try {
        await onRevertVersion(editingNote.id, version);
        // Update local state to reflect reverted version
        setEditingNote({
          ...editingNote,
          title: version.title,
          content: version.content,
          category: version.category,
          tags: version.tags,
          color: version.color,
          isFavorite: version.isFavorite,
          isArchived: version.isArchived,
        });
      } catch (error) {
        console.error('Error reverting version:', error);
        throw error;
      }
    },
  };

  return (
    <NoteEditorContext.Provider value={value}>
      {children}
    </NoteEditorContext.Provider>
  );
};

/**
 * Hook to use the NoteEditor context
 * Throws error if used outside of NoteEditorProvider
 */
export const useNoteEditor = (): NoteEditorState => {
  const context = useContext(NoteEditorContext);
  if (!context) {
    throw new Error('useNoteEditor must be used within NoteEditorProvider');
  }
  return context;
};

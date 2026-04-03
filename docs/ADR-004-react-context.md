# ADR 004: React Context for State Management

**Date:** 2026-04-03  
**Status:** ACCEPTED  
**Context:** Dashboard component currently passes 30+ props through multiple layers (prop drilling). This makes refactoring difficult and adds complexity.

## Problem Statement

**Current situation:**
```typescript
// pages/dashboard.tsx - 30+ props passed
<NoteEditor
  note={editingNote}
  isVisible={editorVisible}
  isPreview={isPreview}
  relatedNotes={relatedNotes}
  onSave={handleSaveNote}
  onCancel={handleCancelEdit}
  onChange={handleNoteChange}
  onTogglePreview={handleTogglePreview}
  onRevertVersion={handleRevertVersion}
  // ... many more
/>

// components/NoteList.tsx - receives props, passes to children
const NoteList = ({ onEditNote, ...props }) => (
  <div>
    {notes.map(note => (
      <NoteCard {...props} note={note} />
    ))}
  </div>
)
```

**Issues:**
- Tight coupling between components
- Hard to add/remove features
- Props must flow through every intermediate component
- Difficult to extract components into separate files
- Makes component testing complex (too many mocks)

## Decision

**Use React Context API for editor state management**

```typescript
// Create context
export const NoteEditorContext = createContext<NoteEditorState>();

// Wrap app with provider
<NoteEditorProvider onSave={...} onCancel={...}>
  <Dashboard />
</NoteEditorProvider>

// Use in any component
const NoteList = () => {
  const { openEditor } = useNoteEditor();
  return <button onClick={() => openEditor(note)} />;
};
```

## Rationale

### Why Context API instead of Redux/Zustand?

| Library | Learning Curve | Bundle Size | Boilerplate | Fits This? |
|---------|----------------|-------------|-------------|------------|
| **React Context** (chosen) | Low | 0KB | Minimal | ✅ Lightweight state |
| **Redux** | High | 15KB | High | ❌ Overkill for this |
| **Zustand** | Medium | 2KB | Low | ✅ Also good, but Context sufficient |
| **MobX** | High | 20KB | Medium | ❌ Too complex |
| **Props only** | N/A | 0KB | Extreme | ❌ Current problem |

### Why Context is good here

1. **Scope** - Only one feature (note editing), doesn't need global app state
2. **Simplicity** - Built into React, no extra dependencies
3. **Performance** - For editor state, performance is not critical
4. **Familiarity** - Every React developer knows Context
5. **Flexibility** - Easy to migrate to Redux/Zustand later if needed

### When to NOT use Context

```
❌ DON'T use Context if:
- You have rapid, frequent updates (causes full re-render)
- You need time-travel debugging
- You have 100+ pieces of state
- You need complex actions/reducers

✅ DO use Context if:
- State changes infrequently
- Multiple distant components need state
- State is isolated to a feature (like editor)
- Need simple, readable code
```

## Implementation

### Architecture

```typescript
// lib/noteContext.ts

interface NoteEditorState {
  // UI State
  editingNote: NoteItem | null;
  isEditorVisible: boolean;
  isPreviewMode: boolean;
  showVersionHistory: boolean;
  
  // Data
  relatedNotes: NoteItem[];
  
  // Actions
  openEditor(note: NoteItem): void;
  closeEditor(): void;
  updateNote(field: keyof NoteItem, value: any): void;
  saveNote(): Promise<void>;
  togglePreview(): void;
  // ... more actions
}

export const NoteEditorProvider = ({ children, onSave, onCancel }) => {
  const [editingNote, setEditingNote] = useState(null);
  // ... more state
  
  const value: NoteEditorState = {
    editingNote,
    isEditorVisible,
    // ... all state + actions
  };
  
  return (
    <NoteEditorContext.Provider value={value}>
      {children}
    </NoteEditorContext.Provider>
  );
};

export const useNoteEditor = () => {
  const context = useContext(NoteEditorContext);
  if (!context) {
    throw new Error('useNoteEditor must be used within Provider');
  }
  return context;
};
```

### Usage in Components

#### Before (Props Drilling)
```typescript
// pages/dashboard.tsx
const [editingNote, setEditingNote] = useState(null);
const [isPreview, setIsPreview] = useState(false);

return (
  <NoteList notes={notes} onEdit={handleEdit} />
  <NoteEditor 
    note={editingNote}
    isPreview={isPreview}
    onSave={handleSave}
    onCancel={handleCancel}
  />
);

// components/NoteList.tsx
const NoteList = ({ notes, onEdit }) => (
  <div>
    {notes.map(n => (
      <NoteCard note={n} onEdit={onEdit} />
    ))}
  </div>
);

// components/NoteCard.tsx
const NoteCard = ({ note, onEdit }) => (
  <div onClick={() => onEdit(note)}>
    {note.title}
  </div>
);
```

#### After (React Context)
```typescript
// pages/_app.tsx
<NoteEditorProvider onSave={...} onCancel={...}>
  <Dashboard />
</NoteEditorProvider>

// pages/dashboard.tsx
const Dashboard = () => {
  // No props needed for editor state!
  return (
    <>
      <NoteList notes={notes} />
      <NoteEditor />
    </>
  );
};

// components/NoteList.tsx
const NoteList = ({ notes }) => (
  <div>
    {notes.map(n => <NoteCard note={n} />)}
  </div>
);

// components/NoteCard.tsx
const NoteCard = ({ note }) => {
  const { openEditor } = useNoteEditor();
  return (
    <div onClick={() => openEditor(note)}>
      {note.title}
    </div>
  );
};

// components/NoteEditor.tsx
const NoteEditor = () => {
  const {
    editingNote,
    isEditorVisible,
    isPreviewMode,
    updateNote,
    saveNote
  } = useNoteEditor();
  
  if (!isEditorVisible) return null;
  
  return (
    <modal>
      <input
        value={editingNote?.title}
        onChange={e => updateNote('title', e.target.value)}
      />
      <button onClick={saveNote}>保存</button>
    </modal>
  );
};
```

## Performance Considerations

### Default Behavior (Can Cause Re-renders)
```typescript
// ❌ All Context.Provider changes cause all consumers to re-render
const value = {
  editingNote,
  isEditorVisible,
  updateNote,  // New function reference every render!
  saveNote,
};

<NoteEditorContext.Provider value={value}>
  {children}
</NoteEditorContext.Provider>
```

### Optimized (Memoization)
```typescript
// ✅ Stable references, only targeted re-renders
const value = useMemo(() => ({
  editingNote,
  isEditorVisible,
  updateNote,
  saveNote,
}), [editingNote, isEditorVisible]); // Recreate only if deps change

<NoteEditorContext.Provider value={value}>
  {children}
</NoteEditorContext.Provider>
```

### Further Optimization (Split Contexts)
```typescript
// If performance becomes an issue, split into two:
<StateContext.Provider value={state}>
  <ActionsContext.Provider value={actions}>
    {children}
  </ActionsContext.Provider>
</StateContext.Provider>

// Components only subscribing to state won't re-render on action changes
```

## Testing Benefits

```typescript
// Much easier to test now!

describe('NoteList', () => {
  it('should open editor when note is clicked', () => {
    const mockOpenEditor = vi.fn();
    
    // Mock the context
    vi.mocked(useNoteEditor).mockReturnValueOnce({
      openEditor: mockOpenEditor,
      // ... other methods
    } as any);
    
    render(<NoteList notes={mockNotes} />);
    fireEvent.click(screen.getByText(mockNotes[0].title));
    
    expect(mockOpenEditor).toHaveBeenCalledWith(mockNotes[0]);
  });
});

// vs. before: had to mock 10+ props
```

## Consequences

### Positive
✅ **Cleaner components** - No prop drilling  
✅ **Easier refactoring** - Can restructure component tree freely  
✅ **Better separation** - State and UI rendering are separated  
✅ **Simpler testing** - Mock one context instead of many props  
✅ **Feature isolation** - Editor state in one place  
✅ **Scalable** - Easy to add more editors (e.g., tag editor, settings)  

### Negative
⚠️ **Provider overhead** - Extra Context wrapper at root  
⚠️ **Bundle size** - Minimal, but adds to context code  
⚠️ **Debugging** - React DevTools needed to inspect context  
⚠️ **Performance risk** - If not memoized, could cause excessive re-renders  

### Mitigations
- Use `useMemo` for context value
- Consider splitting contexts if many unrelated state pieces
- Use React DevTools Context Inspector for debugging
- Add comments documenting what each context action does

## Migration Path

**Phase 1 (0-1 week):** Implement Context alongside existing props
```typescript
// Support both: use Context if available, fall back to props
const MyComponent = (props) => {
  const contextValue = useNoteEditor();
  const value = contextValue || props; // Fallback
};
```

**Phase 2 (1-2 weeks):** Gradually remove prop drilling
- NoteCard & friends use Context
- NoteList components use Context
- Dashboard simplified

**Phase 3 (2-4 weeks):** Full migration
- Remove all editor-related props
- Update tests
- Remove duplicated state in Dashboard
- Delete migration code

## Related ADRs

- ADR-001: Offline-First Architecture
- ADR-005: Testing Strategy

## References

- React Context API: https://react.dev/reference/react/useContext
- When to use Context: https://react.dev/learn/scaling-up-with-reducer-and-context
- Context Performance: https://kentcdodds.com/blog/how-to-use-react-context-effectively

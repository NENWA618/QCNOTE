# Props Drilling 优化指南

## 问题

原始的 `dashboard.tsx` 中，`NoteEditor` 组件需要接收 30+ 个 props：

```typescript
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
  // ... 更多 props
/>
```

这导致：
- 紧耦合，难以重构
- 状态传递复杂，维护困难
- 新增功能时需要逐层添加新 props

## 解决方案：NoteEditorContext

### 1. 使用 NoteEditorProvider 包装你的应用

```typescript
// pages/_app.tsx
import { NoteEditorProvider } from '../lib/noteContext';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <NoteEditorProvider
      onSave={async (note) => {
        // 处理笔记保存
      }}
      onCancel={() => {
        // 处理取消
      }}
      onRevertVersion={async (noteId, version) => {
        // 处理版本还原
      }}
      getRelatedNotes={(note) => {
        // 返回相关笔记列表
        return [];
      }}
    >
      <Component {...pageProps} />
    </NoteEditorProvider>
  );
}
```

### 2. 简化组件 Props

**原来（Props 穿透）：**
```typescript
interface NoteEditorProps {
  note: NoteItem | null;
  isVisible: boolean;
  isPreview: boolean;
  relatedNotes?: NoteItem[];
  onSave: () => void;
  onCancel: () => void;
  onChange: (field: keyof NoteItem, value: any) => void;
  onTogglePreview: () => void;
  onRevertVersion?: (version: NoteVersion) => void;
}

const NoteEditor: React.FC<NoteEditorProps> = ({
  note, isVisible, isPreview, relatedNotes,
  onSave, onCancel, onChange, onTogglePreview, onRevertVersion
}) => { ... }
```

**现在（使用 Context）：**
```typescript
const NoteEditor: React.FC = () => {
  const editor = useNoteEditor();
  
  return (
    <div>
      {editor.isEditorVisible && editor.editingNote && (
        <div>
          <input 
            value={editor.editingNote.title}
            onChange={(e) => editor.updateNote('title', e.target.value)}
          />
          {/* 更简洁的代码 */}
        </div>
      )}
    </div>
  );
}
```

### 3. 在任何地方访问编辑器状态

```typescript
import { useNoteEditor } from '../lib/noteContext';

// 在列表组件中打开编辑器
const NoteList: React.FC = () => {
  const { openEditor } = useNoteEditor();
  
  return (
    <div>
      {notes.map(note => (
        <div
          key={note.id}
          onClick={() => openEditor(note)}
        >
          {note.title}
        </div>
      ))}
    </div>
  );
};

// 在编辑器组件中使用状态
const NoteEditorModal: React.FC = () => {
  const { 
    editingNote, 
    isEditorVisible, 
    updateNote, 
    saveNote 
  } = useNoteEditor();
  
  if (!isEditorVisible) return null;
  
  return (
    <modal>
      <input
        value={editingNote?.title}
        onChange={(e) => updateNote('title', e.target.value)}
      />
      <button onClick={saveNote}>保存</button>
    </modal>
  );
};
```

## 迁移步骤

### Step 1: 添加 Provider 到根组件
```typescript
// pages/_app.tsx 顶部添加
import { NoteEditorProvider } from '../lib/noteContext';

// 在 Component 外层包装
<NoteEditorProvider onSave={...} onCancel={...}>
  <Component {...pageProps} />
</NoteEditorProvider>
```

### Step 2: 修改需要编辑器状态的组件
```typescript
import { useNoteEditor } from '../lib/noteContext';

// 替换所有通过 props 传递的编辑器相关状态
const MyComponent = () => {
  const editor = useNoteEditor();
  // 使用 editor.editingNote、editor.openEditor 等
};
```

### Step 3: 删除 Props 穿透
```typescript
// 删除这些 props：
// - note, isVisible, isPreview 等

// 简化函数签名：
// 从 (props: NoteEditorProps) => {}
// 改为 () => {}，使用 useNoteEditor() 获取状态
```

## 性能优化

Context 的默认行为是当值改变时重新渲染所有 consumers。为了避免性能问题：

```typescript
// 如果需要，可以将 Context 分割为多个
// - NoteEditorStateContext（只读状态）
// - NoteEditorActionsContext（回调方法）
// 这样只关心某个部分的组件才会重新渲染

export const NoteEditorStateContext = createContext<NoteEditorState | undefined>(undefined);
export const NoteEditorActionsContext = createContext<NoteEditorActions | undefined>(undefined);
```

## 检查清单

- [ ] 在 `_app.tsx` 中添加 `NoteEditorProvider`
- [ ] 更新 `NoteEditor.tsx` 使用 `useNoteEditor()`
- [ ] 更新 `NoteList.tsx` 使用 `useNoteEditor()` 的 `openEditor`
- [ ] 更新 `Dashboard.tsx` 移除编辑器相关 props
- [ ] 测试所有编辑功能是否正常
- [ ] 删除过时的 props 定义

## 益处

✅ **代码更清晰** - 减少 Props 穿透
✅ **方便扩展** - 添加新功能无需逐层传递
✅ **更好维护** - 集中管理编辑器状态
✅ **性能更好** - 按需渲染，不必要的 props 不会触发重新渲染
✅ **易于测试** - 可以单独测试 Context 和组件

import React, { useState, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Block {
  id: string;
  type: 'text' | 'heading' | 'list' | 'code' | 'quote';
  content: string;
}

interface BlockEditorProps {
  content: string;
  onChange: (content: string) => void;
}

const BlockEditor: React.FC<BlockEditorProps> = ({ content, onChange }) => {
  const [blocks, setBlocks] = useState<Block[]>(() => {
    // Parse content into blocks
    const lines = content.split('\n');
    return lines.map((line, index) => ({
      id: `block-${index}`,
      type: getBlockType(line),
      content: line
    }));
  });

  const editorRef = useRef<HTMLDivElement>(null);

  function getBlockType(line: string): Block['type'] {
    if (line.startsWith('#')) return 'heading';
    if (line.startsWith('- ') || line.startsWith('* ')) return 'list';
    if (line.startsWith('```')) return 'code';
    if (line.startsWith('> ')) return 'quote';
    return 'text';
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);

      const newBlocks = arrayMove(blocks, oldIndex, newIndex);
      setBlocks(newBlocks);
      updateContent(newBlocks);
    }
  };

  const updateContent = (newBlocks: Block[]) => {
    const newContent = newBlocks.map(block => block.content).join('\n');
    onChange(newContent);
  };

  const handleBlockChange = (blockId: string, newContent: string) => {
    const newBlocks = blocks.map(block =>
      block.id === blockId
        ? { ...block, content: newContent, type: getBlockType(newContent) }
        : block
    );
    setBlocks(newBlocks);
    updateContent(newBlocks);
  };

  const addBlock = (index: number, type: Block['type'] = 'text') => {
    const newBlock: Block = {
      id: `block-${Date.now()}`,
      type,
      content: type === 'heading' ? '# ' :
               type === 'list' ? '- ' :
               type === 'code' ? '```\n\n```' :
               type === 'quote' ? '> ' : ''
    };

    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
    updateContent(newBlocks);
  };

  const deleteBlock = (blockId: string) => {
    const newBlocks = blocks.filter(block => block.id !== blockId);
    setBlocks(newBlocks);
    updateContent(newBlocks);
  };

interface SortableBlockProps {
  block: Block;
  index: number;
  onChange: (blockId: string, content: string) => void;
  onAdd: (index: number, type: Block['type']) => void;
  onDelete: (blockId: string) => void;
}

const SortableBlock: React.FC<SortableBlockProps> = ({ block, index, onChange, onAdd, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getPlaceholder = (type: Block['type']) => {
    switch (type) {
      case 'heading': return '输入标题...';
      case 'list': return '输入列表项...';
      case 'code': return '输入代码...';
      case 'quote': return '输入引用...';
      default: return '输入文本...';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`group relative p-3 border rounded mb-2 ${
        isDragging ? 'shadow-lg bg-blue-50 z-10' : 'hover:bg-gray-50'
      }`}
    >
      {/* 拖拽手柄 */}
      <div
        {...listeners}
        className="absolute left-2 top-3 w-4 h-4 cursor-move opacity-0 group-hover:opacity-100 transition-opacity"
      >
        ⋮⋮
      </div>

      {/* 块类型指示器 */}
      <div className="absolute right-2 top-2 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
        {block.type}
      </div>

      {/* 块内容 */}
      <div className="ml-6">
        {block.type === 'code' ? (
          <textarea
            value={block.content}
            onChange={(e) => onChange(block.id, e.target.value)}
            placeholder={getPlaceholder(block.type)}
            className="w-full p-2 font-mono text-sm border-0 bg-transparent resize-none focus:outline-none"
            rows={Math.max(3, block.content.split('\n').length)}
          />
        ) : (
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onChange(block.id, e.currentTarget.textContent || '')}
            className={`w-full p-2 border-0 bg-transparent focus:outline-none ${
              block.type === 'heading' ? 'text-xl font-bold' :
              block.type === 'quote' ? 'border-l-4 border-gray-300 pl-4 italic' :
              ''
            }`}
            data-placeholder={getPlaceholder(block.type)}
          >
            {block.content}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onClick={() => onAdd(index, 'text')}
          className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
        >
          +
        </button>
        <button
          onClick={() => onDelete(block.id)}
          className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
        >
          ×
        </button>
      </div>
    </div>
  );
};

  return (
    <div className="block-editor">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          <div className="min-h-96">
            {blocks.map((block, index) => (
              <SortableBlock
                key={block.id}
                block={block}
                index={index}
                onChange={handleBlockChange}
                onAdd={addBlock}
                onDelete={deleteBlock}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {blocks.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          点击 + 按钮添加第一个块
        </div>
      )}
    </div>
  );
};

export default BlockEditor;
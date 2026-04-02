import React, { useState, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';

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

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const newBlocks = Array.from(blocks);
    const [reorderedBlock] = newBlocks.splice(result.source.index, 1);
    newBlocks.splice(result.destination.index, 0, reorderedBlock);

    setBlocks(newBlocks);
    updateContent(newBlocks);
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

  const renderBlock = (block: Block, index: number) => {
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
      <Draggable key={block.id} draggableId={block.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`group relative p-3 border rounded mb-2 ${
              snapshot.isDragging ? 'shadow-lg bg-blue-50' : 'hover:bg-gray-50'
            }`}
          >
            {/* 拖拽手柄 */}
            <div
              {...provided.dragHandleProps}
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
                  onChange={(e) => handleBlockChange(block.id, e.target.value)}
                  placeholder={getPlaceholder(block.type)}
                  className="w-full p-2 font-mono text-sm border-0 bg-transparent resize-none focus:outline-none"
                  rows={Math.max(3, block.content.split('\n').length)}
                />
              ) : (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleBlockChange(block.id, e.currentTarget.textContent || '')}
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
                onClick={() => addBlock(index)}
                className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              >
                +
              </button>
              <button
                onClick={() => deleteBlock(block.id)}
                className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <div className="block-editor">
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="blocks">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="min-h-96"
            >
              {blocks.map((block, index) => renderBlock(block, index))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {blocks.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          点击 + 按钮添加第一个块
        </div>
      )}
    </div>
  );
};

export default BlockEditor;
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NoteItem } from '../lib/storage';

interface NoteEditorProps {
  note: NoteItem | null;
  isVisible: boolean;
  isPreview: boolean;
  relatedNotes?: NoteItem[];
  onSave: () => void;
  onCancel: () => void;
  onChange: (field: keyof NoteItem, value: any) => void;
  onTogglePreview: () => void;
}

const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  isVisible,
  isPreview,
  relatedNotes = [],
  onSave,
  onCancel,
  onChange,
  onTogglePreview
}) => {
  const [localNote, setLocalNote] = useState<NoteItem | null>(null);

  useEffect(() => {
    setLocalNote(note);
  }, [note]);

  if (!isVisible || !localNote) return null;

  const handleFieldChange = (field: keyof NoteItem, value: any) => {
    const updatedNote = { ...localNote, [field]: value };
    setLocalNote(updatedNote);
    onChange(field, value);
  };

  const categories = ['生活', '工作', '学习', '灵感', '其他'];
  const colors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
    '#dda0dd', '#98d8c8', '#f7dc6f', '#bb8fce', '#85c1e9'
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-primary-dark">
            {localNote.id ? '编辑笔记' : '新建笔记'}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={onTogglePreview}
              className={`btn-secondary ${isPreview ? 'bg-primary text-white' : ''}`}
            >
              {isPreview ? '编辑' : '预览'}
            </button>
            <button onClick={onCancel} className="btn-secondary">
              取消
            </button>
            <button onClick={onSave} className="btn-primary">
              保存
            </button>
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex h-[calc(90vh-120px)]">
          {/* Editor Panel */}
          {!isPreview && (
            <div className="flex-1 p-6 overflow-y-auto">
              {/* Title */}
              <div className="mb-4">
                <input
                  type="text"
                  value={localNote.title}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  placeholder="笔记标题"
                  className="w-full text-2xl font-bold border-none outline-none bg-transparent"
                />
              </div>

              {/* Content */}
              <div className="mb-4">
                <textarea
                  value={localNote.content}
                  onChange={(e) => handleFieldChange('content', e.target.value)}
                  placeholder="开始记录您的想法... (支持 Markdown 语法)"
                  className="w-full h-64 resize-none border-none outline-none bg-transparent font-mono text-sm"
                />
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    分类
                  </label>
                  <select
                    value={localNote.category}
                    onChange={(e) => handleFieldChange('category', e.target.value)}
                    className="w-full p-2 border rounded"
                  >
                    <option value="">选择分类</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    颜色主题
                  </label>
                  <div className="flex gap-2">
                    {colors.map(color => (
                      <button
                        key={color}
                        onClick={() => handleFieldChange('color', color)}
                        className={`w-8 h-8 rounded-full border-2 ${
                          localNote.color === color ? 'border-gray-800' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  标签 (用逗号分隔)
                </label>
                <input
                  type="text"
                  value={localNote.tags.join(', ')}
                  onChange={(e) => handleFieldChange('tags', e.target.value.split(',').map(t => t.trim()).filter(t => t))}
                  placeholder="标签1, 标签2, 标签3"
                  className="w-full p-2 border rounded"
                />
              </div>

              {/* Options */}
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={localNote.isFavorite}
                    onChange={(e) => handleFieldChange('isFavorite', e.target.checked)}
                    className="mr-2"
                  />
                  收藏
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={localNote.isArchived}
                    onChange={(e) => handleFieldChange('isArchived', e.target.checked)}
                    className="mr-2"
                  />
                  归档
                </label>
              </div>
            </div>
          )}

          {/* Preview Panel */}
          {isPreview && (
            <div className="flex-1 p-6 overflow-y-auto border-l">
              <h1 className="text-3xl font-bold mb-4" style={{ color: localNote.color }}>
                {localNote.title || '无标题'}
              </h1>

              <div className="mb-3 text-sm text-gray-600">
                <span className="inline-flex items-center gap-1 mr-3">🔗 引用: {localNote.links?.length ?? 0}</span>
                <span className="inline-flex items-center gap-1">↩️ 被引用: {localNote.backlinks?.length ?? 0}</span>
              </div>
              {localNote.versions && localNote.versions.length > 0 && (
                <div className="mb-4 p-3 border border-gray-200 rounded bg-gray-50 text-xs">
                  最近版本：{localNote.versions.length} 次，最早版本 {new Date(localNote.versions[0].updatedAt).toLocaleString()}
                </div>
              )}

              <div className="prose prose-lg max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => <h1 className="text-2xl font-bold mb-4">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-bold mb-3">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-bold mb-2">{children}</h3>,
                    p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
                    ul: ({ children }) => <ul className="mb-4 ml-6 list-disc">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-4 ml-6 list-decimal">{children}</ol>,
                    li: ({ children }) => <li className="mb-1">{children}</li>,
                    code: ({ children }) => (
                      <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                        {children}
                      </code>
                    ),
                    pre: ({ children }) => (
                      <pre className="bg-gray-100 p-4 rounded overflow-x-auto mb-4">
                        {children}
                      </pre>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-primary pl-4 italic text-gray-600 mb-4">
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {localNote.content || '*暂无内容*'}
                </ReactMarkdown>
              </div>

              {/* Metadata in Preview */}
              <div className="mt-6 pt-4 border-t text-sm text-gray-500">
                {localNote.category && (
                  <span className="mr-4">📁 {localNote.category}</span>
                )}
                {localNote.tags.length > 0 && (
                  <span className="mr-4">🏷️ {localNote.tags.join(', ')}</span>
                )}
                {localNote.isFavorite && <span className="mr-4">⭐ 已收藏</span>}
                {localNote.isArchived && <span className="mr-4">📦 已归档</span>}
              </div>

              {relatedNotes.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                  <p className="text-sm font-semibold mb-2">相关笔记</p>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    {relatedNotes.slice(0, 5).map((related) => (
                      <li key={related.id}>{related.title || '无标题'}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NoteEditor;
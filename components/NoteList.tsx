import React from 'react';
import { NoteItem } from '../lib/storage';

interface NoteListProps {
  notes: NoteItem[];
  onEdit: (note: NoteItem) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleArchive: (id: string) => void;
}

const NoteList: React.FC<NoteListProps> = ({
  notes,
  onEdit,
  onDelete,
  onToggleFavorite,
  onToggleArchive
}) => {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN');
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      '生活': 'bg-blue-100 text-blue-800',
      '工作': 'bg-green-100 text-green-800',
      '学习': 'bg-purple-100 text-purple-800',
      '灵感': 'bg-pink-100 text-pink-800',
      '其他': 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors['其他'];
  };

  if (notes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📝</div>
        <h3 className="text-xl font-semibold text-gray-600 mb-2">还没有笔记</h3>
        <p className="text-gray-500">点击&quot;新建笔记&quot;开始记录您的想法</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => (
        <div
          key={note.id}
          className={`card cursor-pointer transition-all hover:shadow-lg ${
            note.isArchived ? 'opacity-60' : ''
          }`}
          onClick={() => onEdit(note)}
        >
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-lg truncate flex-1 mr-2">
              {note.title || '无标题'}
            </h3>
            <div className="flex gap-2 items-center text-xs text-gray-500 mr-2">
              <span>🔗{note.links?.length || 0}</span>
              <span>↩️{note.backlinks?.length || 0}</span>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(note.id);
                }}
                className={`text-sm ${note.isFavorite ? 'text-yellow-500' : 'text-gray-400'}`}
              >
                {note.isFavorite ? '⭐' : '☆'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleArchive(note.id);
                }}
                className={`text-sm ${note.isArchived ? 'text-blue-500' : 'text-gray-400'}`}
              >
                {note.isArchived ? '📦' : '📄'}
              </button>
            </div>
          </div>

          <div className="text-sm text-gray-600 mb-2 line-clamp-3">
            {note.content.replace(/[#*`]/g, '').substring(0, 100)}...
          </div>

          <div className="flex justify-between items-center text-xs text-gray-500">
            <div className="flex gap-2">
              {note.category && (
                <span className={`px-2 py-1 rounded-full text-xs ${getCategoryColor(note.category)}`}>
                  {note.category}
                </span>
              )}
              {note.tags.length > 0 && (
                <span className="text-gray-400">
                  🏷️ {note.tags.slice(0, 2).join(', ')}
                  {note.tags.length > 2 && '...'}
                </span>
              )}
            </div>
            <span>{formatDate(note.updatedAt)}</span>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(note);
              }}
              className="btn-secondary text-xs px-3 py-1"
            >
              编辑
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('确定要删除这条笔记吗？')) {
                  onDelete(note.id);
                }
              }}
              className="btn-danger text-xs px-3 py-1"
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NoteList;
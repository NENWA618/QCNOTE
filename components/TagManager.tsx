import React, { useState, useMemo } from 'react';
import { NoteItem } from '../lib/storage';

interface TagManagerProps {
  notes: NoteItem[];
  onTagRename: (oldTag: string, newTag: string) => void;
  onTagDelete: (tag: string) => void;
  onBulkTagOperation: (operation: 'add' | 'remove', tag: string, noteIds: string[]) => void;
}

const TagManager: React.FC<TagManagerProps> = ({
  notes,
  onTagRename,
  onTagDelete,
  onBulkTagOperation
}) => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [bulkOperation, setBulkOperation] = useState<'add' | 'remove' | null>(null);
  const [bulkTag, setBulkTag] = useState('');

  // 计算标签统计
  const tagStats = useMemo(() => {
    const stats: Record<string, { count: number; notes: NoteItem[] }> = {};

    notes.forEach(note => {
      if (note.tags) {
        note.tags.forEach(tag => {
          if (!stats[tag]) {
            stats[tag] = { count: 0, notes: [] };
          }
          stats[tag].count++;
          stats[tag].notes.push(note);
        });
      }
    });

    return Object.entries(stats)
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [notes]);

  const handleRenameTag = (oldTag: string) => {
    if (newTagName.trim() && newTagName !== oldTag) {
      onTagRename(oldTag, newTagName.trim());
    }
    setRenamingTag(null);
    setNewTagName('');
  };

  const handleDeleteTag = (tag: string) => {
    if (confirm(`确定要删除标签"${tag}"吗？这将从所有笔记中移除此标签。`)) {
      onTagDelete(tag);
    }
  };

  const handleBulkOperation = () => {
    if (!bulkTag.trim() || selectedTags.length === 0) return;

    const noteIds = selectedTags.flatMap(tag =>
      tagStats.find(stat => stat.tag === tag)?.notes.map(note => note.id) || []
    );

    onBulkTagOperation(bulkOperation!, bulkTag.trim(), [...new Set(noteIds)]);
    setBulkOperation(null);
    setBulkTag('');
    setSelectedTags([]);
  };

  const getTagSize = (count: number) => {
    const maxCount = Math.max(...tagStats.map(stat => stat.count));
    const minSize = 0.8;
    const maxSize = 2.0;
    return minSize + ((count / maxCount) * (maxSize - minSize));
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">标签管理</h2>

      {/* 标签云 */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">标签云</h3>
        <div className="flex flex-wrap gap-2">
          {tagStats.map(({ tag, count }) => (
            <span
              key={tag}
              className={`px-3 py-1 rounded-full cursor-pointer transition-all hover:opacity-80 ${
                selectedTags.includes(tag) ? 'ring-2 ring-blue-500' : ''
              }`}
              style={{
                fontSize: `${getTagSize(count)}rem`,
                backgroundColor: `hsl(${tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360}, 70%, 85%)`,
                color: `hsl(${tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360}, 70%, 30%)`
              }}
              onClick={() => setSelectedTags(prev =>
                prev.includes(tag)
                  ? prev.filter(t => t !== tag)
                  : [...prev, tag]
              )}
            >
              {tag} ({count})
            </span>
          ))}
        </div>
      </div>

      {/* 批量操作 */}
      {selectedTags.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold mb-2">批量操作 ({selectedTags.length} 个标签)</h3>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setBulkOperation('add')}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
            >
              批量添加标签
            </button>
            <button
              onClick={() => setBulkOperation('remove')}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              批量移除标签
            </button>
          </div>

          {bulkOperation && (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={`要${bulkOperation === 'add' ? '添加' : '移除'}的标签`}
                value={bulkTag}
                onChange={(e) => setBulkTag(e.target.value)}
                className="flex-1 px-3 py-1 border rounded"
              />
              <button
                onClick={handleBulkOperation}
                disabled={!bulkTag.trim()}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                执行
              </button>
              <button
                onClick={() => {
                  setBulkOperation(null);
                  setBulkTag('');
                }}
                className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                取消
              </button>
            </div>
          )}
        </div>
      )}

      {/* 标签列表 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">标签列表</h3>
        <div className="space-y-2">
          {tagStats.map(({ tag, count, notes: tagNotes }) => (
            <div key={tag} className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag)}
                  onChange={() => setSelectedTags(prev =>
                    prev.includes(tag)
                      ? prev.filter(t => t !== tag)
                      : [...prev, tag]
                  )}
                />
                {renamingTag === tag ? (
                  <input
                    type="text"
                    defaultValue={tag}
                    onBlur={(e) => handleRenameTag(tag)}
                    onKeyPress={(e) => e.key === 'Enter' && handleRenameTag(tag)}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="px-2 py-1 border rounded"
                    autoFocus
                  />
                ) : (
                  <span className="font-medium">{tag}</span>
                )}
                <span className="text-sm text-gray-500">({count} 篇笔记)</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setRenamingTag(tag)}
                  className="px-2 py-1 text-blue-600 hover:bg-blue-100 rounded"
                >
                  重命名
                </button>
                <button
                  onClick={() => handleDeleteTag(tag)}
                  className="px-2 py-1 text-red-600 hover:bg-red-100 rounded"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 标签详情 */}
      {selectedTags.length === 1 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4">标签详情: {selectedTags[0]}</h3>
          <div className="space-y-2">
            {tagStats
              .find(stat => stat.tag === selectedTags[0])
              ?.notes.map(note => (
                <div key={note.id} className="p-3 border rounded bg-gray-50">
                  <h4 className="font-medium">{note.title}</h4>
                  <p className="text-sm text-gray-600">{note.category}</p>
                  <p className="text-sm text-gray-500">
                    更新时间: {new Date(note.updatedAt).toLocaleString()}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TagManager;
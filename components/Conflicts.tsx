import React, { useState, useEffect } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { NoteConflict, NoteItem } from '../lib/storage';

interface ConflictsProps {
  conflicts: NoteConflict[];
  onResolve: (id: string, resolvedNote: NoteItem) => void;
}

const Conflicts: React.FC<ConflictsProps> = ({ conflicts, onResolve }) => {
  const [selectedConflict, setSelectedConflict] = useState<NoteConflict | null>(null);
  const [mergedContent, setMergedContent] = useState('');

  const handleResolve = (conflict: NoteConflict, choice: 'local' | 'remote' | 'merged') => {
    let resolvedNote: NoteItem;
    if (choice === 'local') {
      resolvedNote = conflict.local;
    } else if (choice === 'remote') {
      resolvedNote = conflict.remote;
    } else {
      resolvedNote = { ...conflict.local, content: mergedContent, updatedAt: Date.now() };
    }
    onResolve(conflict.id, resolvedNote);
    setSelectedConflict(null);
    setMergedContent('');
  };

  if (conflicts.length === 0) {
    return <div className="p-4 text-center text-gray-500">No conflicts detected.</div>;
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Sync Conflicts</h2>
      <div className="space-y-4">
        {conflicts.map((conflict) => (
          <div key={conflict.id} className="border rounded p-4 bg-yellow-50">
            <h3 className="font-semibold">{conflict.local.title || 'Untitled'}</h3>
            <p className="text-sm text-gray-600">
              Local updated: {new Date(conflict.local.updatedAt).toLocaleString()} |
              Remote updated: {new Date(conflict.remote.updatedAt).toLocaleString()}
            </p>
            <div className="mt-2 flex space-x-2">
              <button
                onClick={() => setSelectedConflict(conflict)}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Review & Merge
              </button>
              <button
                onClick={() => handleResolve(conflict, 'local')}
                className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Keep Local
              </button>
              <button
                onClick={() => handleResolve(conflict, 'remote')}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Use Remote
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedConflict && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded max-w-6xl w-full max-h-screen overflow-auto">
            <h3 className="text-lg font-bold mb-4">Resolve Conflict: {selectedConflict.local.title}</h3>

            {/* Diff Viewer */}
            <div className="mb-4">
              <ReactDiffViewer
                oldValue={selectedConflict.local.content}
                newValue={selectedConflict.remote.content}
                splitView={true}
                leftTitle="Local Version"
                rightTitle="Remote Version"
                disableWordDiff={false}
                useDarkTheme={false}
                styles={{
                  contentText: {
                    fontSize: '14px',
                    lineHeight: '1.4',
                  },
                  diffContainer: {
                    fontSize: '14px',
                  },
                }}
              />
            </div>

            {/* Manual Merge Section */}
            <div>
              <h4 className="font-semibold mb-2">Manual Merge (Optional)</h4>
              <textarea
                value={mergedContent}
                onChange={(e) => setMergedContent(e.target.value)}
                placeholder="Edit to create a merged version..."
                className="w-full h-32 border rounded p-2"
              />
            </div>

            <div className="mt-4 flex space-x-2">
              <button
                onClick={() => handleResolve(selectedConflict, 'merged')}
                disabled={!mergedContent.trim()}
                className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
              >
                Save Merged
              </button>
              <button
                onClick={() => handleResolve(selectedConflict, 'local')}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Keep Local
              </button>
              <button
                onClick={() => handleResolve(selectedConflict, 'remote')}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Use Remote
              </button>
              <button
                onClick={() => setSelectedConflict(null)}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Conflicts;
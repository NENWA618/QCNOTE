import React, { useState } from 'react';
import { NoteItem } from '../lib/storage';
import AIService from '../lib/aiService';

interface AIAssistantProps {
  note: NoteItem;
  allNotes: NoteItem[];
  onUpdateNote: (updates: Partial<NoteItem>) => void;
  onClose: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({
  note,
  allNotes,
  onUpdateNote,
  onClose
}) => {
  const [aiService] = useState(() => new AIService(process.env.NEXT_PUBLIC_OPENAI_API_KEY));
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isConfigured, setIsConfigured] = useState(!!process.env.NEXT_PUBLIC_OPENAI_API_KEY);

  const handleConfigureAPI = () => {
    if (apiKey.trim()) {
      aiService.setApiKey(apiKey.trim());
      setIsConfigured(true);
      localStorage.setItem('openai_api_key', apiKey.trim());
    }
  };

  const handleGenerateTags = async () => {
    if (!isConfigured) return;

    setIsProcessing(true);
    try {
      const newTags = await aiService.generateTags(note.content);
      const existingTags = note.tags || [];
      const combinedTags = [...new Set([...existingTags, ...newTags])];
      onUpdateNote({ tags: combinedTags });
    } catch (error) {
      alert('生成标签失败：' + error);
    }
    setIsProcessing(false);
  };

  const handleGenerateSummary = async () => {
    if (!isConfigured) return;

    setIsProcessing(true);
    try {
      const summary = await aiService.generateSummary(note.content);
      const updatedContent = `${note.content}\n\n---\n**AI 摘要：** ${summary}`;
      onUpdateNote({ content: updatedContent });
    } catch (error) {
      alert('生成摘要失败：' + error);
    }
    setIsProcessing(false);
  };

  const handleAutoCategorize = async () => {
    if (!isConfigured) return;

    setIsProcessing(true);
    try {
      const category = await aiService.categorizeNote(note.title, note.content);
      onUpdateNote({ category });
    } catch (error) {
      alert('自动分类失败：' + error);
    }
    setIsProcessing(false);
  };

  const handleSuggestRelated = async () => {
    if (!isConfigured) return;

    setIsProcessing(true);
    try {
      const otherNotes = allNotes
        .filter(n => n.id !== note.id)
        .map(n => ({ title: n.title, content: n.content }));

      const suggestions = await aiService.suggestRelatedNotes(note.content, otherNotes);

      if (suggestions.length > 0) {
        const relatedText = suggestions.map(s => `- ${s.title}`).join('\n');
        const updatedContent = `${note.content}\n\n---\n**相关笔记建议：**\n${relatedText}`;
        onUpdateNote({ content: updatedContent });
      } else {
        alert('未找到相关笔记');
      }
    } catch (error) {
      alert('生成相关笔记建议失败：' + error);
    }
    setIsProcessing(false);
  };

  if (!isConfigured) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4">配置 AI 助手</h3>
          <p className="text-sm text-gray-600 mb-4">
            需要 OpenAI API Key 来使用 AI 功能。请在环境变量中设置 NEXT_PUBLIC_OPENAI_API_KEY，或在此输入：
          </p>

          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full p-2 border rounded mb-4"
          />

          <div className="flex gap-2">
            <button
              onClick={handleConfigureAPI}
              disabled={!apiKey.trim()}
              className="flex-1 btn-primary disabled:opacity-50"
            >
              配置
            </button>
            <button
              onClick={onClose}
              className="flex-1 btn-secondary"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">AI 助手</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleGenerateTags}
            disabled={isProcessing}
            className="w-full btn-secondary disabled:opacity-50 flex items-center justify-center gap-2"
          >
            🏷️ 生成智能标签
          </button>

          <button
            onClick={handleGenerateSummary}
            disabled={isProcessing}
            className="w-full btn-secondary disabled:opacity-50 flex items-center justify-center gap-2"
          >
            📝 生成内容摘要
          </button>

          <button
            onClick={handleAutoCategorize}
            disabled={isProcessing}
            className="w-full btn-secondary disabled:opacity-50 flex items-center justify-center gap-2"
          >
            📁 自动分类
          </button>

          <button
            onClick={handleSuggestRelated}
            disabled={isProcessing}
            className="w-full btn-secondary disabled:opacity-50 flex items-center justify-center gap-2"
          >
            🔗 查找相关笔记
          </button>
        </div>

        {isProcessing && (
          <div className="mt-4 text-center text-blue-600">
            AI 处理中...
          </div>
        )}

        <div className="mt-4 text-xs text-gray-500">
          <p>• 生成标签：基于内容自动生成相关标签</p>
          <p>• 生成摘要：创建笔记的简洁摘要</p>
          <p>• 自动分类：智能判断笔记分类</p>
          <p>• 相关笔记：查找内容相似的笔记</p>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
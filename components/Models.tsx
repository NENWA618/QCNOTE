import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { getAISettings, saveAISettings, clearAISettings } from '../lib/aiSettings';
import { callChatCompletion } from '../lib/aiClient';
import NoteStorage, { initWindowStorage } from '../lib/storage';

type SessionUserWithId = {
  id?: string;
};

const AIModelSettings: React.FC = () => {
  const { data: session } = useSession();
  const sessionUserId = (session?.user as SessionUserWithId | undefined)?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [modelName, setModelName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    const settings = await getAISettings(sessionUserId);
    if (settings) {
      setApiEndpoint(settings.apiEndpoint);
      setModelName(settings.modelName);
      setApiKey(settings.apiKey);
      setSavedAt(settings.updatedAt);
    } else {
      setApiEndpoint('');
      setModelName('');
      setApiKey('');
      setSavedAt(null);
    }
    setLoading(false);
  }, [sessionUserId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    const ok = await saveAISettings(sessionUserId, { apiEndpoint, modelName, apiKey });
    if (ok) {
      setSavedAt(Date.now());
      setStatus('已保存到本地加密存储');
    } else {
      setStatus('保存失败，请重试');
    }
  };

  const handleClear = async () => {
    await clearAISettings(sessionUserId);
    setApiEndpoint('');
    setModelName('');
    setApiKey('');
    setSavedAt(null);
    setStatus('已清除本地设置');
  };

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;

    setGenerating(true);
    setGenerateError(null);
    setGenerateStatus(null);

    try {
      const content = await callChatCompletion({ apiEndpoint, apiKey, modelName, prompt });

      const storage = initWindowStorage() || new NoteStorage();
      await storage.setCurrentUser(sessionUserId);
      await storage.addNoteAsync({
        title: `AI 回复 - ${prompt.slice(0, 20)}`,
        content,
        category: 'AI',
        tags: ['ai-generated'],
      });

      setGenerateStatus('已生成并保存为新笔记，可在"笔记"里查看');
      setPrompt('');
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-primary-dark dark:text-dark-text">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light via-primary-medium to-purple-200 text-primary-dark dark:bg-dark-bg p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-primary-dark dark:text-dark-text">
          AI 模型接入
        </h1>
        <p className="text-text-light dark:text-dark-text-secondary mb-8">
          配置外部 AI 服务的接口信息，用于下方的对话生成功能。API Key
          仅加密存储在本地设备，不会上传到服务器。（笔记的语义搜索用的是内置本地模型，与这里的配置无关，见「笔记」页搜索框旁的开关。）
        </p>

        <form
          onSubmit={handleSave}
          className="card dark:bg-dark-surface dark:border-dark-border space-y-6"
        >
          <div>
            <label className="block text-primary-dark dark:text-dark-text mb-2 font-medium">
              API 地址
            </label>
            <input
              type="url"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              placeholder="https://api.openai.com/v1/chat/completions"
              className="form-input w-full"
            />
            <p className="text-xs text-text-light dark:text-dark-text-secondary mt-1">
              填写完整的 Chat Completions 接口地址（OpenAI 兼容格式）
            </p>
          </div>

          <div>
            <label className="block text-primary-dark dark:text-dark-text mb-2 font-medium">
              模型名称
            </label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="例如：text-embedding-3-small"
              className="form-input w-full"
            />
          </div>

          <div>
            <label className="block text-primary-dark dark:text-dark-text mb-2 font-medium">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              className="form-input w-full"
            />
          </div>

          <div className="flex items-center gap-4">
            <button type="submit" className="btn btn-primary">
              保存设置
            </button>
            <button type="button" onClick={handleClear} className="btn btn-secondary">
              清除
            </button>
            {status && (
              <span className="text-sm text-text-light dark:text-dark-text-secondary">
                {status}
              </span>
            )}
          </div>

          {savedAt && (
            <p className="text-xs text-text-light dark:text-dark-text-secondary">
              上次保存时间：{new Date(savedAt).toLocaleString()}
            </p>
          )}
        </form>

        <form
          onSubmit={handleGenerate}
          className="card dark:bg-dark-surface dark:border-dark-border space-y-4 mt-8"
        >
          <h2 className="text-2xl font-bold text-primary-dark dark:text-dark-text">对话</h2>
          <p className="text-sm text-text-light dark:text-dark-text-secondary">
            浏览器直接调用上面配置的 AI 服务（不经过 QCNOTE
            服务器），生成的内容会作为一条新笔记保存到本地。
          </p>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="输入你想问的内容..."
            className="form-input w-full"
          />

          <div className="flex items-center gap-4">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={generating || !prompt.trim()}
            >
              {generating ? '生成中...' : '生成并保存为笔记'}
            </button>
            {generateStatus && (
              <span className="text-sm text-green-600 dark:text-green-400">{generateStatus}</span>
            )}
          </div>

          {generateError && (
            <p className="text-sm text-red-600 dark:text-red-400">{generateError}</p>
          )}
        </form>
      </div>
    </div>
  );
};

export default AIModelSettings;

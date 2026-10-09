import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getAISettings, saveAISettings, clearAISettings } from '../lib/aiSettings';
import { callChatCompletion } from '../lib/aiClient';
import NoteStorage, { NoteStorageError, initWindowStorage } from '../lib/storage';

const LOCKED_HINT =
  '当前设备未解锁，无法读取或保存 API Key。请先打开「笔记」页完成设备验证后再回来。';

/** The shared NoteStorage, switched to `userId` (whose key seals the AI settings). */
async function storageFor(userId: string | null): Promise<NoteStorage> {
  const storage = initWindowStorage() || new NoteStorage();
  if (storage.currentUserId !== userId) await storage.setCurrentUser(userId);
  return storage;
}

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

  // 切换用户时回到加载状态（渲染期调整，避免在 effect 里同步 setState）
  const [loadedFor, setLoadedFor] = useState(sessionUserId);
  if (loadedFor !== sessionUserId) {
    setLoadedFor(sessionUserId);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let settings = null;
      let message: string | null = null;
      try {
        settings = await getAISettings(sessionUserId, await storageFor(sessionUserId));
      } catch (e) {
        message =
          e instanceof NoteStorageError && e.kind === 'locked' ? LOCKED_HINT : '读取设置失败';
      }
      if (cancelled) return;
      setApiEndpoint(settings?.apiEndpoint ?? '');
      setModelName(settings?.modelName ?? '');
      setApiKey(settings?.apiKey ?? '');
      setSavedAt(settings?.updatedAt ?? null);
      setStatus(message);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    const storage = await storageFor(sessionUserId);
    const ok = await saveAISettings(sessionUserId, { apiEndpoint, modelName, apiKey }, storage);
    if (ok) {
      setSavedAt(Date.now());
      setStatus('已保存到本地加密存储');
    } else {
      setStatus(storage.notesDbLocked ? LOCKED_HINT : '保存失败，请重试');
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

      const storage = await storageFor(sessionUserId);
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
    return <div className="p-8 text-center text-ink dark:text-dark-text">加载中...</div>;
  }

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-ink dark:text-dark-text">AI 模型接入</h1>
        <p className="text-text-light dark:text-dark-text-secondary mb-8">
          配置外部 AI 服务的接口信息，用于下方的对话生成功能。API Key
          仅加密存储在本地设备，不会上传到服务器。（笔记的语义搜索用的是内置本地模型，与这里的配置无关，见「笔记」页搜索框旁的开关。）
        </p>

        <form
          onSubmit={handleSave}
          className="card dark:bg-dark-surface dark:border-dark-border space-y-6"
        >
          <div>
            <label className="block text-ink dark:text-dark-text mb-2 font-medium">API 地址</label>
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
            <label className="block text-ink dark:text-dark-text mb-2 font-medium">模型名称</label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="例如：text-embedding-3-small"
              className="form-input w-full"
            />
          </div>

          <div>
            <label className="block text-ink dark:text-dark-text mb-2 font-medium">API Key</label>
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
          <h2 className="text-2xl font-bold text-ink dark:text-dark-text">对话</h2>
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

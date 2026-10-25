import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { getAISettings, saveAISettings, clearAISettings } from '../lib/aiSettings';
import { callChatCompletion } from '../lib/aiClient';
import NoteStorage, { NoteStorageError, initWindowStorage } from '../lib/storage';
import { confirmDialog } from '../lib/dialog';
import { isImeComposing } from '../lib/ime';

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

interface ModelFields {
  apiEndpoint: string;
  modelName: string;
  apiKey: string;
}

interface Status {
  type: 'success' | 'error';
  text: string;
}

const EMPTY_FIELDS: ModelFields = { apiEndpoint: '', modelName: '', apiKey: '' };

const panelClass =
  'bg-white/95 dark:bg-dark-surface rounded-2xl border border-primary-light/40 dark:border-dark-border p-5 sm:p-6';

const labelClass = 'block text-sm font-medium text-ink dark:text-dark-text mb-1.5';

const isHttpUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const statusClass = (s: Status) =>
  s.type === 'success'
    ? 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800'
    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900';

function ModelsSkeleton() {
  return (
    <div className="animate-pulse grid gap-6 lg:grid-cols-2" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className={`${panelClass} space-y-4`}>
          <div className="h-6 w-28 rounded bg-primary-light dark:bg-dark-surface-light" />
          <div className="h-11 rounded-lg bg-primary-light/70 dark:bg-dark-surface-light" />
          <div className="h-11 rounded-lg bg-primary-light/70 dark:bg-dark-surface-light" />
          <div className="h-11 rounded-lg bg-primary-light/70 dark:bg-dark-surface-light" />
        </div>
      ))}
    </div>
  );
}

const AIModelSettings: React.FC = () => {
  const { data: session } = useSession();
  const sessionUserId = (session?.user as SessionUserWithId | undefined)?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<ModelFields>(EMPTY_FIELDS);
  // 最近一次读取/保存成功的值，用来判断有没有未保存的更改
  const [saved, setSaved] = useState<ModelFields>(EMPTY_FIELDS);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [showKey, setShowKey] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<{ prompt: string; content: string } | null>(null);

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
      const loaded = {
        apiEndpoint: settings?.apiEndpoint ?? '',
        modelName: settings?.modelName ?? '',
        apiKey: settings?.apiKey ?? '',
      };
      setFields(loaded);
      setSaved(loaded);
      setSavedAt(settings?.updatedAt ?? null);
      setStatus(message ? { type: 'error', text: message } : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  // 成功提示 3 秒后消失；错误提示保留，直到下一次操作
  useEffect(() => {
    if (status?.type !== 'success') return;
    const timer = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(timer);
  }, [status]);

  const setField = (key: keyof ModelFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((prev) => ({ ...prev, [key]: e.target.value }));
    if (status?.type === 'success') setStatus(null);
  };

  const dirty =
    fields.apiEndpoint !== saved.apiEndpoint ||
    fields.modelName !== saved.modelName ||
    fields.apiKey !== saved.apiKey;
  const endpointInvalid = !!fields.apiEndpoint.trim() && !isHttpUrl(fields.apiEndpoint.trim());
  const configured =
    !!fields.apiEndpoint.trim() &&
    !endpointInvalid &&
    !!fields.modelName.trim() &&
    !!fields.apiKey.trim();
  const hasSaved = !!(saved.apiEndpoint || saved.modelName || saved.apiKey);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !dirty || endpointInvalid) return;
    setSaving(true);
    setStatus(null);
    const next = {
      apiEndpoint: fields.apiEndpoint.trim(),
      modelName: fields.modelName.trim(),
      apiKey: fields.apiKey.trim(),
    };
    try {
      const storage = await storageFor(sessionUserId);
      const ok = await saveAISettings(sessionUserId, next, storage);
      if (ok) {
        setFields(next);
        setSaved(next);
        setSavedAt(Date.now());
        setStatus({ type: 'success', text: '已保存到本地加密存储' });
      } else {
        setStatus({
          type: 'error',
          text: storage.notesDbLocked ? LOCKED_HINT : '保存失败，请重试',
        });
      }
    } catch {
      setStatus({ type: 'error', text: '保存失败，请重试' });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    const ok = await confirmDialog({
      title: '清除 AI 接口配置？',
      description: '将清除本设备上保存的 AI 接口配置，包括 API Key。',
      confirmLabel: '清除',
      tone: 'danger',
    });
    if (!ok) return;
    await clearAISettings(sessionUserId);
    setFields(EMPTY_FIELDS);
    setSaved(EMPTY_FIELDS);
    setSavedAt(null);
    setShowKey(false);
    setStatus({ type: 'success', text: '已清除本地设置' });
  };

  const handleGenerate = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || generating || !configured) return;

    setGenerating(true);
    setGenerateError(null);

    try {
      const content = await callChatCompletion({
        apiEndpoint: fields.apiEndpoint.trim(),
        apiKey: fields.apiKey.trim(),
        modelName: fields.modelName.trim(),
        prompt: text,
      });

      const storage = await storageFor(sessionUserId);
      await storage.addNoteAsync({
        title: `AI 回复 - ${text.slice(0, 20)}`,
        content,
        category: 'AI',
        tags: ['ai-generated'],
      });

      setLastReply({ prompt: text, content });
      setPrompt('');
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  // Ctrl/⌘ + Enter 发送
  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isImeComposing(e.nativeEvent)) {
      e.preventDefault();
      void handleGenerate();
    }
  };

  const header = (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink dark:text-dark-text">AI 模型接入</h1>
        <p className="mt-1 text-sm sm:text-base text-text-light max-w-2xl">
          接入 OpenAI 兼容的外部 AI 服务，用来生成笔记。API Key 仅加密存储在本设备，不会上传到
          QCNOTE 服务器。
        </p>
      </div>
      {!loading && (
        <span
          className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
            hasSaved && !dirty && configured
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
              : 'bg-gray-100 text-gray-600 dark:bg-dark-surface-light dark:text-dark-text-secondary'
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${hasSaved && !dirty && configured ? 'bg-green-500' : 'bg-gray-400'}`}
          />
          {hasSaved && !dirty && configured ? '已配置' : dirty ? '有未保存的更改' : '未配置'}
        </span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div>
        {header}
        <div role="status">
          <span className="sr-only">加载中…</span>
          <ModelsSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* 接口配置 */}
        <form onSubmit={handleSave} className={panelClass} noValidate>
          <h2 className="text-lg font-semibold text-ink dark:text-dark-text">接口配置</h2>
          <p className="mt-1 mb-5 text-sm text-text-light">
            支持 OpenAI Chat Completions 格式的接口，目标服务需允许浏览器跨域访问（CORS）
          </p>

          {status && (
            <div
              role={status.type === 'error' ? 'alert' : 'status'}
              className={`mb-5 rounded-xl border p-3 text-sm ${statusClass(status)}`}
            >
              {status.text}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label htmlFor="ai-endpoint" className={labelClass}>
                API 地址
              </label>
              <input
                id="ai-endpoint"
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                value={fields.apiEndpoint}
                onChange={setField('apiEndpoint')}
                placeholder="https://api.openai.com/v1/chat/completions"
                aria-invalid={endpointInvalid}
                aria-describedby="ai-endpoint-hint"
                className="input py-2 text-sm"
              />
              <p
                id="ai-endpoint-hint"
                className={`mt-1 text-xs ${endpointInvalid ? 'text-red-600 dark:text-red-400' : 'text-text-light'}`}
              >
                {endpointInvalid
                  ? '请输入以 http:// 或 https:// 开头的地址'
                  : '填写完整的 Chat Completions 接口地址，通常以 /chat/completions 结尾'}
              </p>
            </div>

            <div>
              <label htmlFor="ai-model" className={labelClass}>
                模型名称
              </label>
              <input
                id="ai-model"
                type="text"
                autoCapitalize="off"
                autoComplete="off"
                spellCheck={false}
                value={fields.modelName}
                onChange={setField('modelName')}
                placeholder="例如：gpt-4o-mini"
                className="input py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="ai-key" className={labelClass}>
                API Key
              </label>
              <div className="relative">
                <input
                  id="ai-key"
                  type={showKey ? 'text' : 'password'}
                  autoCapitalize="off"
                  autoComplete="off"
                  spellCheck={false}
                  value={fields.apiKey}
                  onChange={setField('apiKey')}
                  placeholder="sk-..."
                  className="input py-2 pr-16 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-pressed={showKey}
                  aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                  className="absolute inset-y-0 right-1 my-auto h-9 rounded-full px-3 text-xs font-medium text-ink-pink hover:bg-primary-light dark:hover:bg-accent-pink/15"
                >
                  {showKey ? '隐藏' : '显示'}
                </button>
              </div>
              <p className="mt-1 text-xs text-text-light">🔒 用本设备的密钥加密后保存在本地</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            {hasSaved && (
              <button type="button" onClick={handleClear} className="btn btn-secondary">
                清除
              </button>
            )}
            <p className="text-xs text-text-light text-center sm:text-left sm:mr-auto">
              {savedAt ? `上次保存：${new Date(savedAt).toLocaleString('zh-CN')}` : ''}
            </p>
            <button
              type="submit"
              className="btn btn-primary sm:min-w-[7rem]"
              disabled={saving || !dirty || endpointInvalid}
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </form>

        {/* 对话 */}
        <form onSubmit={handleGenerate} className={`${panelClass} lg:sticky lg:top-24`}>
          <h2 className="text-lg font-semibold text-ink dark:text-dark-text">生成笔记</h2>
          <p className="mt-1 mb-5 text-sm text-text-light">
            浏览器直接调用上面的 AI 服务（不经过 QCNOTE 服务器），回复会保存为一条新笔记。
          </p>

          {!configured && (
            <div className="mb-4 rounded-xl border border-dashed border-primary-dark/40 dark:border-dark-border p-3 text-sm text-text-light">
              先填写 API 地址、模型名称和 API Key，才能开始生成。
            </div>
          )}

          <label htmlFor="ai-prompt" className="sr-only">
            输入你想问的内容
          </label>
          <textarea
            id="ai-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handlePromptKeyDown}
            rows={5}
            placeholder="输入你想问的内容..."
            disabled={generating}
            className="input py-2 resize-y"
          />

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="hidden sm:inline text-xs text-text-light">Ctrl / ⌘ + Enter 发送</span>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={generating || !prompt.trim() || !configured}
            >
              {generating ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  生成中...
                </>
              ) : (
                '生成并保存为笔记'
              )}
            </button>
          </div>

          {generateError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 break-words dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
            >
              {generateError}
            </div>
          )}

          {lastReply && !generateError && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-green-200 dark:border-green-900 overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
                <span>✓ 已保存为新笔记</span>
                <Link href="/dashboard" className="font-medium underline underline-offset-2">
                  去笔记查看
                </Link>
              </div>
              <div className="px-3 py-3">
                <p className="text-xs text-text-light truncate">问：{lastReply.prompt}</p>
                <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm text-ink dark:text-dark-text">
                  {lastReply.content}
                </p>
              </div>
            </div>
          )}
        </form>
      </div>

      <p className="mt-6 text-xs text-text-light">
        笔记的语义搜索用的是内置本地模型，与这里的配置无关，可在「笔记」页搜索框旁开关。
      </p>
    </div>
  );
};

export default AIModelSettings;

import React, { useState } from 'react';

interface OneDriveConfig {
  accessToken: string;
  folderPath: string;
  encryptionKey?: string;
}

export type OneDriveResult = { ok: true } | { ok: false; error: string };

interface OneDriveSyncProps {
  config: OneDriveConfig;
  configSaved: boolean;
  /** 用传入的配置同步（未保存时会先保存）；失败时返回原因，不再弹 alert */
  onSync: (config: OneDriveConfig) => Promise<OneDriveResult>;
  onSaveConfig: (config: OneDriveConfig) => Promise<boolean>;
  onClearConfig: () => Promise<boolean>;
}

interface Status {
  type: 'success' | 'error';
  text: string;
}

const labelClass = 'mb-1 block text-sm font-medium text-ink dark:text-dark-text';

const OneDriveSync: React.FC<OneDriveSyncProps> = ({
  config,
  configSaved,
  onSync,
  onSaveConfig,
  onClearConfig,
}) => {
  // 输入只改本地副本：原来每敲一个字就写一次存储
  const [local, setLocal] = useState<OneDriveConfig>(config);
  const [prevConfig, setPrevConfig] = useState(config);
  if (prevConfig !== config) {
    setPrevConfig(config);
    setLocal(config);
  }
  const [busy, setBusy] = useState<null | 'sync' | 'save' | 'clear'>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [showToken, setShowToken] = useState(false);

  const dirty =
    local.accessToken !== config.accessToken ||
    local.folderPath !== config.folderPath ||
    (local.encryptionKey || '') !== (config.encryptionKey || '');
  const saved = configSaved && !dirty;

  const set = (key: keyof OneDriveConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setLocal((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSync = async () => {
    setBusy('sync');
    setStatus(null);
    const result = await onSync(local);
    setBusy(null);
    if (result.ok) {
      setLastSyncTime(new Date());
      setStatus({ type: 'success', text: '同步完成' });
    } else {
      setStatus({ type: 'error', text: result.error });
    }
  };

  const handleSave = async () => {
    setBusy('save');
    setStatus(null);
    const ok = await onSaveConfig(local);
    setBusy(null);
    setStatus(ok ? { type: 'success', text: '配置已保存' } : { type: 'error', text: '保存失败' });
  };

  const handleClear = async () => {
    if (!window.confirm('清除本机保存的 OneDrive 配置（包括访问令牌）？远端文件不受影响。')) return;
    setBusy('clear');
    setStatus(null);
    const ok = await onClearConfig();
    setBusy(null);
    setStatus(
      ok ? { type: 'success', text: '已清除配置' } : { type: 'error', text: '清除配置失败' },
    );
  };

  return (
    <section className="rounded-2xl border border-primary-light/40 bg-white/95 p-4 sm:p-6 dark:border-dark-border dark:bg-dark-surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink dark:text-dark-text">☁️ OneDrive 同步</h2>
          <p className="mt-0.5 text-sm text-text-light">使用 Microsoft Graph 访问令牌</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs ${
            saved
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-gray-100 text-gray-600 dark:bg-dark-surface-light dark:text-dark-text-secondary'
          }`}
        >
          {saved ? '配置已保存' : dirty ? '有未保存的更改' : '未配置'}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="onedrive-token" className={labelClass}>
            Access Token
          </label>
          <div className="relative">
            <input
              id="onedrive-token"
              type={showToken ? 'text' : 'password'}
              value={local.accessToken}
              onChange={set('accessToken')}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="input py-2 pr-14 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              aria-pressed={showToken}
              aria-label={showToken ? '隐藏访问令牌' : '显示访问令牌'}
              className="absolute inset-y-0 right-1 my-auto h-8 rounded-full px-2.5 text-xs text-ink-pink hover:bg-primary-light dark:hover:bg-accent-pink/15"
            >
              {showToken ? '隐藏' : '显示'}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="onedrive-path" className={labelClass}>
            文件路径
          </label>
          <input
            id="onedrive-path"
            value={local.folderPath}
            onChange={set('folderPath')}
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Notes/notes.json"
            className="input py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="onedrive-key" className={labelClass}>
            加密密钥 <span className="font-normal text-text-light">（可选）</span>
          </label>
          <input
            id="onedrive-key"
            type="password"
            value={local.encryptionKey || ''}
            onChange={set('encryptionKey')}
            autoComplete="off"
            placeholder="需与其他设备一致"
            className="input py-2 text-sm"
          />
        </div>
      </div>

      {status && (
        <p
          role={status.type === 'error' ? 'alert' : 'status'}
          className={`mt-4 rounded-xl px-3 py-2 text-sm ${
            status.type === 'success'
              ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300'
              : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {status.text}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleSync}
          disabled={!!busy || !local.accessToken}
          className="btn btn-primary"
        >
          {busy === 'sync' ? '同步中…' : saved ? '⇅ 立即同步' : '保存并同步'}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!!busy}
            className="btn btn-secondary"
          >
            {busy === 'save' ? '保存中…' : '仅保存'}
          </button>
        )}
        {configSaved && (
          <button
            type="button"
            onClick={handleClear}
            disabled={!!busy}
            className="btn btn-secondary sm:ml-auto"
          >
            清除配置
          </button>
        )}
      </div>

      {lastSyncTime && (
        <p className="mt-3 text-xs text-text-light">
          本次打开后上次同步：{lastSyncTime.toLocaleTimeString('zh-CN')}
        </p>
      )}
    </section>
  );
};

export default OneDriveSync;

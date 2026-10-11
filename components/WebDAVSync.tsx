import React, { useEffect, useState } from 'react';
import { WebDAVConfig } from '../lib/storage';
import WebDAVSyncManager, { SyncStatus } from '../lib/webdavSyncManager';

interface WebDAVSyncProps {
  config: WebDAVConfig;
  syncManager?: WebDAVSyncManager | null;
  onSaveConfig: (config: WebDAVConfig) => Promise<boolean>;
  onPush: (config: WebDAVConfig) => Promise<boolean>;
  onPull: (config: WebDAVConfig) => Promise<boolean>;
  onClearConfig: () => Promise<boolean>;
  onConfigChange?: (config: WebDAVConfig) => void;
}

interface Status {
  type: 'success' | 'error';
  text: string;
}

const SYNC_INTERVALS = [
  { label: '5 分钟', value: 5 * 60 * 1000 },
  { label: '10 分钟', value: 10 * 60 * 1000 },
  { label: '30 分钟', value: 30 * 60 * 1000 },
  { label: '1 小时', value: 60 * 60 * 1000 },
];

const EMPTY_CONFIG: WebDAVConfig = {
  url: '',
  username: '',
  password: '',
  remotePath: 'notes.json',
};

const labelClass = 'mb-1 block text-sm font-medium text-ink dark:text-dark-text';
const fieldClass = 'input py-2 text-sm';

const sameConfig = (a: WebDAVConfig, b: WebDAVConfig) =>
  (a.url || '') === (b.url || '') &&
  (a.remotePath || '') === (b.remotePath || '') &&
  (a.username || '') === (b.username || '') &&
  (a.password || '') === (b.password || '') &&
  (a.encryptionKey || '') === (b.encryptionKey || '') &&
  !!a.autoSyncEnabled === !!b.autoSyncEnabled &&
  (a.syncInterval || 0) === (b.syncInterval || 0) &&
  (a.conflictStrategy || 'manual') === (b.conflictStrategy || 'manual');

function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className={`${fieldClass} pr-14`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-pressed={show}
        aria-label={show ? `隐藏${label}` : `显示${label}`}
        className="absolute inset-y-0 right-1 my-auto h-8 rounded-full px-2.5 text-xs text-ink-pink hover:bg-primary-light dark:hover:bg-accent-pink/15"
      >
        {show ? '隐藏' : '显示'}
      </button>
    </div>
  );
}

const WebDAVSync: React.FC<WebDAVSyncProps> = ({
  config,
  syncManager,
  onSaveConfig,
  onPush,
  onPull,
  onClearConfig,
  onConfigChange,
}) => {
  const [localConfig, setLocalConfig] = useState<WebDAVConfig>(config);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'sync' | 'push' | 'pull' | 'clear'>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(
    () => syncManager?.getStatus() ?? null,
  );

  // 外部配置或同步管理器变化时重置本地状态（渲染期调整，避免在 effect 里同步 setState）
  const [prevConfig, setPrevConfig] = useState(config);
  if (prevConfig !== config) {
    setPrevConfig(config);
    setLocalConfig(config);
  }
  const [prevManager, setPrevManager] = useState(syncManager);
  if (prevManager !== syncManager) {
    setPrevManager(syncManager);
    setSyncStatus(syncManager?.getStatus() ?? null);
  }

  useEffect(() => {
    if (!syncManager) return;
    return syncManager.onStatusChange(setSyncStatus);
  }, [syncManager]);

  const set = <K extends keyof WebDAVConfig>(key: K, value: WebDAVConfig[K]) =>
    setLocalConfig((prev) => ({ ...prev, [key]: value }));

  const dirty = !sameConfig(localConfig, config);
  const ready = !!localConfig.url && !!localConfig.remotePath;
  const hasSaved = !!config.url;

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<Status>) => {
    setBusy(kind);
    setStatus(null);
    try {
      setStatus(await fn());
    } catch (e) {
      setStatus({ type: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const handleSave = () =>
    run('save', async () => {
      const ok = await onSaveConfig(localConfig);
      if (ok) onConfigChange?.(localConfig);
      return ok
        ? { type: 'success', text: '配置已保存' }
        : { type: 'error', text: '保存失败，请重试' };
    });

  const handleSyncNow = () =>
    run('sync', async () => {
      if (!syncManager) return { type: 'error', text: '同步管理器未就绪，请稍后再试' };
      const ok = await syncManager.syncNow(localConfig, 'both');
      return ok
        ? { type: 'success', text: '同步完成：已合并远端更改并上传' }
        : { type: 'error', text: '同步失败，请检查地址、账号和网络' };
    });

  const handlePull = () =>
    run('pull', async () =>
      (await onPull(localConfig))
        ? { type: 'success', text: '已把远端的更改合并到本机' }
        : { type: 'error', text: '下载失败，或远端数据无法解析' },
    );

  const handlePush = () => {
    // 与“立即同步”不同，这里直接用本机笔记覆盖远端，其他设备尚未同步的修改会丢失
    if (
      !window.confirm(
        '将用本机的笔记覆盖 WebDAV 上的文件，其他设备尚未同步的修改会丢失。\n\n一般情况下请使用“立即同步”。确定继续？',
      )
    ) {
      return;
    }
    void run('push', async () =>
      (await onPush(localConfig))
        ? { type: 'success', text: '已用本机笔记覆盖远端' }
        : { type: 'error', text: '上传失败' },
    );
  };

  const handleClear = () => {
    if (!window.confirm('清除本机保存的 WebDAV 配置（包括密码和加密密钥）？远端文件不受影响。')) {
      return;
    }
    void run('clear', async () => {
      const ok = await onClearConfig();
      if (ok) setLocalConfig(EMPTY_CONFIG);
      return ok ? { type: 'success', text: '已清除配置' } : { type: 'error', text: '清除配置失败' };
    });
  };

  const lastStatus = syncStatus?.lastSyncStatus;

  return (
    <section className="rounded-2xl border border-primary-light/40 bg-white/95 p-4 sm:p-6 dark:border-dark-border dark:bg-dark-surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink dark:text-dark-text">🌐 WebDAV 同步</h2>
          <p className="mt-0.5 text-sm text-text-light">
            Nextcloud、坚果云等支持 WebDAV 的网盘都可以
          </p>
        </div>
        {syncStatus && hasSaved && (
          <div className="text-right text-xs">
            <p
              className={
                lastStatus === 'success'
                  ? 'text-green-700 dark:text-green-400'
                  : lastStatus === 'failure'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-text-light'
              }
            >
              {lastStatus === 'success' && '✓ 上次同步成功'}
              {lastStatus === 'failure' && '✕ 上次同步失败'}
              {lastStatus === 'pending' && '⏳ 同步中…'}
              {lastStatus === 'idle' && '尚未同步'}
              {syncStatus.lastSyncTime && ` · ${formatSyncTime(syncStatus.lastSyncTime)}`}
            </p>
            {syncStatus.isRunning && syncStatus.nextSyncTime && (
              <p className="mt-0.5 text-text-light">
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500 align-middle" />
                自动同步：{formatNextSyncTime(syncStatus.nextSyncTime)}
              </p>
            )}
          </div>
        )}
      </div>

      {syncStatus?.lastSyncError && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 font-mono text-xs break-all text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {syncStatus.lastSyncError}
        </p>
      )}

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="webdav-url" className={labelClass}>
              WebDAV 地址
            </label>
            <input
              id="webdav-url"
              type="url"
              inputMode="url"
              autoCapitalize="off"
              spellCheck={false}
              value={localConfig.url || ''}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://example.com/remote.php/dav/files/用户名/"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="webdav-user" className={labelClass}>
              用户名
            </label>
            <input
              id="webdav-user"
              autoComplete="username"
              autoCapitalize="off"
              value={localConfig.username || ''}
              onChange={(e) => set('username', e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="webdav-pass" className={labelClass}>
              密码 / 应用密码
            </label>
            <SecretInput
              id="webdav-pass"
              label="密码"
              value={localConfig.password || ''}
              onChange={(v) => set('password', v)}
            />
          </div>
          <div>
            <label htmlFor="webdav-path" className={labelClass}>
              远程文件路径
            </label>
            <input
              id="webdav-path"
              autoCapitalize="off"
              spellCheck={false}
              value={localConfig.remotePath || ''}
              onChange={(e) => set('remotePath', e.target.value)}
              placeholder="notes.json"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="webdav-key" className={labelClass}>
              加密密钥 <span className="font-normal text-text-light">（可选）</span>
            </label>
            <SecretInput
              id="webdav-key"
              label="加密密钥"
              value={localConfig.encryptionKey || ''}
              onChange={(v) => set('encryptionKey', v)}
              placeholder="填写后上传前会 AES-GCM 加密"
            />
          </div>
        </div>

        <fieldset className="rounded-xl bg-gray-50 p-4 dark:bg-dark-surface-light">
          <legend className="sr-only">自动同步</legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink dark:text-dark-text">
            <input
              type="checkbox"
              checked={!!localConfig.autoSyncEnabled}
              onChange={(e) => set('autoSyncEnabled', e.target.checked)}
              className="h-4 w-4 accent-[#dc96b4]"
            />
            自动同步
          </label>
          {localConfig.autoSyncEnabled && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="webdav-interval" className="mb-1 block text-xs text-text-light">
                  同步间隔
                </label>
                <select
                  id="webdav-interval"
                  value={localConfig.syncInterval || 5 * 60 * 1000}
                  onChange={(e) => set('syncInterval', parseInt(e.target.value))}
                  className="select py-2 text-sm"
                >
                  {SYNC_INTERVALS.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="webdav-strategy" className="mb-1 block text-xs text-text-light">
                  遇到冲突时
                </label>
                <select
                  id="webdav-strategy"
                  value={localConfig.conflictStrategy || 'manual'}
                  onChange={(e) =>
                    set(
                      'conflictStrategy',
                      e.target.value as 'prefer-local' | 'prefer-remote' | 'manual',
                    )
                  }
                  className="select py-2 text-sm"
                >
                  <option value="manual">留给我手动处理（推荐）</option>
                  <option value="prefer-local">自动采用本机版本</option>
                  <option value="prefer-remote">自动采用远端版本</option>
                </select>
              </div>
            </div>
          )}
        </fieldset>

        {status && (
          <p
            role={status.type === 'error' ? 'alert' : 'status'}
            className={`rounded-xl px-3 py-2 text-sm ${
              status.type === 'success'
                ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
            }`}
          >
            {status.text}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={!!busy || !ready}
            className="btn btn-primary"
            title="双向合并：下载远端更改，合并后再上传"
          >
            {busy === 'sync' ? '同步中…' : '⇅ 立即同步'}
          </button>
          <button type="submit" disabled={!!busy || !dirty} className="btn btn-secondary">
            {busy === 'save' ? '保存中…' : dirty ? '保存配置' : '已保存'}
          </button>
          {dirty && (
            <span className="text-xs text-text-light">
              有未保存的更改，保存后自动同步设置才会生效
            </span>
          )}
        </div>

        <details className="group rounded-xl border border-gray-200 dark:border-dark-border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm text-ink dark:text-dark-text [&::-webkit-details-marker]:hidden">
            更多操作
            <span
              aria-hidden="true"
              className="text-text-light transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <div className="grid gap-2 border-t border-gray-100 p-3 sm:grid-cols-3 dark:border-dark-border">
            <button
              type="button"
              onClick={handlePull}
              disabled={!!busy || !ready}
              className="btn btn-sm btn-secondary"
              title="把远端的更改合并到本机，不上传"
            >
              {busy === 'pull' ? '下载中…' : '仅下载合并'}
            </button>
            <button
              type="button"
              onClick={handlePush}
              disabled={!!busy || !ready}
              className="btn btn-sm btn-secondary"
              title="用本机笔记覆盖远端文件"
            >
              {busy === 'push' ? '上传中…' : '覆盖上传'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={!!busy || !hasSaved}
              className="btn btn-sm btn-danger"
            >
              清除配置
            </button>
          </div>
        </details>
      </form>
    </section>
  );
};

/**
 * Format sync timestamp for display
 */
function formatSyncTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return new Date(timestamp).toLocaleString('zh-CN');
}

/**
 * Format next sync time for display
 */
function formatNextSyncTime(timestamp: number): string {
  const diff = timestamp - Date.now();
  if (diff < 0) return '即将进行';
  if (diff < 60000) return `${Math.ceil(diff / 1000)} 秒后`;
  if (diff < 3600000) return `${Math.ceil(diff / 60000)} 分钟后`;
  return `${Math.ceil(diff / 3600000)} 小时后`;
}

export default WebDAVSync;

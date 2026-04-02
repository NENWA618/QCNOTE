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

const SYNC_INTERVALS = [
  { label: '手动只', value: 0 },
  { label: '5分钟', value: 5 * 60 * 1000 },
  { label: '10分钟', value: 10 * 60 * 1000 },
  { label: '30分钟', value: 30 * 60 * 1000 },
  { label: '1小时', value: 60 * 60 * 1000 },
];

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
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  useEffect(() => {
    if (!syncManager) return;

    // Get initial status
    setSyncStatus(syncManager.getStatus());

    // Subscribe to status changes
    const unsubscribe = syncManager.onStatusChange((newStatus) => {
      setSyncStatus(newStatus);
    });

    return unsubscribe;
  }, [syncManager]);

  const handleSave = async () => {
    setLoading(true);
    const result = await onSaveConfig(localConfig);
    setStatus(result ? '✔ 保存成功' : '❌ 保存失败');
    setLoading(false);
    if (result && onConfigChange) {
      onConfigChange(localConfig);
    }
  };

  const handlePush = async () => {
    setLoading(true);
    const result = await onPush(localConfig);
    setStatus(result ? '✔ 上传成功' : '❌ 上传失败');
    setLoading(false);
  };

  const handlePull = async () => {
    setLoading(true);
    const result = await onPull(localConfig);
    setStatus(result ? '✔ 下载并覆盖成功' : '❌ 下载失败或数据错误');
    setLoading(false);
  };

  const handleClear = async () => {
    setLoading(true);
    const result = await onClearConfig();
    if (result) {
      setLocalConfig({ url: '', username: '', password: '', remotePath: 'notes.json' });
      setStatus('✅ 已清除配置');
    } else {
      setStatus('❌ 清除配置失败');
    }
    setLoading(false);
  };

  const handleAutoSyncToggle = (enabled: boolean) => {
    const updated = { ...localConfig, autoSyncEnabled: enabled };
    setLocalConfig(updated);
    if (onConfigChange) {
      onConfigChange(updated);
    }
  };

  const handleSyncIntervalChange = (interval: number) => {
    const updated = { ...localConfig, syncInterval: interval };
    setLocalConfig(updated);
    if (onConfigChange) {
      onConfigChange(updated);
    }
  };

  const handleConflictStrategyChange = (strategy: 'prefer-local' | 'prefer-remote' | 'manual') => {
    const updated = { ...localConfig, conflictStrategy: strategy };
    setLocalConfig(updated);
    if (onConfigChange) {
      onConfigChange(updated);
    }
  };

  const handleSyncNow = async () => {
    if (!syncManager || !localConfig.url) {
      setStatus('❌ 同步管理器未就绪或配置不完整');
      return;
    }

    setLoading(true);
    const result = await syncManager.syncNow(localConfig, 'both');
    setStatus(result ? '✔ 手动同步成功' : '❌ 手动同步失败');
    setLoading(false);
  };

  const StatusIndicator = () => {
    if (!syncStatus) return null;

    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-blue-900">📡 自动同步状态</h3>
          {syncStatus.isRunning && (
            <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              运行中
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-600">上次同步:</span>
            <p className="text-gray-900 font-medium">
              {syncStatus.lastSyncTime
                ? formatSyncTime(syncStatus.lastSyncTime)
                : '未同步'}
            </p>
          </div>

          <div>
            <span className="text-gray-600">同步状态:</span>
            <p className={`font-medium ${
              syncStatus.lastSyncStatus === 'success' ? 'text-green-600' :
              syncStatus.lastSyncStatus === 'failure' ? 'text-red-600' :
              syncStatus.lastSyncStatus === 'pending' ? 'text-yellow-600' :
              'text-gray-600'
            }`}>
              {syncStatus.lastSyncStatus === 'success' && '✔ 成功'}
              {syncStatus.lastSyncStatus === 'failure' && '❌ 失败'}
              {syncStatus.lastSyncStatus === 'pending' && '⏳ 进行中'}
              {syncStatus.lastSyncStatus === 'idle' && '- 未开始'}
            </p>
          </div>

          {syncStatus.lastSyncError && (
            <div className="md:col-span-2">
              <span className="text-gray-600">错误信息:</span>
              <p className="text-red-600 text-xs font-mono">{syncStatus.lastSyncError}</p>
            </div>
          )}

          {syncStatus.nextSyncTime && (
            <div className="md:col-span-2">
              <span className="text-gray-600">下次同步:</span>
              <p className="text-blue-600 text-xs">
                {formatNextSyncTime(syncStatus.nextSyncTime)}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-xl font-bold mb-3">🌐 WebDAV 同步</h2>

      {/* Status Indicator */}
      <StatusIndicator />

      {/* Configuration Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <input
          value={localConfig.url || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, url: e.target.value })}
          placeholder="WebDAV 地址 (https://example.com/remote.php/dav/files/用户/)"
          className="w-full p-2 border rounded"
        />
        <input
          value={localConfig.remotePath || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, remotePath: e.target.value })}
          placeholder="远程文件路径 (notes.json)"
          className="w-full p-2 border rounded"
        />
        <input
          value={localConfig.username || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, username: e.target.value })}
          placeholder="用户名"
          className="w-full p-2 border rounded"
        />
        <input
          type="password"
          value={localConfig.password || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, password: e.target.value })}
          placeholder="密码"
          className="w-full p-2 border rounded"
        />
        <input
          type="password"
          value={localConfig.encryptionKey || ''}
          onChange={(e) => setLocalConfig({ ...localConfig, encryptionKey: e.target.value })}
          placeholder="加密密钥（可选）"
          className="w-full p-2 border rounded"
        />

        {/* Auto-sync settings */}
        <div className="mt-4 p-3 bg-gray-50 rounded">
          <h4 className="font-semibold mb-2">自动同步设置</h4>
          <label className="flex items-center mb-2">
            <input
              type="checkbox"
              checked={localConfig.autoSyncEnabled || false}
              onChange={(e) => setLocalConfig({ ...localConfig, autoSyncEnabled: e.target.checked })}
              className="mr-2"
            />
            启用自动同步
          </label>
          <select
            value={localConfig.syncInterval || 5 * 60 * 1000}
            onChange={(e) => setLocalConfig({ ...localConfig, syncInterval: parseInt(e.target.value) })}
            className="w-full p-2 border rounded"
            disabled={!localConfig.autoSyncEnabled}
          >
            {SYNC_INTERVALS.map((interval) => (
              <option key={interval.value} value={interval.value}>
                {interval.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Basic Actions */}
      <div className="mt-3 flex flex-wrap gap-2 mb-4">
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={loading}
        >
          保存配置
        </button>
        <button
          className="btn-secondary"
          onClick={handlePush}
          disabled={loading || !localConfig.url || !localConfig.remotePath}
        >
          上传至 WebDAV
        </button>
        <button
          className="btn-secondary"
          onClick={handlePull}
          disabled={loading || !localConfig.url || !localConfig.remotePath}
        >
          从 WebDAV 下载
        </button>
        <button
          className="btn-secondary"
          onClick={handleSyncNow}
          disabled={loading || !localConfig.url || !localConfig.remotePath}
        >
          立即同步
        </button>
        <button
          className="btn-danger"
          onClick={handleClear}
          disabled={loading}
        >
          清除配置
        </button>
      </div>

      {/* Auto-Sync Settings */}
      {localConfig.url && (
        <div className="bg-gray-50 rounded-lg p-4 mt-4">
          <h3 className="font-semibold mb-3">⚙️ 自动同步设置</h3>

          {/* Enable Auto-Sync */}
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="autoSync"
              checked={localConfig.autoSyncEnabled || false}
              onChange={(e) => handleAutoSyncToggle(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="autoSync" className="cursor-pointer font-medium">
              启用自动同步
            </label>
          </div>

          {/* Sync Interval */}
          {localConfig.autoSyncEnabled && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">同步间隔</label>
                <select
                  value={localConfig.syncInterval || 0}
                  onChange={(e) => handleSyncIntervalChange(parseInt(e.target.value))}
                  className="w-full p-2 border rounded"
                >
                  {SYNC_INTERVALS.map((interval) => (
                    <option key={interval.value} value={interval.value}>
                      {interval.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conflict Resolution Strategy */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">冲突解决策略</label>
                <select
                  value={localConfig.conflictStrategy || 'manual'}
                  onChange={(e) =>
                    handleConflictStrategyChange(
                      e.target.value as 'prefer-local' | 'prefer-remote' | 'manual'
                    )
                  }
                  className="w-full p-2 border rounded"
                >
                  <option value="manual">手动解决（推荐）</option>
                  <option value="prefer-local">自动采用本地版本</option>
                  <option value="prefer-remote">自动采用远程版本</option>
                </select>
              </div>

              <p className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
                💡 提示：启用自动同步后，系统将按照设定的间隔进行后台同步。如果启用自动冲突解决，冲突将自动按照您的偏好进行处理。
              </p>
            </>
          )}
        </div>
      )}

      <p className="mt-2 text-sm text-gray-500">{status}</p>
      <p className="mt-1 text-xs text-gray-400">
        提示：如果开启加密，每次同步时会自动 AES-GCM 加密/解密，密码请妥善保存。
      </p>
    </div>
  );
};

/**
 * Format sync timestamp for display
 */
function formatSyncTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) {
    return '刚刚';
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} 分钟前`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} 小时前`;
  } else {
    return date.toLocaleString('zh-CN');
  }
}

/**
 * Format next sync time for display
 */
function formatNextSyncTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) {
    return '应该现在';
  } else if (diff < 60000) {
    const seconds = Math.ceil(diff / 1000);
    return `${seconds} 秒后`;
  } else if (diff < 3600000) {
    const minutes = Math.ceil(diff / 60000);
    return `${minutes} 分钟后`;
  } else {
    const hours = Math.ceil(diff / 3600000);
    return `${hours} 小时后`;
  }
}

export default WebDAVSync;

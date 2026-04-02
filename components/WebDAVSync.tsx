import React, { useEffect, useState } from 'react';
import { WebDAVConfig } from '../lib/storage';

interface WebDAVSyncProps {
  config: WebDAVConfig;
  onSaveConfig: (config: WebDAVConfig) => Promise<boolean>;
  onPush: (config: WebDAVConfig) => Promise<boolean>;
  onPull: (config: WebDAVConfig) => Promise<boolean>;
  onClearConfig: () => Promise<boolean>;
}

const WebDAVSync: React.FC<WebDAVSyncProps> = ({
  config,
  onSaveConfig,
  onPush,
  onPull,
  onClearConfig,
}) => {
  const [localConfig, setLocalConfig] = useState<WebDAVConfig>(config);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleSave = async () => {
    setLoading(true);
    const result = await onSaveConfig(localConfig);
    setStatus(result ? '✔ 保存成功' : '❌ 保存失败');
    setLoading(false);
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

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-xl font-bold mb-3">🌐 WebDAV 同步</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
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
          className="btn-danger"
          onClick={handleClear}
          disabled={loading}
        >
          清除配置
        </button>
      </div>
      <p className="mt-2 text-sm text-gray-500">{status}</p>
      <p className="mt-1 text-xs text-gray-400">
        提示：如果开启加密，每次同步时会自动 AES-GCM 加密/解密，密码请妥善保存。
      </p>
    </div>
  );
};

export default WebDAVSync;

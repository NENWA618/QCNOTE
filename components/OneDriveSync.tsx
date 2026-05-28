import React, { useState } from 'react';

interface OneDriveConfig {
  accessToken: string;
  folderPath: string;
  encryptionKey?: string;
}

interface OneDriveSyncProps {
  config: OneDriveConfig;
  configSaved: boolean;
  onSync: () => Promise<void>;
  onSaveConfig: (config: OneDriveConfig) => void;
  onClearConfig: () => void;
}

const OneDriveSync: React.FC<OneDriveSyncProps> = ({
  config,
  configSaved,
  onSync,
  onSaveConfig,
  onClearConfig,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const handleSync = async () => {
    if (!configSaved) {
      setStatusMessage('正在保存配置...');
    } else {
      setStatusMessage('准备同步...');
    }
    setIsSyncing(true);
    try {
      await onSync();
      setLastSyncTime(new Date());
      setStatusMessage('同步成功');
      alert('OneDrive 同步成功！');
    } catch (error) {
      setStatusMessage('同步失败');
      alert('OneDrive 同步失败：' + error);
    }
    setIsSyncing(false);
  };

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">OneDrive 同步</h3>

      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">OneDrive Access Token</label>
          <input
            type="text"
            value={config.accessToken}
            onChange={(e) => onSaveConfig({ ...config, accessToken: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="Access token"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">文件夹路径</label>
          <input
            type="text"
            value={config.folderPath}
            onChange={(e) => onSaveConfig({ ...config, folderPath: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="Notes/notes.json"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">可选 OneDrive 加密密钥</label>
          <input
            type="text"
            value={config.encryptionKey || ''}
            onChange={(e) => onSaveConfig({ ...config, encryptionKey: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="Optional encryption key"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={handleSync}
          disabled={isSyncing || !config.accessToken}
          className="btn-primary disabled:opacity-50"
        >
          {isSyncing ? '同步中...' : configSaved ? '准备同步' : '保存配置并同步'}
        </button>
        <button
          onClick={onClearConfig}
          disabled={isSyncing}
          className="btn-secondary disabled:opacity-50"
          title="清除当前 OneDrive 配置"
        >
          清除配置
        </button>
        <span className={`text-sm ${configSaved ? 'text-green-600' : 'text-yellow-600'}`}>
          {configSaved ? '配置已保存' : '未保存或正在编辑'}
        </span>
      </div>

      <p className="text-sm text-gray-500 mt-2">
        {statusMessage ||
          (configSaved ? '当前配置已保存，准备同步。' : '当前配置未保存，点击后将先保存配置。')}
      </p>

      {lastSyncTime && (
        <p className="text-sm text-gray-600 mt-2">上次同步: {lastSyncTime.toLocaleString()}</p>
      )}
    </div>
  );
};

export default OneDriveSync;

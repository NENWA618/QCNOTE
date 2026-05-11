import React, { useState } from 'react';
import { Client } from '@microsoft/microsoft-graph-client';
import { NoteItem } from '../lib/storage';

interface OneDriveConfig {
  clientId: string;
  tenantId: string;
  accessToken: string;
  folderPath: string;
}

interface OneDriveSyncProps {
  config: OneDriveConfig;
  onSync: () => Promise<void>;
  onSaveConfig: (config: OneDriveConfig) => void;
}

const OneDriveSync: React.FC<OneDriveSyncProps> = ({
  config,
  onSync,
  onSaveConfig
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const client = Client.init({
        authProvider: (done) => {
          done(null, config.accessToken);
        }
      });

      // Get notes from OneDrive
      const response = await client
        .api(`/me/drive/root:/${config.folderPath}/notes.json:/content`)
        .get();

      const remoteNotes: NoteItem[] = JSON.parse(response);

      // Compare and merge with local notes
      await onSync();

      setLastSyncTime(new Date());
      alert('OneDrive 同步成功！');
    } catch (error) {
      alert('OneDrive 同步失败：' + error);
    }
    setIsSyncing(false);
  };

  const handleAuth = () => {
    // Redirect to Microsoft OAuth
    const authUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?` +
      `client_id=${config.clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(window.location.origin)}&` +
      `scope=Files.ReadWrite.All`;

    window.location.href = authUrl;
  };

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-4">OneDrive 同步</h3>

      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">Client ID</label>
          <input
            type="text"
            value={config.clientId}
            onChange={(e) => onSaveConfig({ ...config, clientId: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="Azure App Client ID"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tenant ID</label>
          <input
            type="text"
            value={config.tenantId}
            onChange={(e) => onSaveConfig({ ...config, tenantId: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="Azure Tenant ID"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">文件夹路径</label>
          <input
            type="text"
            value={config.folderPath}
            onChange={(e) => onSaveConfig({ ...config, folderPath: e.target.value })}
            className="w-full p-2 border rounded"
            placeholder="Notes"
          />
        </div>
      </div>

      <div className="flex gap-2">
        {!config.accessToken ? (
          <button
            onClick={handleAuth}
            className="btn-primary"
          >
            授权 OneDrive
          </button>
        ) : (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="btn-primary disabled:opacity-50"
          >
            {isSyncing ? '同步中...' : '同步到 OneDrive'}
          </button>
        )}
      </div>

      {lastSyncTime && (
        <p className="text-sm text-gray-600 mt-2">
          上次同步: {lastSyncTime.toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default OneDriveSync;
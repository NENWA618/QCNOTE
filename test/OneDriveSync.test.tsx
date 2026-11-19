import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import OneDriveSync from '../components/OneDriveSync';

const config = { accessToken: 'test-token', folderPath: 'Notes/notes.json', encryptionKey: '' };

describe('OneDriveSync', () => {
  it('re-enables the buttons and shows the error when the sync throws', async () => {
    render(
      <OneDriveSync
        config={config}
        configSaved
        onSync={vi.fn(async () => {
          throw new Error('存储已锁定');
        })}
        onSaveConfig={vi.fn(async () => true)}
        onClearConfig={vi.fn(async () => true)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '⇅ 立即同步' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('存储已锁定');
    expect(screen.getByRole('button', { name: '⇅ 立即同步' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '清除配置' })).toBeEnabled();
  });

  it('reports a failed sync result', async () => {
    render(
      <OneDriveSync
        config={config}
        configSaved
        onSync={vi.fn(async () => ({ ok: false as const, error: '远程文件无法解析' }))}
        onSaveConfig={vi.fn(async () => true)}
        onClearConfig={vi.fn(async () => true)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '⇅ 立即同步' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('远程文件无法解析');
    expect(screen.queryByText(/本次打开后上次同步/)).not.toBeInTheDocument();
  });
});

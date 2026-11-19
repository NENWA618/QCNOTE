import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import PushNotificationManager from '../components/PushNotificationManager';

vi.mock('axios');

async function sendWithResult(result: { success: number; failed: number }) {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true, result } });
  const onSent = vi.fn();
  render(<PushNotificationManager onNotificationSent={onSent} />);
  await userEvent.type(screen.getByPlaceholderText('例如：新功能发布 或 系统维护通知'), '维护通知');
  await userEvent.click(screen.getByRole('button', { name: '📤 发送通知' }));
  return onSent;
}

describe('PushNotificationManager', () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it('warns and keeps the form when nobody is subscribed', async () => {
    const onSent = await sendWithResult({ success: 0, failed: 0 });
    expect(await screen.findByText('⚠️ 当前没有任何订阅，通知未发送')).toBeInTheDocument();
    expect(screen.queryByText(/推送已发送/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('例如：新功能发布 或 系统维护通知')).toHaveValue('维护通知');
    expect(onSent).not.toHaveBeenCalled();
  });

  it('reports the counts when the notification went out', async () => {
    const onSent = await sendWithResult({ success: 1, failed: 1 });
    expect(await screen.findByText(/推送已发送/)).toHaveTextContent('成功: 1/2');
    expect(onSent).toHaveBeenCalled();
  });
});

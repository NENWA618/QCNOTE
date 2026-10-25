import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PushNotificationSettings from '../components/PushNotificationSettings';
import * as push from '../lib/pushNotification';

vi.mock('../lib/pushNotification', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/pushNotification')>()),
  isPushAvailable: vi.fn(),
  isPushSubscribed: vi.fn(),
  subscribeToPushNotifications: vi.fn(),
  unsubscribeFromPushNotifications: vi.fn(),
}));

function setPermission(permission: NotificationPermission) {
  vi.stubGlobal('Notification', { permission });
}

describe('PushNotificationSettings', () => {
  beforeEach(() => {
    vi.mocked(push.isPushAvailable).mockReturnValue(true);
    vi.mocked(push.isPushSubscribed).mockResolvedValue(false);
    setPermission('default');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('offers to subscribe when this device is not subscribed', async () => {
    vi.mocked(push.subscribeToPushNotifications).mockResolvedValue('ok');
    render(<PushNotificationSettings />);

    await userEvent.click(await screen.findByRole('button', { name: '订阅通知' }));

    expect(push.subscribeToPushNotifications).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: '取消订阅' })).toBeInTheDocument();
    expect(screen.getByText(/已订阅/)).toBeInTheDocument();
  });

  it('lets a subscribed device unsubscribe', async () => {
    vi.mocked(push.isPushSubscribed).mockResolvedValue(true);
    vi.mocked(push.unsubscribeFromPushNotifications).mockResolvedValue(true);
    render(<PushNotificationSettings />);

    await userEvent.click(await screen.findByRole('button', { name: '取消订阅' }));

    expect(push.unsubscribeFromPushNotifications).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: '订阅通知' })).toBeInTheDocument();
  });

  it('shows why a subscription failed and keeps the button', async () => {
    vi.mocked(push.subscribeToPushNotifications).mockResolvedValue('unauthorized');
    render(<PushNotificationSettings />);

    await userEvent.click(await screen.findByRole('button', { name: '订阅通知' }));

    expect(
      await screen.findByText(push.PUSH_SUBSCRIBE_ERROR_MESSAGES.unauthorized),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '订阅通知' })).toBeInTheDocument();
  });

  it('explains how to re-enable notifications once the permission is blocked', () => {
    setPermission('denied');
    render(<PushNotificationSettings />);

    expect(screen.getByText(/浏览器已禁止本站发送通知/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides the controls when push is unavailable', () => {
    vi.mocked(push.isPushAvailable).mockReturnValue(false);
    render(<PushNotificationSettings />);

    expect(screen.getByText(/不支持推送通知/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(push.isPushSubscribed).not.toHaveBeenCalled();
  });
});

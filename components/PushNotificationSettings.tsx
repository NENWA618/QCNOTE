import React, { useEffect, useState } from 'react';
import {
  PUSH_SUBSCRIBE_ERROR_MESSAGES,
  isPushAvailable,
  isPushSubscribed,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '../lib/pushNotification';

type PushState = 'checking' | 'unavailable' | 'denied' | 'subscribed' | 'unsubscribed';

const DENIED_MESSAGE =
  '浏览器已禁止本站发送通知。请在浏览器地址栏左侧的网站设置里允许“通知”，然后刷新页面再订阅。';

function initialState(): PushState {
  if (!isPushAvailable()) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  return 'checking';
}

/**
 * 个人资料页里的推送通知开关。右下角的订阅提示只弹一次，错过后可以在这里订阅或取消。
 * 订阅属于当前浏览器（设备），不是账号：换一台设备需要再订阅一次。
 */
const PushNotificationSettings: React.FC = () => {
  const [state, setState] = useState<PushState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state !== 'checking') return;
    let cancelled = false;
    isPushSubscribed().then((subscribed) => {
      if (!cancelled) setState(subscribed ? 'subscribed' : 'unsubscribed');
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  const handleSubscribe = async () => {
    setBusy(true);
    setError(null);
    const result = await subscribeToPushNotifications();
    setBusy(false);
    if (result === 'ok') {
      setState('subscribed');
    } else if (result === 'denied') {
      // 'default'：用户只是关掉了权限弹窗，下次还能再问
      if (Notification.permission === 'denied') setState('denied');
      else setError('需要允许通知权限才能订阅。');
    } else {
      setError(PUSH_SUBSCRIBE_ERROR_MESSAGES[result]);
    }
  };

  const handleUnsubscribe = async () => {
    setBusy(true);
    setError(null);
    const ok = await unsubscribeFromPushNotifications();
    setBusy(false);
    if (ok) setState('unsubscribed');
    else setError('取消订阅失败，请稍后重试。');
  };

  const description: Record<PushState, string> = {
    checking: '正在检查订阅状态…',
    unavailable: '当前浏览器不支持推送通知，或服务端尚未配置推送。',
    denied: DENIED_MESSAGE,
    subscribed: '已订阅：这台设备会收到官方消息和更新通知。',
    unsubscribed: '订阅后，这台设备会收到官方消息和更新通知。',
  };

  return (
    <section className="bg-white/95 dark:bg-dark-surface rounded-2xl border border-primary-light/40 dark:border-dark-border p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink dark:text-dark-text mb-1">推送通知</h2>
          <p className="text-sm text-text-light">{description[state]}</p>
        </div>
        {state === 'unsubscribed' && (
          <button className="btn btn-primary shrink-0" disabled={busy} onClick={handleSubscribe}>
            {busy ? '处理中...' : '订阅通知'}
          </button>
        )}
        {state === 'subscribed' && (
          <button
            className="btn btn-secondary shrink-0"
            disabled={busy}
            onClick={handleUnsubscribe}
          >
            {busy ? '处理中...' : '取消订阅'}
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 p-3 rounded-xl text-sm bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}
    </section>
  );
};

export default PushNotificationSettings;

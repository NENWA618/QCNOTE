import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  subscribeToPushNotifications,
  isPushSubscribed,
  isPushAvailable,
  syncPushSubscription,
  PUSH_SUBSCRIBE_ERROR_MESSAGES,
} from '../lib/pushNotification';

interface PushNotificationPromptProps {
  onSubscribed?: () => void;
}

const PushNotificationPrompt: React.FC<PushNotificationPromptProps> = ({ onSubscribed }) => {
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { status } = useSession();

  useEffect(() => {
    // 订阅接口需要登录：访客点了也只会被 401 拒绝，所以只对已登录用户展示
    if (status !== 'authenticated') return;
    let cancelled = false;
    (async () => {
      // 不支持推送、没配置 VAPID 公钥或用户已拒绝权限时，订阅不可能成功，不展示入口
      if (!isPushAvailable() || Notification.permission === 'denied') return;
      const subscribed = await isPushSubscribed();
      if (cancelled) return;
      setIsSubscribed(subscribed);
      if (subscribed) void syncPushSubscription();

      // Show prompt if not subscribed yet (on first visit)
      const hasSeenPrompt = localStorage.getItem('push-prompt-seen');
      if (!hasSeenPrompt && !subscribed) {
        setShowPrompt(true);
        localStorage.setItem('push-prompt-seen', 'true');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleSubscribe = async () => {
    setIsLoading(true);
    setError(null);
    const result = await subscribeToPushNotifications();
    setIsLoading(false);

    if (result === 'ok') {
      setIsSubscribed(true);
      setShowPrompt(false);
      onSubscribed?.();
    } else if (result === 'denied') {
      // 用户拒绝了权限，不会再成功，直接收起
      setShowPrompt(false);
    } else {
      setError(PUSH_SUBSCRIBE_ERROR_MESSAGES[result]);
    }
  };

  if (!showPrompt && isSubscribed) {
    return null;
  }

  if (!showPrompt && !isSubscribed) {
    // Render unsubscribed state only if user accessed settings
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 max-w-sm p-4 bg-white dark:bg-dark-surface rounded-lg shadow-lg border border-gray-200 dark:border-dark-border z-50"
      role="alert"
    >
      <div className="flex gap-3 items-start">
        <div className="flex-1">
          <h3 className="font-bold text-sm text-ink dark:text-dark-text">🔔 订阅通知</h3>
          <p className="text-xs text-text-light dark:text-dark-text-secondary mt-1">
            订阅我们的推送通知，获取最新的官方消息和更新通知。
          </p>
          {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSubscribe}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-medium bg-accent-pink dark:bg-accent-pink text-white rounded hover:bg-pink-600 dark:hover:bg-pink-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? '处理中...' : '订阅'}
            </button>
            <button
              onClick={() => setShowPrompt(false)}
              className="px-3 py-1.5 text-xs font-medium bg-gray-200 dark:bg-dark-surface-light text-gray-700 dark:text-dark-text rounded hover:bg-gray-300 dark:hover:bg-dark-border transition-colors"
            >
              稍后
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowPrompt(false)}
          aria-label="关闭"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default PushNotificationPrompt;

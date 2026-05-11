import React, { useState, useEffect } from 'react';
import { subscribeToPushNotifications, unsubscribeFromPushNotifications, isPushSubscribed } from '../lib/pushNotification';

interface PushNotificationPromptProps {
  onSubscribed?: () => void;
  onUnsubscribed?: () => void;
}

const PushNotificationPrompt: React.FC<PushNotificationPromptProps> = ({ onSubscribed, onUnsubscribed }) => {
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);

  useEffect(() => {
    checkSubscriptionStatus();
  }, []);

  const checkSubscriptionStatus = async () => {
    const subscribed = await isPushSubscribed();
    setIsSubscribed(subscribed);

    // Show prompt if not subscribed yet (on first visit)
    const hasSeenPrompt = localStorage.getItem('push-prompt-seen');
    if (!hasSeenPrompt && !subscribed) {
      setShowPrompt(true);
      localStorage.setItem('push-prompt-seen', 'true');
    }
  };

  const handleSubscribe = async () => {
    setIsLoading(true);
    const success = await subscribeToPushNotifications();
    setIsLoading(false);

    if (success) {
      setIsSubscribed(true);
      setShowPrompt(false);
      onSubscribed?.();
    }
  };

  const handleUnsubscribe = async () => {
    setIsLoading(true);
    const success = await unsubscribeFromPushNotifications();
    setIsLoading(false);

    if (success) {
      setIsSubscribed(false);
      onUnsubscribed?.();
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
      className="fixed bottom-4 right-4 max-w-sm p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
      role="alert"
    >
      <div className="flex gap-3 items-start">
        <div className="flex-1">
          <h3 className="font-bold text-sm text-primary-dark dark:text-white">
            🔔 订阅通知
          </h3>
          <p className="text-xs text-text-light dark:text-gray-300 mt-1">
            订阅我们的推送通知，获取最新的官方消息和更新提醒。
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSubscribe}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-medium bg-accent-pink text-white rounded hover:bg-pink-600 disabled:opacity-50 transition-colors"
            >
              {isLoading ? '处理中...' : '订阅'}
            </button>
            <button
              onClick={() => {
                setShowPrompt(false);
                localStorage.setItem('push-prompt-dismissed', 'true');
              }}
              className="px-3 py-1.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              稍后
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowPrompt(false)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default PushNotificationPrompt;

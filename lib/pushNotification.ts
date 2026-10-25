/**
 * Web Push Notification utilities
 * Handles subscription and push notification management
 */

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export type PushSubscribeResult =
  'ok' | 'unsupported' | 'denied' | 'not-configured' | 'unauthorized' | 'failed';

/** 订阅失败时给用户看的说明（'denied' 由各入口自行处理）。 */
export const PUSH_SUBSCRIBE_ERROR_MESSAGES: Record<
  Exclude<PushSubscribeResult, 'ok' | 'denied'>,
  string
> = {
  unsupported: '当前浏览器不支持推送通知。',
  unauthorized: '登录状态已失效，请重新登录后再订阅。',
  'not-configured': '服务端尚未配置推送，暂时无法订阅。',
  failed: '订阅失败，请稍后重试。',
};

/**
 * 是否具备订阅推送的前提：浏览器支持、且部署时配置了 VAPID 公钥。
 * NEXT_PUBLIC_* 在构建时内联，缺失时订阅一定会失败，不应向用户展示订阅入口。
 */
export function isPushAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC);
}

/**
 * Request and subscribe user to push notifications
 */
export async function subscribeToPushNotifications(): Promise<PushSubscribeResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported in this browser');
    return 'unsupported';
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC;
  if (!publicKey) {
    console.error('NEXT_PUBLIC_VAPID_PUBLIC not configured');
    return 'not-configured';
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      console.log('Push notification permission denied');
      return 'denied';
    }

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();
    const createdHere = !subscription;
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const response = await saveSubscription(subscription);

    if (!response.ok) {
      // 服务端没保存成功就不要留下浏览器端的孤儿订阅，否则下次进入会被误判为已订阅
      if (createdHere) await subscription.unsubscribe().catch(() => {});
      if (response.status === 401) return 'unauthorized';
      throw new Error(`Failed to save subscription: ${response.statusText}`);
    }

    return 'ok';
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return 'failed';
  }
}

/**
 * Unsubscribe user from push notifications
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Notify backend to remove subscription
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {
        // Continue even if backend call fails
      });

      await subscription.unsubscribe();
    }

    return true;
  } catch (error) {
    console.error('Failed to unsubscribe from push notifications:', error);
    return false;
  }
}

/**
 * 把浏览器里已有的订阅再交给服务端一次（服务端按端点 upsert，重复调用无害）。
 * 浏览器轮换了订阅、同一浏览器换了账号登录、或之前保存失败时，服务端的记录
 * 会过期或归错人；已登录用户每次打开应用时调用，把它补回来。
 */
export async function syncPushSubscription(): Promise<void> {
  if (!isPushAvailable() || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await saveSubscription(subscription);
  } catch (error) {
    console.warn('Failed to resync push subscription:', error);
  }
}

/** Sends a subscription to the backend (requires a signed-in user). */
function saveSubscription(subscription: PushSubscription): Promise<Response> {
  return fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
}

/**
 * Check if user is already subscribed
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch (error) {
    console.error('Failed to check push subscription:', error);
    return false;
  }
}

/**
 * Convert VAPID public key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/service-worker.js');
    return reg;
  } catch (e) {
    console.warn('Service worker register failed', e);
    return null;
  }
}

export async function subscribeForPush() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: false, message: 'unsupported' };
  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, message: 'sw-failed' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, message: 'denied' };
  const vapidKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC as string) || '';
  const converted = urlBase64ToUint8Array(vapidKey);
  try {
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: converted });
    // send to server
    await fetch((process.env.NEXT_PUBLIC_CHARACTER_SERVER_URL || '') + '/push/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub)
    });
    return { ok: true };
  } catch (e) {
    // TypeScript can't assume `message` exists on unknown
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

function urlBase64ToUint8Array(base64String: string) {
  if (!base64String) return new Uint8Array();
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

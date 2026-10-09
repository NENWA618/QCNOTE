// 缓存策略（只处理同源 GET）：
//   /_next/static/*   带内容哈希，cache-first
//   页面导航           network-first，离线时回退到上次缓存的页面，再回退到 /offline.html
//   /images/*、图标    stale-while-revalidate
// 不缓存 /api/（含登录、同步、推送）、/admin、/signin 和 /u/（用户公开页，内容随时变化）。
// 笔记数据本身在 IndexedDB 里，不经过 Service Worker。
// 改动缓存策略时递增 CACHE_VERSION，旧缓存会在 activate 时清除。
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `qcnote-static-${CACHE_VERSION}`;
const PAGE_CACHE = `qcnote-pages-${CACHE_VERSION}`;
const IMAGE_CACHE = `qcnote-images-${CACHE_VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE, PAGE_CACHE, IMAGE_CACHE];
const OFFLINE_URL = '/offline.html';
const NO_CACHE_PREFIXES = ['/api/', '/admin', '/signin', '/u/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('qcnote-') && !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheable(response) {
  return response && response.ok && response.type === 'basic' && !response.redirected;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (isCacheable(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) cache.put(request, response.clone());
    return response;
  } catch {
    // 忽略查询串匹配，/dashboard?x=1 离线时也能用 /dashboard 的缓存
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match(OFFLINE_URL)) ||
      Response.error()
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NO_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else if (url.pathname.startsWith('/images/')) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
  }
});

self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: '提醒', body: '你有一个提醒' };
  }
  const title = data.title || '提醒';
  const options = {
    body: data.body || '',
    data: data.data || {},
    tag: data.data && data.data.reminderId ? `reminder-${data.data.reminderId}` : undefined,
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});

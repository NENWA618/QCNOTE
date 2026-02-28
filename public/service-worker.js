self.addEventListener('push', function(event) {
  let data = {};
  try { data = event.data.json(); } catch (e) { data = { title: '提醒', body: '你有一个提醒' }; }
  const title = data.title || '提醒';
  const options = {
    body: data.body || '',
    data: data.data || {},
    tag: data.data && data.data.reminderId ? `reminder-${data.data.reminderId}` : undefined,
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = '/dashboard';
  event.waitUntil(clients.matchAll({ type: 'window' }).then(windowClients => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url.includes(url) && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});

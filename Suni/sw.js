/* Push runs independently of any open page. No timer-based fake scheduling. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data;
  try { data = event.data.json(); } catch { return; }
  event.waitUntil(self.registration.showNotification(data.title || 'Suni', {
    body: data.body,
    tag: data.tag,
    icon: '/assets/app-icon-192.png',
    data: { url: '/' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.focus();
    return self.clients.openWindow('/');
  })());
});

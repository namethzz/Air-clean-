/* AirClean service worker: shows push notifications and opens the right page when one is tapped. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'AirClean';
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      lang: 'th',
      data: { url: data.url || '/' },
    });
    // Let open tabs refresh their bell right away.
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    tabs.forEach(tab => tab.postMessage({ type: 'airclean-notification' }));
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find(item => new URL(item.url).origin === target.origin);
    if (tab) {
      await tab.focus();
      tab.postMessage({ type: 'airclean-open', url: target.href });
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});

// Service worker Fix Merah: menampilkan notifikasi sistem (panel notifikasi HP) dari Web Push.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Pengumuman';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/badge.png',
      tag: d.tag || 'fm-announcement',
      renotify: true,
      requireInteraction: false,
      vibrate: [120, 60, 120],
      timestamp: d.ts || Date.now(),
      data: { url: d.url || '/menu' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/menu', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin) && 'focus' in c) {
        try { if ('navigate' in c) await c.navigate(url); } catch {}
        await c.focus(); return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

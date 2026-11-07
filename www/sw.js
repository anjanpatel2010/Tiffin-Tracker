const CACHE_NAME = 'tiffin-tracker-v5.6.0';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=5.6.0',
  './app.js?v=5.6.0',
  './qr.js?v=5.6.0',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(err => {
      console.warn('Cache addAll warning:', err);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Native Web Push Notification Event (Handles incoming alerts even when app/browser is closed)
self.addEventListener('push', (event) => {
  let payload = { title: 'Tiffin Tracker 🍲', body: 'New meal update from flatmates!' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  const title = payload.title || 'Tiffin Tracker 🍲';
  const options = {
    body: payload.body || payload.message || 'Tap to view meal updates.',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: payload.tag || 'tiffin-alert',
    renotify: true,
    data: { url: payload.click || payload.url || './#view-logger' }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Native Notification Click Handler (Brings PWA / browser window to foreground)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './#view-logger';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.focus();
          if ('postMessage' in client) {
            client.postMessage({ type: 'NAVIGATE_TAB', tab: 'logger' });
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Network-First for root, HTML, JS, CSS so latest UI updates load instantly without stale cache
  const isCoreAsset = e.request.mode === 'navigate' ||
                      e.request.destination === 'document' ||
                      url.pathname === '/' ||
                      url.pathname.endsWith('/') ||
                      url.pathname.includes('.html') ||
                      url.pathname.includes('.js') ||
                      url.pathname.includes('.css');

  if (isCoreAsset) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(e.request).then((cached) => {
            if (cached) return cached;
            if (e.request.mode === 'navigate' || e.request.destination === 'document') {
              return caches.match('./index.html');
            }
            return new Response('', { status: 404, statusText: 'Not Found' });
          });
        })
    );
    return;
  }

  // Cache-First for static media assets (icons, manifest)
  e.respondWith(
    caches.match(e.request).then((cachedRes) => {
      if (cachedRes) return cachedRes;
      return fetch(e.request).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkRes;
      });
    })
  );
});

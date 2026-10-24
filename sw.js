const CACHE_NAME = 'tiffin-tracker-v5.0.0';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=5.0.0',
  './app.js?v=5.0.0',
  './qr.js?v=5.0.0',
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

// Background Poll Reminder Dispatcher in Service Worker
let swReminderInterval = null;
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'START_POLL_REMINDER') {
    const { pollId, mealSlot, options, day } = event.data;
    if (swReminderInterval) clearInterval(swReminderInterval);
    // Every 5 minutes (300,000 ms), push phone notification reminder
    swReminderInterval = setInterval(() => {
      self.registration.showNotification(`Poll Reminder`, {
        body: `Please cast your vote for ${mealSlot || 'meal'}.`,
        icon: './icon.svg',
        badge: './icon.svg',
        tag: 'poll-reminder-' + pollId,
        renotify: true,
        vibrate: [300, 150, 300],
        data: { url: './#view-poll' }
      });
    }, 5 * 60 * 1000);
  } else if (event.data.type === 'STOP_POLL_REMINDER') {
    if (swReminderInterval) {
      clearInterval(swReminderInterval);
      swReminderInterval = null;
    }
  }
});

// Native Notification Click Handler (Brings PWA / browser window to foreground)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './#view-poll';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.focus();
          if ('postMessage' in client) {
            client.postMessage({ type: 'NAVIGATE_TAB', tab: 'poll' });
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

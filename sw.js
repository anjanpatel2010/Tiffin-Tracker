const CACHE_NAME = 'tiffin-tracker-v2.2';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=2.2',
  './app.js?v=2.2',
  './qr.js?v=2.2',
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
            console.log('Purging old cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Network-First for core navigation and code (HTML, JS, CSS) so updates appear immediately
  const isCoreAsset = e.request.mode === 'navigate' ||
                      e.request.destination === 'document' ||
                      url.pathname.endsWith('.html') ||
                      url.pathname.endsWith('.js') ||
                      url.pathname.endsWith('.css');

  if (isCoreAsset) {
    e.respondWith(
      fetch(e.request)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(e.request).then((cached) => cached || caches.match('./index.html'));
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

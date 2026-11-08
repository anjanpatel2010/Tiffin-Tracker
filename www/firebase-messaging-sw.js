/**
 * Firebase Cloud Messaging Service Worker for Tiffin Tracker
 * Handles incoming push notifications when the web app/PWA is closed or running in background.
 */

// Import Firebase compat scripts for Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCWFma4diWKudEBVPT4D4nQAxfo0L2CtGs",
  authDomain: "tiffin-tracker-a91db.firebaseapp.com",
  projectId: "tiffin-tracker-a91db",
  storageBucket: "tiffin-tracker-a91db.firebasestorage.app",
  messagingSenderId: "805212210681",
  appId: "1:805212210681:web:6cb8e12767a4a04d3d2928"
});

const messaging = firebase.messaging();

// 1. Firebase onBackgroundMessage handler
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received FCM background message:', payload);
  const title = (payload.notification && payload.notification.title) ||
                (payload.data && payload.data.title) ||
                'Tiffin Tracker 🍲';

  const body = (payload.notification && payload.notification.body) ||
               (payload.data && (payload.data.body || payload.data.message)) ||
               'New meal or room update in your flat mess!';

  const notificationOptions = {
    body: body,
    icon: './icon.svg',
    badge: './icon.svg',
    tag: (payload.data && payload.data.tag) || 'tiffin-alert',
    renotify: true,
    vibrate: [200, 100, 200],
    data: payload.data || { url: './#view-logger' }
  };

  self.registration.showNotification(title, notificationOptions);
});

// 2. Native Web Push Event Handler (Universal fallback for all browsers)
self.addEventListener('push', (event) => {
  let title = 'Tiffin Tracker 🍲';
  let body = 'New meal update from flatmates!';
  let data = { url: './#view-logger' };
  let tag = 'tiffin-alert';

  if (event.data) {
    try {
      const json = event.data.json();
      title = (json.notification && json.notification.title) || json.title || title;
      body = (json.notification && json.notification.body) || json.body || json.message || body;
      data = json.data || json;
      if (json.tag) tag = json.tag;
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  const options = {
    body: body,
    icon: './icon.svg',
    badge: './icon.svg',
    tag: tag,
    renotify: true,
    vibrate: [200, 100, 200],
    data: data
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 3. User clicked the notification
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

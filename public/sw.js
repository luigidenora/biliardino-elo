
/* eslint-disable @typescript-eslint/explicit-function-return-type */
const VERSION = '0.0.3';
const CACHE_NAME = 'CAlcio-Balilla-cache';

// Firebase/API endpoints che vogliamo cachare
const FIREBASE_PATTERN = /firebase|\.firebaseapp\.com|firestore\.googleapis\.com/i;

self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing version ${VERSION}`);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Activating version ${VERSION}`);
  event.waitUntil(clients.claim());
});

/**
 * Listens for messages from clients.
 * Handles GET_VERSION to send the current SW version.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    console.log('[Service Worker] Sending version:', VERSION);
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: 'SW_VERSION', version: VERSION });
    }
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Cross-origin: passa direttamente al network
  if (url.origin !== self.location.origin) {
    return;
  }

  // Firebase/API calls: cache-first (sempre disponibili offline)
  if (FIREBASE_PATTERN.test(url.href)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => new Response(JSON.stringify({ error: 'offline' }), { status: 503 }));
      })
    );
    return;
  }

  // Tutto il resto: network-first (sempre aggiornato)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request)
          .then(cached => cached || new Response('Offline', { status: 503 }))
      )
  );
});


self.addEventListener('push', async (event) => {
  let title, options;
  try {
    ({ notification } = event.data?.json());
    options = notification || {};
    title = notification.title;
  } catch (exception) {
    console.error('[push event] Error parsing push event data:', exception);
  }

  try {
    await self.registration.showNotification(title, { ...options, data: { navigate: notification?.navigate } });
  } catch (exception) {
    console.error('[push event] Error showing notification:', exception);
  }

});

self.addEventListener('notificationclick', (event) => {
  if (!event.action) {
    clients.openWindow(event.notification.data?.navigate || '/');
    return;
  }
  if (event.action === 'cancel') {
    // ignora l'azione e chiudi la notifica
    event.notification.close();
    return;
  }
  clients.openWindow(event.action.url || '/');
});
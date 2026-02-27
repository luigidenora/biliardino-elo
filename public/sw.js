/* eslint-disable @typescript-eslint/explicit-function-return-type */
const VERSION = '0.3.0';
const CACHE_PREFIX = 'calcio-bliliardino';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${VERSION}`;
const DATA_CACHE = `${CACHE_PREFIX}-data-${VERSION}`;
const APP_SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png'];

// Firebase/API endpoints che vogliamo cachare
const FIREBASE_PATTERN = /firebase|\.firebaseapp\.com|firestore\.googleapis\.com/i;

self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing version ${VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Activating version ${VERSION}`);
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }

    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter(cacheName => cacheName.startsWith(CACHE_PREFIX) && cacheName !== STATIC_CACHE && cacheName !== DATA_CACHE)
        .map(cacheName => caches.delete(cacheName))
    );

    await clients.claim();
  })());
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

  // App-shell per navigazioni: mai pagina bianca, anche offline
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event));
    return;
  }

  const url = new URL(request.url);

  // Firebase/API calls: stale-while-revalidate
  if (FIREBASE_PATTERN.test(url.href)) {
    event.respondWith(handleFirebaseRequest(request));
    return;
  }

  // Cross-origin: passa direttamente al network
  if (url.origin !== self.location.origin) {
    return;
  }

  // Asset statici app: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || new Response('Offline', { status: 503 }));

      return cached || networkPromise;
    })
  );
});

async function handleNavigationRequest(event) {
  try {
    const preloadResponse = await event.preloadResponse;
    if (preloadResponse) {
      const copy = preloadResponse.clone();
      caches.open(STATIC_CACHE).then(cache => cache.put('/index.html', copy));
      return preloadResponse;
    }

    const networkResponse = await fetch(event.request);
    if (networkResponse.ok) {
      const copy = networkResponse.clone();
      caches.open(STATIC_CACHE).then(cache => cache.put('/index.html', copy));
    }
    return networkResponse;
  } catch {
    const cachedShell = await caches.match('/index.html');
    if (cachedShell) return cachedShell;
    return new Response(`<!doctype html><html lang="it"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>CAlcio bliliardino</title><style>html,body{margin:0;min-height:100%;background:#0F2A20;color:#fff;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}.sw-splash{min-height:100vh;display:flex;align-items:center;justify-content:center;opacity:.9;letter-spacing:.08em;font-size:12px}</style></head><body><div class="sw-splash">CARICAMENTO…</div></body></html>`, {
      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      status: 200
    });
  }
}

async function handleFirebaseRequest(request) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(DATA_CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => cached || new Response(JSON.stringify({ error: 'offline' }), { status: 503 }));

  return cached || networkPromise;
}

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
    if (options.tag) { // Questo dovrebbe prevenire le notifiche del aggiornamento del service worker e mostrare solo quelle definite dall'app
      await self.registration.showNotification(title, { ...options, data: { navigate: notification?.navigate } });
    }
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

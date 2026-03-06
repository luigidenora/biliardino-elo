/* eslint-disable @typescript-eslint/explicit-function-return-type */
try {
  importScripts('/sw-version.js');
} catch {
  // Fallback for environments where the generated version file is unavailable.
}

const VERSION = self.__SW_VERSION__ || '0.0.0-dev';
const CACHE_PREFIX = 'calcio-biliardino';
// Will be updated by client messages when the firebase key/version changes (e.g. when adding a match)
let FIREBASE_CACHE_KEY = 'initial';
const STATIC_CACHE = () => `${CACHE_PREFIX}-static-${VERSION}-${FIREBASE_CACHE_KEY}`;
const DATA_CACHE = () => `${CACHE_PREFIX}-data-${VERSION}-${FIREBASE_CACHE_KEY}`;
const APP_SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icons/manifest-icon-192.maskable.png'];

// Firebase/API endpoints che vogliamo cachare
const FIREBASE_PATTERN = /firebase|\.firebaseapp\.com|firestore\.googleapis\.com/i;

self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing version ${VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE()).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS).catch((err) => {
        if (err && err.name === 'InvalidAccessError') {
          // Ignore duplicate entry error
          console.warn('[Service Worker] Cache addAll: Entry already exists, ignoring.');
        } else {
          throw err;
        }
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Activating version ${VERSION}`);
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }

    const currentStatic = STATIC_CACHE();
    const currentData = DATA_CACHE();
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter(cacheName => cacheName.startsWith(CACHE_PREFIX) && cacheName !== currentStatic && cacheName !== currentData)
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
  if (!event.data || !event.data.type) return;

  // Return SW version
  if (event.data.type === 'GET_VERSION') {
    console.log('[Service Worker] Sending version:', VERSION);
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: 'SW_VERSION', version: VERSION });
    }
    return;
  }

  // Set the firebase cache key (frontend should send this when a match is added)
  if (event.data.type === 'SET_FIREBASE_CACHE_KEY' && typeof event.data.key === 'string') {
    console.log('[Service Worker] Received new firebase cache key:', event.data.key);
    // update cache key, prefill new static shell and delete old caches
    setFirebaseCacheKey(event.data.key).catch(err => console.error('[Service Worker] setFirebaseCacheKey error:', err));
    return;
  }

  // Allow older clients to query current cache key
  if (event.data.type === 'GET_FIREBASE_CACHE_KEY') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: 'FIREBASE_CACHE_KEY', key: FIREBASE_CACHE_KEY });
    }
    return;
  }
});

async function setFirebaseCacheKey(key) {
  FIREBASE_CACHE_KEY = key || 'initial';
  const staticName = STATIC_CACHE();
  const dataName = DATA_CACHE();

  try {
    // Pre-cache app shell into the new static cache
    const cache = await caches.open(staticName);
    await cache.addAll(APP_SHELL_ASSETS).catch((err) => {
      if (err && err.name === 'InvalidAccessError') {
        console.warn('[Service Worker] Cache addAll (set key): Entry already exists, ignoring.');
      } else {
        console.error('[Service Worker] Cache addAll (set key) error:', err);
      }
    });
  } catch (err) {
    console.error('[Service Worker] Error opening/priming cache for new key:', err);
  }

  // Remove old caches that don't match the new key
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== staticName && k !== dataName).map(k => caches.delete(k)));
}

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

  // Bundle JS/CSS di Vite (content-hash nell'URL): non intercettare mai.
  // Se caches.match() si blocca (bug Safari/iOS) durante un dynamic import
  // del router, la splash screen resta visibile per sempre. Il browser HTTP
  // cache li gestisce perfettamente poiché l'URL è immutabile per definizione.
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    return;
  }

  // Altri asset statici same-origin (icone, manifest, sw-version…): cache-first
  // con aggiornamento in background (stale-while-revalidate).
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE()).then(cache =>
              cache.put(request, copy).catch((err) => {
                if (err && err.name === 'InvalidAccessError') {
                  console.warn('[Service Worker] Cache put: Entry already exists, ignoring.');
                } else {
                  console.error('[Service Worker] Cache put error:', err);
                }
              })
            );
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
    if (preloadResponse && preloadResponse.ok && preloadResponse.headers.get('content-type')?.includes('text/html')) {
      const copy = preloadResponse.clone();
      caches.open(STATIC_CACHE()).then(cache =>
        cache.put('/index.html', copy).catch((err) => {
          if (err && err.name === 'InvalidAccessError') {
            console.warn('[Service Worker] Cache put (preload): Entry already exists, ignoring.');
          } else {
            console.error('[Service Worker] Cache put (preload) error:', err);
          }
        })
      );
      return preloadResponse;
    }

    const networkResponse = await fetch(event.request);
    if (networkResponse.ok && networkResponse.headers.get('content-type')?.includes('text/html')) {
      const copy = networkResponse.clone();
      caches.open(STATIC_CACHE()).then(cache =>
        cache.put('/index.html', copy).catch((err) => {
          if (err && err.name === 'InvalidAccessError') {
            console.warn('[Service Worker] Cache put (network): Entry already exists, ignoring.');
          } else {
            console.error('[Service Worker] Cache put (network) error:', err);
          }
        })
      );
    }
    return networkResponse;
  } catch {
    const cachedShell = await caches.match('/index.html');
    if (cachedShell) return cachedShell;
    return new Response(`<!doctype html><html lang="it"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>CAlcio biliardino</title><style>html,body{margin:0;min-height:100%;background:#0F2A20;color:#fff;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}.sw-splash{min-height:100vh;display:flex;align-items:center;justify-content:center;opacity:.9;letter-spacing:.08em;font-size:12px}</style></head><body><div class="sw-splash">CARICAMENTO…</div></body></html>`, {
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
        caches.open(DATA_CACHE()).then(cache =>
          cache.put(request, copy).catch((err) => {
            if (err && err.name === 'InvalidAccessError') {
              console.warn('[Service Worker] Data cache put: Entry already exists, ignoring.');
            } else {
              console.error('[Service Worker] Data cache put error:', err);
            }
          })
        );
      }
      return response;
    })
    .catch(() => cached || new Response(JSON.stringify({ error: 'offline' }), { status: 503 }));

  return cached || networkPromise;
}

self.addEventListener('push', async (event) => {
  let title, options, notification;
  try {
    const payload = (event.data && typeof event.data.json === 'function') ? event.data.json() : null;
    notification = payload ? payload.notification : null;
    options = notification || {};
    title = options.title;
  } catch (exception) {
    console.error('[push event] Error parsing push event data:', exception);
  }

  try {
    if (options && options.tag) { // Questo dovrebbe prevenire le notifiche del aggiornamento del service worker e mostrare solo quelle definite dall'app
      await self.registration.showNotification(title, { ...options, data: { navigate: notification && notification.navigate } });
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

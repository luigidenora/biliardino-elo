/* eslint-disable @typescript-eslint/explicit-function-return-type */
const VERSION = '1.0.0-alpha.0';
// Asset cache: versioned, clears on VERSION change
const ASSETS_CACHE = `CAlcio-Balilla-assets-v${VERSION}`;
// Data cache: persists across versions, stores server responses
const DATA_CACHE = 'CAlcio-Balilla-data';

const CORE_ASSETS = [
  './',
  './index.html',
  './players.html',
  './matchmaking.html',
  // './add.html',
  './styles/ranking.css',
  './styles/players.css',
  './styles/matchmaking.css',
  // './styles/add-match.css',
  './manifest.webmanifest',
  './icons/icon-192.jpg',
  './icons/icon-512.jpg',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing version ${VERSION}`);

  event.waitUntil(
    caches.open(ASSETS_CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => {
        console.log('[Service Worker] Assets cached, activating...');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[Service Worker] ERRORE installazione:', err);
        throw err; // Let installation fail visibly
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Activating version ${VERSION}`);

  event.waitUntil(
    caches
      .keys()
      .then(keys => {
        // Delete old asset caches (starts with 'CAlcio-Balilla-assets-'), keep data cache
        return Promise.all(keys
          .filter(key => key.startsWith('CAlcio-Balilla-assets-') && key !== ASSETS_CACHE)
          .map(key => {
            console.log(`[Service Worker] Deleting old asset cache: ${key}`);
            return caches.delete(key);
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Old assets cleared, taking control...');
        return clients.claim();
      })
      .catch((err) => {
        console.error('[Service Worker] ERRORE attivazione:', err);
        throw err;
      })
  );
});

/**
 * Listens for messages from clients (the main app).
 * Handles SKIP_WAITING to immediately activate the new service worker.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Received SKIP_WAITING message, activating immediately');
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation requests: cache-first strategy using ASSETS_CACHE
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(ASSETS_CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Check if it's a core asset or data request
  const isAsset = CORE_ASSETS.some(asset => {
    try {
      return new URL(asset, self.location.origin).href === url.href;
    } catch {
      return false;
    }
  });

  // Assets: use ASSETS_CACHE (cache-first)
  if (isAsset || url.pathname.match(/\.(js|css|json|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/i)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(ASSETS_CACHE).then(cache => cache.put(request, copy));
          return response;
        });
      })
    );
    return;
  }

  // Server data: use DATA_CACHE (cache-first, always available)
  event.respondWith(
    caches.match(request, { cacheName: DATA_CACHE }).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(DATA_CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          new Response('Offline', { status: 503 })
        );
    })
  );
});

function toAbsoluteUrl(url) {
  try {
    return new URL(url, self.location.origin).toString();
  } catch (_) {
    return self.location.origin + '/';
  }
}

// self.addEventListener('push', (event) => {
//   const data = event.data?.json() || {};

//   let title, body, navigateUrl;

//   // Formato Declarative Web Push (iOS con navigate in notification)
//   if (data.web_push === 8030 && data.notification) {
//     title = data.notification.title || 'Notifica';
//     body = data.notification.body || '';
//     navigateUrl = data.notification.navigate || '/';
//   } else {
//     // Formato semplice
//     title = data.title || 'Notifica';
//     body = data.body || '';
//     navigateUrl = data.url || data.navigate || '/';
//   }

//   const options = {
//     body,
//     icon: '/icons/icon-192.jpg',
//     badge: '/icons/icon-192-maskable.png',
//     data: { navigate: navigateUrl }
//   };

//   event.waitUntil(self.registration.showNotification(title, options));
// });

// self.addEventListener('notificationclick', (event) => {
//   event.notification.close();
//   const action = event.action;
//   const data = event.notification.data || {};
//   const actionNavs = data.actionNavigations || {};
//   const fallbackNav = data.navigate || '/';
//   const targetUrl = toAbsoluteUrl(action ? (actionNavs[action] || fallbackNav) : fallbackNav);

//   event.waitUntil(
//     (async () => {
//       const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
//       for (const client of allClients) {
//         // If a client is already open on our origin, navigate it
//         try {
//           const url = new URL(client.url);
//           if (url.origin === self.location.origin) {
//             client.focus();
//             client.navigate(targetUrl);
//             return;
//           }
//         } catch (_) {
//           // Ignore URL parsing errors
//         }
//       }
//       await clients.openWindow(targetUrl);
//     })()
//   );
// });

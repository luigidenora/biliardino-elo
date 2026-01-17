const CACHE_NAME = 'CAlcio-Balilla-v1';
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
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
      )
  );
  self.clients.claim();
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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  
  const title = data.title || 'CAlcio Balilla';
  const options = {
    body: data.body || 'Hai una nuova notifica!',
    icon: '/biliardino-elo/icons/icon-192.jpg',
    badge: '/biliardino-elo/icons/icon-192-maskable.png',
    data: data.url || '/biliardino-elo/',
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data;
  event.waitUntil(clients.openWindow(url));
});

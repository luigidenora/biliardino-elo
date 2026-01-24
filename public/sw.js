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
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
      )
  );
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
    data: {
      url: data.url || '/biliardino-elo/',
      actionData: data.actionData || {}
    },
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/biliardino-elo/';
  const action = event.action;

  // Handle action buttons
  if (action) {
    console.log('Notification action clicked:', action);

    // You can handle different actions here
    if (action === 'accept') {
      // Handle accept action
      event.waitUntil(
        clients.openWindow(urlToOpen + '?action=accept')
      );
    } else if (action === 'ignore') {
      // Handle ignore action - just close notification
      console.log('User ignored notification');
    } else {
      // Handle other custom actions
      event.waitUntil(
        clients.openWindow(urlToOpen + '?action=' + action)
      );
    }
  } else {
    // Default click behavior (no action button clicked)
    event.waitUntil(
      clients.openWindow(urlToOpen)
    );
  }
});

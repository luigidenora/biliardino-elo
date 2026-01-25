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
  console.log('[Service Worker] Installato');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => {
        console.log('[Service Worker] Cache completata, attivazione...');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[Service Worker] ERRORE installazione:', err);
        throw err; // Let installation fail visibly
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Attivo');
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
      )
      .then(() => {
        console.log('[Service Worker] Cache pulita, assumo controllo...');
        return clients.claim();
      })
      .catch(err => {
        console.error('[Service Worker] ERRORE attivazione:', err);
        throw err;
      })
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

function toAbsoluteUrl(url) {
  try {
    return new URL(url, self.location.origin).toString();
  } catch (_) {
    return self.location.origin + '/';
  }
}

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  
  let title, body, navigateUrl;
  
  // Formato Declarative Web Push (iOS con navigate in notification)
  if (data.web_push === 8030 && data.notification) {
    title = data.notification.title || 'Notifica';
    body = data.notification.body || '';
    navigateUrl = data.notification.navigate || '/';
  } 
  // Formato semplice
  else {
    title = data.title || 'Notifica';
    body = data.body || '';
    navigateUrl = data.url || data.navigate || '/';
  }

  const options = {
    body,
    icon: '/icons/icon-192.jpg',
    badge: '/icons/icon-192-maskable.png',
    data: { navigate: navigateUrl }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};
  const actionNavs = data.actionNavigations || {};
  const fallbackNav = data.navigate || '/';
  const targetUrl = toAbsoluteUrl(action ? (actionNavs[action] || fallbackNav) : fallbackNav);

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        // If a client is already open on our origin, navigate it
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        } catch (_) { }
      }
      await clients.openWindow(targetUrl);
    })()
  );
});

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

function toAbsoluteUrl(url) {
  try {
    return new URL(url, self.location.origin).toString();
  } catch (_) {
    return self.location.origin + '/';
  }
}

self.addEventListener('push', (event) => {
  const show = async () => {
    let data;
    try {
      data = event.data ? event.data.json() : null;
    } catch (_) {
      data = null;
    }

    // Support both declarative payload wrapper and mutable direct notification
    const isDeclarative = data && data.web_push === 8030 && data.notification;
    const notif = isDeclarative ? data.notification : data;

    // Build NotificationOptions and carry navigate(s) via data for click handling
    let title = 'Notifica';
    let options = {};
    if (notif && typeof notif === 'object' && typeof notif.title === 'string') {
      title = notif.title;
      options = { ...notif };
      delete options.title;

      const navigate = typeof notif.navigate === 'string' ? notif.navigate : '/';
      const absNavigate = toAbsoluteUrl(navigate);
      options.data = { ...(options.data || {}), navigate: absNavigate };

      if (Array.isArray(notif.actions)) {
        const actionNavigations = {};
        options.actions = notif.actions
          .filter(a => a && typeof a.action === 'string' && typeof a.title === 'string')
          .map(a => {
            const icon = typeof a.icon === 'string' ? a.icon : undefined;
            const act = { action: a.action, title: a.title };
            if (icon) act.icon = icon;
            // store per-action navigate for click handler
            const nav = typeof a.navigate === 'string' ? a.navigate : navigate;
            actionNavigations[a.action] = toAbsoluteUrl(nav);
            return act;
          });
        options.data.actionNavigations = actionNavigations;
      }
    }

    await self.registration.showNotification(title, options);
  };
  event.waitUntil(show());
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

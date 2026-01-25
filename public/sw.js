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
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Attivo');
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
      )
      .then(() => clients.claim())
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

    if (!data) {
      // No data, show generic notification
      await self.registration.showNotification('Notifica', {
        body: 'Hai ricevuto una notifica',
        icon: '/icons/icon-192.jpg',
        data: { navigate: '/' }
      });
      return;
    }

    // Detect payload format:
    // 1. WebKit Declarative: { title, options?, default_action_url, mutable?, app_badge? }
    // 2. Legacy with web_push: { web_push: 8030, notification: {...} }
    // 3. Direct notification object: { title, body, ... }

    const isWebKitDeclarative = typeof data.title === 'string' && typeof data.default_action_url === 'string';
    const isLegacyDeclarative = data.web_push === 8030 && data.notification;

    let title = 'Notifica';
    let options = {};
    let defaultActionUrl = '/';
    let actionNavigations = {};

    if (isWebKitDeclarative) {
      // WebKit Declarative Web Push format
      // See: https://github.com/nickmasu/nickmasu/wiki/Declarative-Web-Push
      title = data.title;
      defaultActionUrl = data.default_action_url;

      const opts = data.options || {};
      options = {
        body: opts.body || '',
        icon: opts.icon || '/icons/icon-192.jpg',
        badge: opts.badge || '/icons/icon-192-maskable.png',
        tag: opts.tag,
        lang: opts.lang,
        dir: opts.dir,
        silent: opts.silent,
        requireInteraction: opts.requireInteraction,
        data: {
          ...(opts.data || {}),
          navigate: toAbsoluteUrl(defaultActionUrl)
        }
      };

      // Handle actions with 'url' property (WebKit spec)
      if (Array.isArray(opts.actions)) {
        options.actions = opts.actions
          .filter(a => a && typeof a.action === 'string' && typeof a.title === 'string')
          .map((a) => {
            const act = { action: a.action, title: a.title };
            if (a.icon) act.icon = a.icon;
            // Store action URLs for click handling
            const actionUrl = a.url || defaultActionUrl;
            actionNavigations[a.action] = toAbsoluteUrl(actionUrl);
            return act;
          });
        options.data.actionNavigations = actionNavigations;
      }

      // Handle app_badge if specified
      if (typeof data.app_badge === 'number' && data.app_badge >= 0) {
        try {
          if (data.app_badge === 0) {
            await navigator.clearAppBadge();
          } else {
            await navigator.setAppBadge(data.app_badge);
          }
        } catch (badgeErr) {
          // Badge API may not be available
          console.log('Badge API not available:', badgeErr);
        }
      }
    } else if (isLegacyDeclarative) {
      // Legacy declarative format with web_push: 8030
      const notif = data.notification;
      title = notif.title || 'Notifica';

      const navigate = typeof notif.navigate === 'string' ? notif.navigate : '/';
      const absNavigate = toAbsoluteUrl(navigate);

      options = {
        body: notif.body,
        icon: notif.icon || '/icons/icon-192.jpg',
        badge: notif.badge || '/icons/icon-192-maskable.png',
        tag: notif.tag,
        lang: notif.lang,
        dir: notif.dir,
        silent: notif.silent,
        requireInteraction: notif.requireInteraction,
        data: { ...(notif.data || {}), navigate: absNavigate }
      };

      if (Array.isArray(notif.actions)) {
        options.actions = notif.actions
          .filter(a => a && typeof a.action === 'string' && typeof a.title === 'string')
          .map((a) => {
            const act = { action: a.action, title: a.title };
            if (a.icon) act.icon = a.icon;
            const nav = a.navigate || a.url || navigate;
            actionNavigations[a.action] = toAbsoluteUrl(nav);
            return act;
          });
        options.data.actionNavigations = actionNavigations;
      }
    } else if (data && typeof data === 'object' && typeof data.title === 'string') {
      // Direct notification object (simple format)
      title = data.title;
      options = { ...data };
      delete options.title;

      const navigate = typeof data.navigate === 'string' ? data.navigate : '/';
      options.data = { ...(options.data || {}), navigate: toAbsoluteUrl(navigate) };

      if (Array.isArray(data.actions)) {
        options.actions = data.actions
          .filter(a => a && typeof a.action === 'string' && typeof a.title === 'string')
          .map((a) => {
            const act = { action: a.action, title: a.title };
            if (a.icon) act.icon = a.icon;
            const nav = a.navigate || a.url || navigate;
            actionNavigations[a.action] = toAbsoluteUrl(nav);
            return act;
          });
        options.data.actionNavigations = actionNavigations;
      }
    }

    // Clean up undefined values
    Object.keys(options).forEach((key) => {
      if (options[key] === undefined) delete options[key];
    });

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

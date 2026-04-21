/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Updated automatically by scripts/generate-sw-version.js
const VERSION = '2.1.2604210200+20260421020005';
const CACHE_NAME = `calcio-balilla-${VERSION}`;

// self.__WB_MANIFEST è iniettato da vite-plugin-pwa a build time con tutti i chunk Vite
// (JS, CSS, HTML, PNG, SVG, webp, webmanifest). In dev rimane undefined → fallback minimale.
// Iniettato da vite-plugin-pwa a build time. In dev è undefined → nessun precache.
const PRECACHE_ASSETS = (self.__WB_MANIFEST ?? []).map(e => e.url);

const SUPABASE_REST = /supabase\.co\/rest\/v1\//i;

// ── Lifecycle ────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log(`[SW] Installing ${VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .catch(err => console.warn('[SW] precache partial failure:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating ${VERSION}`);
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.disable();
    }
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('calcio-balilla-') && k !== CACHE_NAME)
        .map((k) => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
    );
    await clients.claim();
  })());
});

// ── Messages ─────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (!event.data?.type) return;
  if (event.data.type === 'GET_VERSION' && event.ports?.[0]) {
    console.log('[SW] Sending version:', VERSION);
    event.ports[0].postMessage({ type: 'SW_VERSION', version: VERSION });
  }
});

// ── Fetch ────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // // Ignora tutte le richieste API (no cache, sempre network)
  // if (url.pathname.startsWith('/api/')) {
  //   // Non risponde, lascia passare al network
  //   return;
  // }

  // Navigation requests: stale-while-revalidate.
  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Supabase REST (cross-origin): stale-while-revalidate
  if (SUPABASE_REST.test(url.href)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Tutti gli altri cross-origin: passa direttamente
  if (url.origin !== self.location.origin) return;

  // Tutti gli asset same-origin (JS, CSS, icone, avatar, classi, manifest): cache-first
  event.respondWith(cacheFirst(request));
});

// ── Strategies ───────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Aggiorna in background senza bloccare
    fetch(request).then((res) => {
      if (res.ok) caches.open(CACHE_NAME).then(c => c.put(request, res)).catch(() => { });
    }).catch(() => { });
    return cached;
  }
  const res = await fetch(request).catch(() => null);
  if (res?.ok) {
    const cloned = res.clone();
    caches.open(CACHE_NAME).then(c => c.put(request, cloned)).catch((err) => {
      console.warn('[SW] cacheFirst failed to cache:', request.url, err);
    });
  }
  return res || new Response('Not found', { status: 404 });
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fresh = fetch(request).then((res) => {
    if (res.ok) {
      const cloned = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(request, cloned)).catch(() => { });
    }
    return res;
  }).catch(() => cached || new Response(JSON.stringify({ error: 'offline' }), { status: 503 }));
  return cached || fresh;
}

// ── Push Notifications ───────────────────────────────────────

self.addEventListener('push', async (event) => {
  let title, options, notification;
  try {
    const payload = event.data?.json?.() ?? null;
    notification = payload?.notification ?? null;
    options = notification || {};
    title = options.title;
  } catch (e) {
    console.error('[SW] push parse error:', e);
  }
  try {
    if (options?.tag) {
      await self.registration.showNotification(title, {
        ...options,
        data: { navigate: notification?.navigate }
      });
    }
  } catch (e) {
    console.error('[SW] showNotification error:', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (!event.action || event.action === 'cancel') {
    if (!event.action) clients.openWindow(event.notification.data?.navigate || '/');
    return;
  }
  clients.openWindow(event.action.url || '/');
});

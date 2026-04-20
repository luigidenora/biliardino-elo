/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Updated automatically by scripts/generate-sw-version.js
const VERSION = '2.1.0+dev';
const CACHE_NAME = `calcio-biliardino-${VERSION}`;

// Static assets safe to cache: same URL = same content forever
const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/icons/manifest-icon-192.maskable.png',
  '/icons/manifest-icon-512.maskable.png'
];

const FIRESTORE_PATTERN = /firestore\.googleapis\.com/i;

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
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('calcio-biliardino-') && k !== CACHE_NAME)
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

  // Navigation requests (HTML): sempre dal network.
  // index.html cambia ad ogni deploy — servire una versione stale rompe l'app
  // perché punta a JS chunk con hash diversi. Offline: pagina inline minimale.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then(cached =>
          cached || new Response(OFFLINE_PAGE, {
            headers: { 'Content-Type': 'text/html; charset=UTF-8' }
          })
        )
      )
    );
    return;
  }

  // Cross-origin: passa direttamente
  if (url.origin !== self.location.origin) return;

  // JS/CSS Vite (content-hash nell'URL): non intercettare mai.
  // L'URL è immutabile → il browser HTTP cache li gestisce perfettamente.
  // Intercettarli causa blocchi durante i dynamic import (bug noto su Safari).
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) return;

  // Firestore: stale-while-revalidate per supporto offline
  if (FIRESTORE_PATTERN.test(url.href)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Altri asset same-origin (icone, manifest, sw-version.js): cache-first
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

const OFFLINE_PAGE = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CAlcio biliardino</title><style>html,body{margin:0;min-height:100%;background:#0F2A20;color:#fff;font-family:Inter,system-ui,-apple-system,sans-serif}.offline{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;letter-spacing:.08em;font-size:13px;opacity:.85}</style></head><body><div class="offline"><div style="font-size:2rem">⚽</div><div>SEI OFFLINE — riprova tra poco</div></div></body></html>`;

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

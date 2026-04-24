/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Updated automatically by scripts/generate-sw-version.js
const VERSION = '2.1.2604241212+20260424120952';
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
  // Corretto skipWaiting()
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

  // API serverless: mai cacheate, devono sempre andare in rete
  if (url.pathname.startsWith('/api/')) return;

  // Supabase Realtime (WebSocket + HTTP long-polling fallback): mai cacheato
  if (/supabase\.co\/realtime\/v1\//i.test(url.href)) return;

  // Supabase REST: network-first (dati sempre freschi, cache come fallback offline)
  if (SUPABASE_REST.test(url.href)) {
    const { respondWith, updateCache } = networkFirst(request);
    event.respondWith(respondWith);
    event.waitUntil(updateCache);
    return;
  }

  // Navigation requests: network-first (sempre dati freschi)
  if (request.mode === 'navigate') {
    const { respondWith, updateCache } = networkFirst(request);
    event.respondWith(respondWith);
    event.waitUntil(updateCache);
    return;
  }

  // Tutti gli altri cross-origin: passa direttamente
  if (url.origin !== self.location.origin) return;

  // Asset same-origin: stale-while-revalidate
  const { respondWith, updateCache } = staleWhileRevalidate(request);
  event.respondWith(respondWith);
  event.waitUntil(updateCache);
});

// ── Strategies ───────────────────────────────────────────────

/**
 * Strategia stale-while-revalidate:
 * - Restituisce immediatamente la versione in cache se presente (stale),
 *   altrimenti attende la risposta di rete (revalidate).
 * - In background aggiorna la cache con la risposta fresca.
 *
 * @param {Request} request
 * @returns {{ respondWith: Promise<Response>, updateCache: Promise<void> }}
 */
function staleWhileRevalidate(request) {
  const pathname = new URL(request.url).pathname;
  const cachedPromise = caches.match(request);

  // Fetch di rete condiviso tra respondWith e updateCache
  const networkFetch = fetch(request)
    .then(res => {
      if (res.ok) {
        console.info(`[SW] Fresh: nuovi dati disponibili per ${pathname}, aggiornamento cache`);
      } else {
        console.warn(`[SW] Fresh: errore ${res.status} per ${pathname}`);
      }
      return res;
    })
    .catch(err => {
      console.warn(`[SW] Fresh: fallimento fetch per ${pathname} - siamo offline?`, err);
      return null;
    });

  const respondWith = (async () => {
    const cached = await cachedPromise;
    if (cached) {
      console.info(`[SW] Stale: ritorniamo cache per ${pathname}`);
      return cached;
    }

    const res = await networkFetch;
    if (res?.ok) {
      const cloned = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(request, cloned)).catch(() => {});
      return res;
    }

    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  })();

  const updateCache = (async () => {
    const res = await networkFetch;
    if (res?.ok) {
      const cloned = res.clone();
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, cloned);
      } catch (err) {
        console.warn('[SW] Errore scrittura cache per', request.url, err);
      }
    }
  })();

  return { respondWith, updateCache };
}

/**
 * Strategia network-first:
 * - Prova sempre la rete; se OK, restituisce i dati e aggiorna la cache.
 * - Se la rete fallisce, cerca nella cache; se non trovata, errore 503.
 *
 * @param {Request} request
 * @returns {{ respondWith: Promise<Response>, updateCache: Promise<void> }}
 */
function networkFirst(request) {
  const pathname = new URL(request.url).pathname;

  const networkFetch = fetch(request)
    .catch(err => {
      console.warn(`[SW] Network-first: rete fallita per ${pathname}`, err);
      return null;
    });

  const respondWith = (async () => {
    const res = await networkFetch;
    if (res) {
      if (res.ok) {
        // Cachea copia fresca (anche se poi updateCache lo rifarà, ma così non perdiamo l'attimo)
        const cloned = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, cloned)).catch(() => {});
      }
      return res; // Restituiamo anche eventuali errori (404, 500) per trasparenza
    }

    // Rete fallita → cache
    const cached = await caches.match(request);
    if (cached) {
      console.info(`[SW] Network-first: offline, restituita cache per ${pathname}`);
      return cached;
    }

    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  })();

  const updateCache = (async () => {
    const res = await networkFetch;
    if (res && res.ok) {
      const cloned = res.clone();
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, cloned);
      } catch (err) {
        console.warn('[SW] Errore scrittura cache per', request.url, err);
      }
    }
  })();

  return { respondWith, updateCache };
}

// Nota: cacheFirst non è più usata, è stata rimossa.

// ── Push Notifications ───────────────────────────────────────

self.addEventListener('push', async (event) => {
  let title, options;
  try {
    const payload = event.data?.json() ?? null;
    const notification = payload?.notification ?? null;
    options = notification || {};
    title = options.title;
  } catch (e) {
    console.error('[SW] push parse error:', e);
    return;
  }

  if (!title) {
    console.warn('[SW] push senza titolo, ignorata');
    return;
  }

  try {
    // Mostra la notifica sempre, anche senza tag. Il tag è opzionale.
    // Mantiene eventuali dati extra già presenti, aggiungendo navigate.
    const notificationOptions = {
      ...options,
      data: {
        ...(options.data || {}),
        navigate: options.navigate || '/'
      }
    };
    if (options.tag) {
      notificationOptions.tag = options.tag;
    }

    await self.registration.showNotification(title, notificationOptions);
  } catch (e) {
    console.error('[SW] showNotification error:', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let targetUrl = '/';

  if (event.action) {
    // Cerca l'URL definito per l'azione specifica
    const action = event.notification.actions?.find(a => a.action === event.action);
    targetUrl = action?.url || event.notification.data?.navigate || '/';
  } else {
    // Click sul corpo della notifica
    targetUrl = event.notification.data?.navigate || '/';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});

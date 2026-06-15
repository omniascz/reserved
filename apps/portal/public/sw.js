/* Service worker pro klientský portál (PWA).
 * Strategie: network-first pro navigaci (vždy čerstvý obsah, offline fallback),
 * cache-first pro statická assets. Záměrně NEcachuje API odpovědi (rezervace
 * musí být aktuální). */

const CACHE = 'reserved-portal-v1';
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API a jiné originy neřešíme (vždy živé).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;

  // Navigace = network-first s offline fallbackem.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Statická assets = cache-first.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
    ),
  );
});

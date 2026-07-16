/* Vital service worker — offline app shell + safe updates */
const CACHE = 'vital-v1';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './app-icon-192.png',
  './app-icon-512.png',
  './app-icon-512-maskable.png',
  './apple-touch-icon.png',
  './favicon.png'
];

// Precache the shell. Cache entries individually so one failure can't abort install.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE.map((url) => cache.add(url)));
    self.skipWaiting();
  })());
});

// Drop old caches on activation.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept cross-origin requests (e.g. the Anthropic API or WHOOP).
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so updates land, fall back to the cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Everything else: cache-first, then network (and cache what we fetch).
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});

// Allow the page to trigger an immediate update.
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

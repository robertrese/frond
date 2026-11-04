// Frond service worker. build.py fills in VERSION and PRECACHE.
// Pages are network-first (updates show up straight away when online) and fall
// back to the cached copy offline. Fonts and icons are cache-first.
const VERSION = '@@VERSION@@';
const CACHE = 'frond-' + VERSION;
const PRECACHE = ['@@PRECACHE@@'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('frond-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // stay inside this app's folder: on <user>.github.io every repository shares one origin
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((cache) => cache.put('./', res.clone()));
          return res;
        })
        .catch(() => caches.match('./', { cacheName: CACHE }).then((hit) => hit || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put(req, copy)); }
      return res;
    }))
  );
});

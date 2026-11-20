// DocLoom service worker: versioned cache-first app shell. The version placeholder below is replaced at build time.
const VERSION = '3b92ac2a68';
const CACHE = 'docloom-' + VERSION;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('docloom-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // never intercept cross-origin (e.g. image upload)
  if (url.pathname.startsWith('/api/')) return; // server API (sync, SSE, health) is never cached
  // Share pages and the render page are server-generated and revocable: caching one would keep
  // serving a share after it is revoked or has expired, and `Cache-Control: no-store` does not
  // stop caches.put(). The scope is the whole origin, so they have to be excluded by path.
  if (url.pathname.startsWith('/s/') || url.pathname === '/render') return;
  event.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
    ),
  );
});

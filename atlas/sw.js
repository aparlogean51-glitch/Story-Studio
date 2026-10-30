// The Nephite Annals: keeps the app on the device so it opens without a connection.
const SHELL = 'annals-shell-1350f78c65', ART = 'annals-scenes';
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./assets/map-painted.webp", "./assets/map-mosaic.webp", "./assets/fonts/cormorant-500.woff2", "./assets/fonts/cormorant-600.woff2", "./assets/fonts/dmsans-400.woff2", "./assets/fonts/dmsans-500.woff2", "./assets/fonts/dmsans-600.woff2"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => (k.startsWith('annals-shell-') && k !== SHELL) || k === 'annals-art').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/assets/scenes/')) {
    // illustrations: from the device once seen, otherwise from the web (and kept)
    e.respondWith(caches.open(ART).then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // everything else: newest copy when online, saved copy when offline
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});

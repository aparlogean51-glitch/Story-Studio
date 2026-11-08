// iStory: keeps the app itself on the iPad so it opens without a connection.
// Your story is not stored here (it lives in the app's own storage and syncs to Google Drive).
const CACHE = 'istory-6a608';
const FILES = ['./', './index.html', './js/typewriter.js?v=6a608', './js/store.js?v=6a608', './js/google.js?v=6a608', './js/pad.js?v=6a608', './js/app.js?v=6a608', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  // only iStory's own older copies are cleared; the Scene Board and Scribe Pad keep theirs
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('istory-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.includes('/istory/')) return;   // Google sign-in, Drive and fonts go straight to the network
  // newest copy when online, the saved copy when offline
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match(e.request, { ignoreSearch: true })).then((r) => r || caches.match('./index.html'))));
});

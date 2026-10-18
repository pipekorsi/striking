// Service worker: lets the app install and work offline (except map tiles you haven't viewed before).
const VERSION = 'v4';
const SHELL = `striking-shell-${VERSION}`;
const TILES = 'striking-tiles';
const LIBS = 'striking-libs';
const PRECACHE = ['./', 'index.html', 'data.js', 'tube.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const LIB_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js'
];
const MAX_TILES = 800;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    await (await caches.open(SHELL)).addAll(PRECACHE);
    const libs = await caches.open(LIBS);
    await Promise.all(LIB_URLS.map(u => libs.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('striking-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map tiles: cache-first, remember what you've viewed.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith((async () => {
      const cache = await caches.open(TILES);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()); trim(cache, MAX_TILES); }
        return res;
      } catch (err) { return new Response('', {status: 504}); }
    })());
    return;
  }

  // Leaflet from CDN: cache-first.
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith((async () => {
      const cache = await caches.open(LIBS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Our own files: network first (so updates show up), cache as fallback.
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await fetch(req, {cache: 'no-cache'});
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return (await cache.match(req)) || (await cache.match('index.html'));
      }
    })());
  }
});

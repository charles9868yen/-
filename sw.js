const CACHE_NAME = 'timetable-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/timetable_bs.css',
  '/timetable_bs.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  // try network first for navigation (so updates apply), fallback to cache
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    ev.respondWith(
      fetch(req).then(r => {
        // update cache in background
        const copy = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return r;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // for other GET requests use cache-first
  if (req.method === 'GET') {
    ev.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        // optionally cache fetched resource
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(req, res.clone());
          return res;
        });
      })).catch(() => {
        // fallback strategy: if image missing, return icon
        if (req.destination === 'image') return caches.match('/icons/icon-192.png');
      })
    );
  }
});

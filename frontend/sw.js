const CACHE_NAME = 'echotrace-pwa-v20261031-fix';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './assets/logo.png',
  './assets/default_avatar.svg',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const isApiRequest = requestUrl.pathname.includes('/backend/api/')
    || requestUrl.pathname.startsWith('/api/')
    || requestUrl.searchParams.has('route');

  // Never intercept cross-origin, authenticated, API, or non-GET requests.
  // Authentication responses remain entirely outside Cache Storage.
  if (requestUrl.origin !== self.location.origin
      || event.request.method !== 'GET'
      || event.request.headers.has('Authorization')
      || isApiRequest) {
    return;
  }

  // CSS, JS, and HTML — always network first, fall back to cache
  const isCritical = /\.(css|js|html)(\?.*)?$/.test(event.request.url) || event.request.mode === 'navigate';
  if (isCritical) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (images, fonts) — cache first
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});

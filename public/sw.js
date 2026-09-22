// Aura Offline Music Player - Service Worker
const CACHE_NAME = 'aura-music-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Initial cache failed to load all items:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Hanya tangani GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Abaikan scheme selain http/https (mencegah error chrome-extension://)
  if (!url.protocol.startsWith('http')) return;

  // Jangan cache audio streaming blob, external third-party APIs, atau Vite dev server HMR
  if (
    url.protocol === 'blob:' ||
    url.protocol === 'data:' ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.flac') ||
    url.hostname.includes('cobalt') ||
    url.hostname.includes('tikwm') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('googlevideo') ||
    url.pathname.includes('@vite') ||
    url.pathname.includes('node_modules')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for cache-refresh jika online
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Jika offline dan membuka navigasi halaman, sajikan cached index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

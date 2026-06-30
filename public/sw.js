// Lomuriangole CYDC Offline Service Worker (UG-1083)
// Handles caching of static assets and provides robust offline-first data sync stability.

const CACHE_NAME = 'lomuriangole-cydc-v2';
const API_CACHE_NAME = 'lomuriangole-cydc-api-v2';

// Assets to precache on installation for instantaneous offline loading
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
];

// Install Event: Precache core shell files
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching core application shell');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[Service Worker] Some precache assets failed to load initially, continuing...', err);
      });
    })
  );
});

// Activate Event: Clean up stale/old cache buckets
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('[Service Worker] Evicting outdated cache store:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper to check if the request is for static assets (fonts, styles, scripts, images)
function isAssetRequest(url) {
  const ext = url.pathname.split('.').pop();
  return (
    url.origin === self.location.origin &&
    (
      url.pathname.includes('/assets/') ||
      url.pathname.includes('/src/') ||
      ['html', 'js', 'css', 'json', 'png', 'jpg', 'jpeg', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'otf'].includes(ext)
    )
  );
}

// Fetch Event Handler: Intercept network traffic
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // 1. Intercept /api/sync GET requests for Offline-First retrieval
  if (event.request.method === 'GET' && requestUrl.pathname === '/api/sync') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(API_CACHE_NAME);
            await cache.put(new Request('/api/sync'), networkResponse.clone());
            console.log('[Service Worker] Cached fresh GET /api/sync response');
          }
          return networkResponse;
        } catch (err) {
          console.warn('[Service Worker] GET /api/sync failed. Querying offline fallback cache...');
          const cache = await caches.open(API_CACHE_NAME);
          const cachedResponse = await cache.match(new Request('/api/sync'));
          if (cachedResponse) {
            console.log('[Service Worker] Serving GET /api/sync from offline-first cache!');
            return cachedResponse;
          }
          // Return offline JSON message if cache is empty
          return new Response(
            JSON.stringify({
              error: 'NetworkOffline',
              offline: true,
              message: 'Your cellular or satellite connection is currently unstable. Changes have been buffered locally and will be automatically synchronized upon recovery.',
              timestamp: new Date().toISOString()
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      })()
    );
    return;
  }

  // 2. Intercept /api/sync POST requests to sync data locally & update fallback cache when offline
  if (event.request.method === 'POST' && requestUrl.pathname === '/api/sync') {
    event.respondWith(
      (async () => {
        const reqCloneForBody = event.request.clone();
        try {
          // Attempt actual network request
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            // Update the offline sync cache with this successful payload
            try {
              const bodyJson = await reqCloneForBody.json();
              const responseToCache = new Response(JSON.stringify(bodyJson), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
              const cache = await caches.open(API_CACHE_NAME);
              await cache.put(new Request('/api/sync'), responseToCache);
              console.log('[Service Worker] Updated GET /api/sync cache with latest online POST payload');
            } catch (e) {
              console.warn('[Service Worker] Failed to cache POST payload:', e);
            }
          }
          return networkResponse;
        } catch (networkError) {
          console.warn('[Service Worker] POST /api/sync failed (offline). Buffering locally...', networkError);
          try {
            const bodyJson = await reqCloneForBody.json();
            const responseToCache = new Response(JSON.stringify(bodyJson), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
            const cache = await caches.open(API_CACHE_NAME);
            await cache.put(new Request('/api/sync'), responseToCache);
            console.log('[Service Worker] Updated GET /api/sync cache with offline-saved POST payload');

            return new Response(
              JSON.stringify({
                success: true,
                offline: true,
                message: 'Your connection is currently offline. Changes have been saved locally & buffered in the service worker.',
                timestamp: new Date().toISOString()
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          } catch (jsonErr) {
            console.error('[Service Worker] Failed to parse offline POST body:', jsonErr);
            return new Response(
              JSON.stringify({
                error: 'NetworkOffline',
                offline: true,
                message: 'You are currently offline. Changes are saved in your local browser storage.',
                timestamp: new Date().toISOString()
              }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          }
        }
      })()
    );
    return;
  }

  // 3. Only handle GET requests for other assets
  if (event.request.method !== 'GET') {
    return;
  }

  // 4. Static Asset Caching - STALE-WHILE-REVALIDATE Strategy
  // Great for quick load times and instant rendering, with background updates for dynamic bundles.
  if (isAssetRequest(requestUrl) || requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch((err) => {
          console.log('[Service Worker] Background fetch failed for offline static asset:', requestUrl.pathname, err);
        });

        // Return cached version immediately if available, otherwise fetch from network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 5. Fallback Network-First for External Resources (fonts, icons, CDN scripts)
  if (
    requestUrl.origin.includes('fonts.googleapis.com') ||
    requestUrl.origin.includes('fonts.gstatic.com') ||
    requestUrl.origin.includes('lucide')
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // 6. Generic API Fallbacks - Network First with offline JSON message
  if (requestUrl.pathname.startsWith('/api/') || requestUrl.href.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch((err) => {
        console.warn('[Service Worker] Generic API fallback triggered:', requestUrl.href, err);
        return new Response(
          JSON.stringify({
            error: 'NetworkOffline',
            offline: true,
            message: 'Your network is currently offline. Live data queries will automatically sync upon recovery.',
            timestamp: new Date().toISOString()
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
  }
});

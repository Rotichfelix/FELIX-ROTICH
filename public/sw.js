// Lomuriangole CYDC Offline Service Worker (UG-1083)
// Handles caching of static assets and provides offline stability under network instability.

const CACHE_NAME = 'lomuriangole-cydc-v1';

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
          if (cacheName !== CACHE_NAME) {
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
  // Only handle GET requests; POST/PUT/DELETE cannot be cached in the Cache API
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // 1. Static Asset Caching - STALE-WHILE-REVALIDATE Strategy
  // Great for quick load times and instant rendering, with background updates for dynamic bundles.
  if (isAssetRequest(requestUrl) || requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Build the fetch handler to run in background or foreground
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

        // Return the cached version immediately if available, or fetch from network if missing.
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 2. Fallback Network-First for External Resources (fonts, icons, cdn scripts)
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
          // fallback to cache if network is down
          return caches.match(event.request);
        })
    );
    return;
  }

  // 3. API Fallbacks - Network First with offline JSON message
  // If actual network calls to endpoints like Google sheets or Gmail fail due to instability,
  // return a readable JSON response to the app so the UI knows there is temporary offline state.
  if (requestUrl.pathname.startsWith('/api/') || requestUrl.href.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch((err) => {
        console.warn('[Service Worker] Network request rejected due to offline state:', requestUrl.href, err);
        
        // Return a mock JSON response indicating network unavailability
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
      })
    );
  }
});

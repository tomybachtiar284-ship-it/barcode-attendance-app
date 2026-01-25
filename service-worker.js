const CACHE_NAME = 'aman-s-v4-offline-safety';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './mobile-camera.js',
    './config.local.js',
    './manifest.json',
    './js/db.js',
    './js/attendance.js',
    './js/report.js',
    './js/state.js',
    './js/translation.js',
    './js/utils.js',
    './assets/AMAN-S-Logo.jpg'
];

self.addEventListener('install', (e) => {
    console.log('[SW] Installing New Version...');
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (e) => {
    console.log('[SW] Activated. Cleaning old caches...');
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Stale-While-Revalidate Strategy for most things
    // But for API calls (Supabase), Network Only (handled by db.js logic)

    const url = new URL(e.request.url);

    // Skip supabase requests (let db.js handle offline queue)
    if (url.hostname.includes('supabase')) {
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cached) => {
            // If found in cache, return it (Fast)
            // But also update cache in background (Fresh)
            const fetchPromise = fetch(e.request).then((networkResponse) => {
                caches.open(CACHE_NAME).then((cache) => {
                    // Check valid response before caching
                    if (networkResponse.ok) cache.put(e.request, networkResponse.clone());
                });
                return networkResponse;
            }).catch(err => {
                // Network failed, nothing to do
            });

            return cached || fetchPromise; // Return cached if avail, else wait for network
        })
    );
});

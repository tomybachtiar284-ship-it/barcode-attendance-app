const CACHE_NAME = 'aman-s-v1';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './config.local.js',
    './js/report.js',
    './assets/AMAN-S-Logo.jpg',
    './assets/bg-new.jpg'
];

// Install Event
self.addEventListener('install', (e) => {
    console.log('[SW] Install');
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching all assets');
            return cache.addAll(ASSETS);
        })
    );
});

// Fetch Event
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((r) => {
            // Return cache or fetch from network
            return r || fetch(e.request);
        })
    );
});

// Activate Event (Cleanup)
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[SW] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
});

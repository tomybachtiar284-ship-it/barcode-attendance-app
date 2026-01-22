// SERVICE WORKER KILL-SWITCH
// This script replaces the old Service Worker to force unregistration
// and clear any aggressive caching that causes infinite loading loops.

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    // Force unregister this SW
    self.registration.unregister()
        .then(() => {
            return self.clients.matchAll();
        })
        .then((clients) => {
            clients.forEach(client => client.navigate(client.url));
        });
});

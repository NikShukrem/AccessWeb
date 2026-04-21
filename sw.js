// Service Worker для полностью оффлайн работы AccessWeb
const CACHE_NAME = 'accessweb-v1';
const urlsToCache = ['/'];

self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .catch(err => console.log('Cache add failed:', err))
    );
});

self.addEventListener('fetch', event => {
    // Network first, fallback to cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Кэшируем успешные ответы
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Если нет сети, пытаемся вернуть из кэша
                return caches.match(event.request)
                    .then(response => response || new Response('Offline'));
            })
    );
});

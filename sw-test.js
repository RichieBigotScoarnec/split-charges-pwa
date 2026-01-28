// Service Worker — FairSplit TEST
// Stratégie : cache-first pour assets statiques, network-first pour Firebase

const CACHE_NAME = 'fairsplit-test-v1';

// Fichiers à mettre en cache pour le mode offline
const STATIC_ASSETS = [
  './FairSplit-Test.html',
  './manifest-test.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cache ouvert, installation en cours...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Certains assets non cachés :', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les requêtes Firebase (toujours réseau)
  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com')) {
    return;
  }

  // Cache-first pour les assets statiques locaux
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Rafraîchir le cache en arrière-plan
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => {});

        // Retourner la version cachée immédiatement (stale-while-revalidate)
        return cachedResponse;
      }

      // Pas en cache : réseau puis cache
      return fetch(event.request).then((response) => {
        if (!response || !response.ok) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    }).catch(() => {
      // Hors ligne et pas en cache : retourner la page principale
      return caches.match('./FairSplit-Test.html');
    })
  );
});

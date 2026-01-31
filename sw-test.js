// Service Worker — FairSplit TEST
// Stratégie : cache-first pour assets statiques, network-first pour Firebase

const CACHE_NAME = 'fairsplit-test-v17';

// Fichiers à mettre en cache pour le mode offline
const STATIC_ASSETS = [
  './FairSplit-Test.html',
  './manifest-test.json',
  // CSS
  './css/variables.css',
  './css/base.css',
  './css/components.css',
  './css/modals.css',
  './css/auth.css',
  './css/summary.css',
  './css/map.css',
  './css/responsive.css',
  // JS Infrastructure
  './js/config.js',
  './js/state.js',
  './js/db.js',
  './js/utils/format.js',
  './js/utils/date.js',
  './js/utils/validation.js',
  // JS Modules (Étape 3a)
  './js/app.js',
  './js/firebase-init.js',
  './js/components/toast.js',
  './js/components/modal.js',
  // JS Modules (Étape 3b)
  './js/modules/auth.js',
  // JS Modules (Étape 3c)
  './js/modules/period.js',
  // JS Modules (Étape 3d)
  './js/modules/share-mode.js',
  // JS Modules (Étape 3e)
  './js/modules/variable-charges.js',
  // JS Modules (Étape 3f)
  './js/modules/fixed-charges.js',
  // JS Modules (Étape 3g)
  './js/modules/reimbursements.js',
  // JS Modules (Étape 3h)
  './js/modules/summary.js',
  // JS Modules (Étape 4a)
  './js/modules/search.js',
  // JS Modules (Étape 4b)
  './js/modules/export.js',
  // JS Modules (Étape 4c)
  './js/modules/notifications.js',
  // JS Modules (Étape 4d)
  './js/modules/categories.js',
  // JS Modules (Étape 4e)
  './js/modules/trends.js',
  // JS Modules (Étape 4f)
  './js/modules/reconduction.js'
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

// Service Worker — FairSplit
// Stratégie : cache-first pour assets statiques, network-first pour Firebase

// Remplacé au déploiement par le SHA du commit (cf. .github/workflows/deploy.yml).
// Un numéro de version à incrémenter à la main finit toujours par être oublié :
// le cache sert alors une version périmée sans que rien ne le signale.
// En développement le marqueur reste littéral, donc le nom de cache est stable.
const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = `fairsplit-${CACHE_VERSION}`;

// Fichiers à mettre en cache pour le mode offline
const STATIC_ASSETS = [
  './FairSplit.html',
  './manifest.json',
  // Icônes (absentes du cache jusqu'ici : PWA sans icône hors ligne)
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
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
  './js/init.js',
  './js/config.js',
  './js/state.js',
  './js/db.js',
  './js/utils/debug.js',
  './js/utils/format.js',
  './js/utils/date.js',
  './js/utils/validation.js',
  './js/utils/diagnostics.js',
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
  './js/modules/reconduction.js',
  // JS Modules (Étape 4g)
  './js/modules/quick-add.js',
  // JS Modules (Étape 4h)
  './js/modules/map.js',
  // JS Modules (Étape 5a)
  './js/modules/custom-lists.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
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
          .map((name) => {
            console.log('[SW] Suppression ancien cache :', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * Le nom d'hôte est-il ce domaine, ou l'un de ses sous-domaines ?
 * @param {string} hostname - Hôte de la requête
 * @param {string} domain - Domaine attendu, sans point initial
 * @returns {boolean}
 */
function isHost(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les requêtes Firebase (toujours réseau)
  //
  // includes() sur un nom d'hôte accepte n'importe quel domaine contenant la
  // chaîne — « firebaseio.com.exemple.net » passait le test. Vérifier le
  // suffixe, et exiger un point avant lui pour ne pas accepter
  // « notfirebaseio.com ».
  if (isHost(url.hostname, 'firebaseio.com') || isHost(url.hostname, 'googleapis.com')) {
    return;
  }

  // Network-first pour JS et HTML (garantit les mises à jour immédiates)
  // Cache-first uniquement pour CSS et images (changent moins souvent)
  const isJSorHTML = url.pathname.endsWith('.js') || url.pathname.endsWith('.html');

  if (isJSorHTML) {
    // Network-first : essayer le réseau d'abord, fallback sur cache
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('./FairSplit.html');
          });
        })
    );
  } else {
    // Stale-while-revalidate pour CSS, images, fonts
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.ok) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        return fetch(event.request).then((response) => {
          if (!response || !response.ok) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      }).catch(() => {
        return caches.match('./FairSplit.html');
      })
    );
  }
});

// Service Worker — FairSplit
// Stratégie : cache-first pour assets statiques, network-first pour Firebase

// Remplacé au déploiement par le SHA du commit (cf. .github/workflows/deploy.yml).
// Un numéro de version à incrémenter à la main finit toujours par être oublié :
// le cache sert alors une version périmée sans que rien ne le signale.
// En développement le marqueur reste littéral, donc le nom de cache est stable.
const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = `fairsplit-${CACHE_VERSION}`;

// Fichiers mis en cache pour le fonctionnement hors ligne
//
// Cette liste doit couvrir TOUT ce que la page charge. Elle avait décroché :
// douze modules manquaient, dont utils/calculations.js — le moteur du solde,
// importé statiquement par summary.js. Hors ligne, cette requête échouait, le
// repli renvoyait la page HTML à la place d'un module, et l'application ne
// démarrait plus du tout. Une liste tenue à la main dérive ; le test
// tests/utils/service-worker-precache.test.js la compare désormais au contenu
// réel de public/.
const STATIC_ASSETS = [
  // Page et manifeste
  './FairSplit.html',
  './manifest.json',
  // Icônes — sans elles, l'application installée n'en a pas hors ligne
  './icon-192-maskable.png',
  './icon-192.png',
  './icon-512-maskable.png',
  './icon-512.png',
  './icon-quick-add-96.png',
  './icon-quick-add-192.png',

  // Polices servies par l'application : les précacher est tout l'intérêt de
  // les avoir rapatriées. Sans cela elles seraient retéléchargées à chaque
  // version, et absentes hors ligne.
  './fonts/dm-sans-latin.woff2',
  './fonts/jetbrains-mono-latin.woff2',
  // Feuilles de style
  './css/auth.css',
  './css/base.css',
  './css/components.css',
  './css/map.css',
  './css/modals.css',
  './css/onglets.css',
  './css/responsive.css',
  './css/summary.css',
  './css/variables.css',
  // Socle : refus d'encadrement, délégation, configuration, état, données
  './js/anti-cadre.js',
  './js/init.js',
  './js/app.js',
  './js/config.js',
  './js/firebase-init.js',
  './js/state.js',
  './js/db.js',
  // Utilitaires — dont le moteur de calcul du solde
  './js/utils/attente-application.js',
  './js/utils/attestation.js',
  './js/utils/auth-errors.js',
  './js/utils/barre-solde.js',
  './js/utils/budgets.js',
  './js/utils/cadre.js',
  './js/utils/calculations.js',
  './js/utils/categorie-lieu.js',
  './js/utils/categories-frequentes.js',
  './js/utils/confidentialite.js',
  './js/utils/connection-banner.js',
  './js/utils/date.js',
  './js/utils/debug.js',
  './js/utils/diagnostics.js',
  './js/utils/ecouteur.js',
  './js/utils/enveloppes.js',
  './js/utils/format.js',
  './js/utils/identifiant.js',
  './js/utils/lieu.js',
  './js/utils/members.js',
  './js/utils/miroir.js',
  './js/utils/montant.js',
  './js/utils/onglets.js',
  './js/utils/perimetre.js',
  './js/utils/periodes.js',
  './js/utils/phrase-saisie.js',
  './js/utils/previsionnel.js',
  './js/utils/raccourci.js',
  './js/utils/recherche-lieu.js',
  './js/utils/recherche-texte.js',
  './js/utils/recurrence.js',
  './js/utils/renommage.js',
  './js/utils/salaries.js',
  './js/utils/sonde-liaison.js',
  './js/utils/sandbox-banner.js',
  './js/utils/soft-delete.js',
  './js/utils/soumission.js',
  './js/utils/tendances.js',
  './js/utils/tri.js',
  './js/utils/validation.js',
  './js/utils/versements.js',
  // Composants
  './js/components/modal.js',
  './js/components/toast.js',
  // Modules fonctionnels
  './js/modules/auth.js',
  './js/modules/backup.js',
  './js/modules/carry-over.js',
  './js/modules/categories.js',
  './js/modules/category-budgets.js',
  './js/modules/choix-lieu.js',
  './js/modules/custom-lists.js',
  './js/modules/envelopes.js',
  './js/modules/export.js',
  './js/modules/fixed-charges.js',
  './js/modules/map.js',
  './js/modules/members.js',
  './js/modules/notifications.js',
  './js/modules/period.js',
  './js/modules/prive.js',
  './js/modules/quick-add.js',
  './js/modules/reconduction.js',
  './js/modules/reimbursements.js',
  './js/modules/search.js',
  './js/modules/share-mode.js',
  './js/modules/summary.js',
  './js/modules/trash.js',
  './js/modules/trends.js',
  './js/modules/variable-charges.js'
];

// Le socle sans lequel l'application ne démarre pas hors ligne.
//
// `addAll` est atomique : une seule réponse dégradée fait échouer les cent
// fichiers. L'échec était avalé, l'installation déclarée réussie — et
// `skipWaiting()`, appelé avant même de savoir si le cache s'était rempli,
// avait déjà engagé le remplacement. Le nouveau service worker prenait la main
// avec un cache vide, `activate` venait de supprimer l'ancien, et rien ne
// recomplétait jamais : hors ligne, l'application ne démarrait plus, jusqu'au
// déploiement suivant. Un portail captif au mauvais moment suffisait.
const SOCLE = [
  './FairSplit.html',
  './js/anti-cadre.js',
  './js/init.js',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/state.js',
  './js/utils/calculations.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Fichier par fichier : ce qui manque manque seul, au lieu d'emporter tout
    // le reste. Le compte des absents se lit dans la console.
    const echecs = [];
    await Promise.all(STATIC_ASSETS.map(async (ressource) => {
      try {
        const reponse = await fetch(ressource, { cache: 'reload' });
        if (!reponse || !reponse.ok) throw new Error(`HTTP ${reponse && reponse.status}`);
        await cache.put(ressource, reponse);
      } catch (err) {
        echecs.push(ressource);
        console.warn('[SW] Non mis en cache :', ressource, err);
      }
    }));

    // Le socle, lui, ne se négocie pas : sans lui, prendre la main reviendrait
    // à remplacer une application qui fonctionne par une qui ne démarre pas.
    // Refuser l'installation laisse l'ancien service worker en place.
    const socleManquant = echecs.filter((ressource) => SOCLE.includes(ressource));
    if (socleManquant.length > 0) {
      throw new Error(`[SW] Socle incomplet, installation refusée : ${socleManquant.join(', ')}`);
    }

    console.log(`[SW] Cache prêt (${STATIC_ASSETS.length - echecs.length}/${STATIC_ASSETS.length})`);

    // Après le remplissage, et pas avant.
    await self.skipWaiting();
  })());
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

/**
 * Domaines à ne jamais intercepter.
 *
 * Une liste de domaines autorisés a la mauvaise valeur par défaut : ce qui
 * n'y figure pas est intercepté. La base de données s'était retrouvée dans ce
 * cas.
 *
 * Son hôte réel est « <projet>.<région>.firebasedatabase.app » — les zones
 * européennes n'utilisent pas « firebaseio.com », qui était seul listé ici.
 * Toutes ses requêtes passaient donc par le cache. Le WebSocket échappe au
 * service worker et masquait le problème ; le long-polling, transport de repli
 * quand le WebSocket ne passe pas — réseau mobile, proxy d'entreprise — était
 * bien intercepté, chaque réponse étant recopiée en cache. La liaison ne
 * s'établissait plus, sans que la marque du navigateur y soit pour rien.
 *
 * Cette liste couvre données, authentification et services Google. Ce qui
 * reste mis en cache : les fichiers du site, et les bibliothèques servies par
 * CDN dont la mise en cache est le but recherché.
 */
const HOSTS_JAMAIS_INTERCEPTES = [
  'firebasedatabase.app',   // Realtime Database — toutes régions
  'firebaseio.com',         // Realtime Database — région historique
  'firebaseapp.com',        // domaine d'authentification
  'googleapis.com',         // identitytoolkit, securetoken
  'accounts.google.com',    // connexion Google
  'apis.google.com',        // client d'authentification
  // reCAPTCHA, dont dépend l'attestation App Check. Son script est révisé
  // fréquemment et ses jetons sont à usage unique : une copie servie depuis le
  // cache produirait des attestations refusées, donc une base injoignable —
  // pour une cause introuvable, le réseau paraissant fonctionner.
  'google.com',
  'openstreetmap.org'       // géocodage : une réponse mise en cache serait fausse
];

/**
 * L'hôte est-il un émulateur local ?
 *
 * Les mêmes raisons que pour la base réelle : une lecture mise en cache puis
 * resservie comme fraîche est exactement le symptôme que cette liste existe
 * pour empêcher. Traité à part parce qu'un émulateur se reconnaît à son hôte,
 * pas à son domaine.
 *
 * @param {URL} url
 * @returns {boolean}
 */
function estEmulateurLocal(url) {
  return url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '[::1]';
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne jamais intercepter les échanges avec un service distant.
  //
  // isHost vérifie le suffixe et exige un point avant lui : includes() sur un
  // nom d'hôte acceptait « firebaseio.com.exemple.net », et un simple endsWith
  // accepterait « notfirebaseio.com ».
  if (HOSTS_JAMAIS_INTERCEPTES.some((domaine) => isHost(url.hostname, domaine))
      || estEmulateurLocal(url)) {
    return;
  }

  // Une requête qui n'est pas une simple lecture ne se met pas en cache, et le
  // cache ne saurait pas y répondre. Les laisser passer évite de servir une
  // réponse périmée à une écriture.
  if (event.request.method !== 'GET') {
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
            if (cachedResponse) return cachedResponse;

            // Le repli vers la page ne vaut que pour une navigation. Il
            // s'appliquait à tout : une requête de module absente du cache
            // recevait du HTML, que le navigateur tentait d'interpréter comme
            // du JavaScript. L'erreur parlait alors de syntaxe inattendue, à
            // mille lieues de la cause — un fichier oublié dans la liste.
            // Mieux vaut un échec franc, qui nomme la ressource manquante.
            if (event.request.mode === 'navigate') {
              return caches.match('./FairSplit.html');
            }
            return Response.error();
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
        // Même règle : une feuille de style ou une image manquante ne se
        // remplace pas par la page d'accueil.
        if (event.request.mode === 'navigate') {
          return caches.match('./FairSplit.html');
        }
        return Response.error();
      })
    );
  }
});

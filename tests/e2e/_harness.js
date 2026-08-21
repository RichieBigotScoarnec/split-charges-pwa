import { ALLOWED_EMAILS } from '../../public/js/config.js';

// L'application refuse tout compte hors liste blanche (js/modules/auth.js).
// Dériver l'adresse de la vraie liste plutôt que de la figer : sinon les tests
// se cassent silencieusement à chaque évolution de la whitelist — ce qui est
// exactement ce qui s'était produit.
const TEST_EMAIL = ALLOWED_EMAILS[0];

/**
 * Banc d'essai partagé par les suites end-to-end.
 *
 * Mock Firebase hiérarchique — push().set() stocke sous le chemin parent
 * Permet à loadVariableCharges() de retrouver les données via dbGet(parentPath)
 */
export const REACTIVE_FIREBASE_MOCK = `
  window.__db = {};
  window.__listeners = {};
  window.__mockAuthCallback = null;

  // Realtime Database rend le sous-arbre complet quand on lit un nœud parent :
  // lire 'periods' renvoie tous les mois. Ce double stockait des chemins plats,
  // si bien qu'une lecture de parent rendait null — ce qui masquait toute
  // fonctionnalité parcourant l'historique.
  function _read(path) {
    if (window.__db[path] !== undefined) return window.__db[path];

    var prefix = path + '/';
    var tree = null;
    Object.keys(window.__db).forEach(function(key) {
      if (key.indexOf(prefix) !== 0) return;
      var segments = key.slice(prefix.length).split('/');
      if (segments.some(function(s) { return s === '__proto__' || s === 'constructor' || s === 'prototype'; })) return;
      tree = tree || {};
      var node = tree;
      for (var i = 0; i < segments.length - 1; i++) {
        if (typeof node[segments[i]] !== 'object' || node[segments[i]] === null) {
          node[segments[i]] = {};
        }
        node = node[segments[i]];
      }
      // Fusionner plutot qu'ecraser. Ce double conserve a la fois l'objet
      // parent complet et des entrees plates par enfant : une mise a jour
      // partielle -- { deleted: true } -- ecrasait sinon la charge entiere
      // selon l'ordre d'iteration, et l'element ressortait sans description
      // ni montant. Realtime Database, lui, n'a qu'un seul arbre.
      var derniere = segments[segments.length - 1];
      var valeur = window.__db[key];
      var existant = node[derniere];
      if (existant && typeof existant === 'object' && !Array.isArray(existant)
          && valeur && typeof valeur === 'object' && !Array.isArray(valeur)) {
        node[derniere] = Object.assign({}, existant, valeur);
      } else {
        node[derniere] = valeur;
      }
    });
    return tree;
  }

  function _notify(path) {
    var data = _read(path);
    var handlers = window.__listeners[path] || [];
    handlers.forEach(function(fn) {
      fn({ val: function() { return data; }, exists: function() { return data !== null; } });
    });
  }

  window.firebase = {
    initializeApp: function() { return {}; },
    database: function() {
      return {
        ref: function(path) {
          return {
            on: function(event, cb) {
              if (path === '.info/connected') {
                setTimeout(function() { cb({ val: function() { return true; } }); }, 50);
                return function() {};
              }
              if (!window.__listeners[path]) window.__listeners[path] = [];
              window.__listeners[path].push(cb);
              cb({
                val: function() { return _read(path); },
                exists: function() { return _read(path) !== null; }
              });
              return function() {};
            },
            off: function() {},
            once: function(event) {
              return Promise.resolve({
                val: function() { return _read(path); },
                exists: function() { return _read(path) !== null; }
              });
            },
            set: function(data) {
              window.__db[path] = data;
              // Sync parent path if it exists as a nested object
              var segs = path.split('/');
              if (segs.length > 1) {
                var parentPath = segs.slice(0, -1).join('/');
                var childKey = segs[segs.length - 1];
                if (window.__db[parentPath] && typeof window.__db[parentPath] === 'object') {
                  window.__db[parentPath][childKey] = data;
                }
              }
              _notify(path);
              return Promise.resolve();
            },
            update: function(data) {
              // Écriture multi-chemins depuis la racine : Realtime Database
              // interprète alors chaque clé comme un chemin absolu, et applique
              // l'ensemble de façon atomique. Ce double l'ignorait, si bien que
              // toute fonctionnalité écrivant plusieurs nœuds d'un coup —
              // la reconduction, notamment — restait invisible aux tests.
              if (!path) {
                Object.keys(data).forEach(function(chemin) {
                  window.__db[chemin] = data[chemin];
                  var s = chemin.split('/');
                  var parent = s.slice(0, -1).join('/');
                  var cle = s[s.length - 1];
                  if (window.__db[parent] && typeof window.__db[parent] === 'object') {
                    window.__db[parent][cle] = data[chemin];
                  }
                  _notify(chemin);
                  _notify(parent);
                });
                return Promise.resolve();
              }

              if (typeof window.__db[path] !== 'object' || window.__db[path] === null) {
                window.__db[path] = {};
              }
              Object.assign(window.__db[path], data);
              // Sync parent path if it exists as a nested object
              var segs = path.split('/');
              if (segs.length > 1) {
                var parentPath = segs.slice(0, -1).join('/');
                var childKey = segs[segs.length - 1];
                if (window.__db[parentPath] && typeof window.__db[parentPath] === 'object') {
                  if (typeof window.__db[parentPath][childKey] !== 'object' || window.__db[parentPath][childKey] === null) {
                    window.__db[parentPath][childKey] = {};
                  }
                  Object.assign(window.__db[parentPath][childKey], data);
                }
              }
              _notify(path);
              return Promise.resolve();
            },
            push: function() {
              // Clé unique reproductible
              var key = 'ch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
              return {
                key: key,
                set: function(data) {
                  // Stockage hiérarchique : window.__db[parentPath][key] = data
                  if (typeof window.__db[path] !== 'object' || window.__db[path] === null) {
                    window.__db[path] = {};
                  }
                  window.__db[path][key] = data;
                  _notify(path);
                  return Promise.resolve();
                }
              };
            },
            remove: function() {
              delete window.__db[path];
              // Sync parent path if it exists as a nested object
              var segs = path.split('/');
              if (segs.length > 1) {
                var parentPath = segs.slice(0, -1).join('/');
                var childKey = segs[segs.length - 1];
                if (window.__db[parentPath] && typeof window.__db[parentPath] === 'object') {
                  delete window.__db[parentPath][childKey];
                }
              }
              _notify(path);
              return Promise.resolve();
            },
            transaction: function(miseAJour) {
              // Realtime Database applique la fonction a la valeur courante et
              // n'ecrit que si elle rend autre chose qu'undefined. Ce double
              // l'ignorait : la reconduction, qui reserve son empreinte par
              // transaction pour resister a deux ouvertures simultanees,
              // echouait donc silencieusement ici.
              var actuel = _read(path);
              var propose = miseAJour(actuel);

              if (propose === undefined) {
                return Promise.resolve({ committed: false, snapshot: { val: function() { return actuel; } } });
              }

              window.__db[path] = propose;
              var segs = path.split('/');
              if (segs.length > 1) {
                var parent = segs.slice(0, -1).join('/');
                var cle = segs[segs.length - 1];
                if (window.__db[parent] && typeof window.__db[parent] === 'object') {
                  window.__db[parent][cle] = propose;
                }
              }
              _notify(path);
              return Promise.resolve({ committed: true, snapshot: { val: function() { return propose; } } });
            },
            orderByChild: function() { return this; },
            equalTo: function() { return this; }
          };
        }
      };
    },
    auth: function() {
      return {
        onAuthStateChanged: function(cb) {
          window.__mockAuthCallback = cb;
          setTimeout(function() {
            cb({
              uid: 'test-user-123',
              email: '${TEST_EMAIL}',
              displayName: 'Test User',
              photoURL: null
            });
          }, 100);
          return function() {};
        },
        signInWithPopup: function() { return Promise.resolve(); },
        signInWithEmailAndPassword: function() { return Promise.resolve(); },
        createUserWithEmailAndPassword: function() { return Promise.resolve(); },
        signOut: function() {
          if (window.__mockAuthCallback) window.__mockAuthCallback(null);
          return Promise.resolve();
        },
        currentUser: { uid: 'test-user-123', email: '${TEST_EMAIL}' }
      };
    }
  };
  window.firebase.auth.GoogleAuthProvider = function() {};
`;

export async function setupFirebaseMock(page) {
  await page.route('**/firebasejs/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '// Firebase CDN mock'
  }));
  await page.addInitScript(REACTIVE_FIREBASE_MOCK);
}

export async function waitForApp(page) {
  await page.goto('/FairSplit.html');
  await page.waitForSelector('#mainApp', { state: 'visible', timeout: 10000 });
  await page.waitForSelector('body[data-app-ready="true"]', { timeout: 10000 });
}

/**
 * FairSplit - Firebase Initialization
 * @description Initialise Firebase et exporte les références
 */

import {
  FIREBASE_CONFIG,
  USE_EMULATOR,
  EMULATOR_PORTS,
  APP_CHECK_SITE_KEY,
  APP_CHECK_PROVIDER
} from './config.js';
import { log, warn } from './utils/debug.js';
import { noter } from './utils/diagnostics.js';

let app = null;
let database = null;
let auth = null;

/**
 * Initialize Firebase
 * @returns {{app: Object, database: Object, auth: Object}}
 */
export function initFirebase() {
  if (app) {
    return { app, database, auth };
  }

  // Firebase is loaded via CDN, use global firebase object
  if (typeof firebase === 'undefined') {
    throw new Error('Firebase SDK not loaded. Include Firebase scripts before this module.');
  }

  app = firebase.initializeApp(FIREBASE_CONFIG);

  // Avant tout accès : une fois l'attestation exigée côté serveur, une requête
  // partie sans jeton est refusée. Elle s'active donc entre l'initialisation
  // de l'application et la première lecture.
  activateAppCheck();

  database = firebase.database();
  auth = firebase.auth();

  if (USE_EMULATOR) {
    try {
      database.useEmulator('localhost', EMULATOR_PORTS.database);
      auth.useEmulator(`http://localhost:${EMULATOR_PORTS.auth}`);
      log('🧪 Émulateurs Firebase branchés (données locales isolées)');
    } catch (error) {
      warn('⚠️ Émulateurs indisponibles, bascule sur Firebase distant :', error.message);
    }
  }

  log('🔥 Firebase initialisé');

  return { app, database, auth };
}

/**
 * Active App Check, si une clé de site est configurée
 *
 * Les règles de sécurité vérifient *qui* parle ; App Check atteste *d'où*.
 * Sans lui, la clé API publique suffit à marteler `signInWithPassword` sur les
 * comptes du foyer depuis n'importe quel script.
 *
 * Cette fonction ne lève jamais : une attestation impossible à activer ne doit
 * pas empêcher l'application de démarrer. Tant que l'application forcée n'est
 * pas activée dans la console, les requêtes passent — et si elle l'est, le
 * refus viendra du serveur, avec le bandeau « base injoignable » pour le dire.
 * Chaque abandon est journalisé : sans trace, une attestation silencieusement
 * inactive donne l'illusion d'une protection.
 *
 * @returns {boolean} true si l'attestation a été activée
 */
function activateAppCheck() {
  if (USE_EMULATOR) {
    log('🧪 App Check ignoré : les émulateurs n\'exigent aucune attestation');
    return false;
  }

  if (!APP_CHECK_SITE_KEY) {
    warn('⚠️ App Check inactif : APP_CHECK_SITE_KEY est vide (cf. js/config.js). '
      + 'N\'activez pas l\'application forcée dans la console Firebase.');
    noter('appcheck', 'inactif : clé de site absente');
    return false;
  }

  if (typeof firebase.appCheck !== 'function') {
    warn('⚠️ App Check inactif : le SDK n\'est pas chargé (firebase-app-check-compat.js)');
    noter('appcheck', 'inactif : SDK non chargé');
    return false;
  }

  try {
    const fournisseur = APP_CHECK_PROVIDER === 'recaptcha-enterprise'
      ? new firebase.appCheck.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY)
      : new firebase.appCheck.ReCaptchaV3Provider(APP_CHECK_SITE_KEY);

    // Le second argument renouvelle le jeton en arrière-plan : sans lui, une
    // session ouverte plusieurs heures finit par présenter un jeton expiré.
    firebase.appCheck().activate(fournisseur, true);

    log('🛡️ App Check activé');
    noter('appcheck', 'activé', { fournisseur: APP_CHECK_PROVIDER });
    verifierAttestation();
    return true;
  } catch (error) {
    warn('⚠️ App Check non activé :', error.message);
    noter('appcheck', 'activation refusée', { motif: error?.message || String(error) });
    return false;
  }
}

/**
 * Vérifie qu'une attestation s'obtient réellement
 *
 * `activate()` ne dit rien de plus que « la configuration est acceptée ». La
 * console Firebase, elle, comptait zéro requête validée sur cent cinquante-neuf
 * en sept jours : l'attestation était configurée, enregistrée, et n'aboutissait
 * jamais. Rien à l'écran, rien dans le code, ne le disait — et le jour où
 * l'application forcée serait activée, ce serait cent pour cent de refus,
 * immédiatement, pour tout le monde.
 *
 * Ce contrôle demande un jeton et consigne l'issue. Il ne bloque rien et ne
 * lève jamais : son seul objet est de rendre visible un échec silencieux.
 *
 * @returns {void}
 */
function verifierAttestation() {
  let obtention;
  try {
    obtention = firebase.appCheck().getToken(false);
  } catch (error) {
    noter('appcheck', 'jeton refusé à la demande', { motif: error?.message || String(error) });
    return;
  }

  if (!obtention || typeof obtention.then !== 'function') {
    noter('appcheck', 'jeton indisponible : getToken n\'a rien rendu');
    return;
  }

  const debut = Date.now();
  obtention.then(
    // Le jeton lui-même n'est jamais journalisé : c'est un secret de courte
    // durée. Sa longueur suffit à prouver qu'il existe.
    (jeton) => noter('appcheck', 'attestation obtenue', {
      ms: Date.now() - debut,
      taille: jeton && typeof jeton.token === 'string' ? jeton.token.length : 0
    }),
    (erreur) => noter('appcheck', 'attestation impossible', {
      ms: Date.now() - debut,
      motif: erreur?.message || String(erreur)
    })
  );
}

/**
 * Get Firebase database reference
 * @returns {Object}
 */
export function getFirebaseDatabase() {
  if (!database) {
    throw new Error('Firebase not initialized. Call initFirebase() first.');
  }
  return database;
}

/**
 * Get Firebase auth reference
 * @returns {Object}
 */
export function getFirebaseAuth() {
  if (!auth) {
    throw new Error('Firebase not initialized. Call initFirebase() first.');
  }
  return auth;
}

/**
 * Get Google Auth Provider instance
 * @returns {Object} GoogleAuthProvider instance
 */
export function getGoogleAuthProvider() {
  if (typeof firebase === 'undefined') {
    throw new Error('Firebase SDK not loaded.');
  }
  return new firebase.auth.GoogleAuthProvider();
}

/**
 * Check Firebase connection status
 * @param {Function} callback - Called with boolean (isConnected)
 * @returns {Function} Unsubscribe function
 */
export function onConnectionChange(callback) {
  const connectedRef = database.ref('.info/connected');

  const handler = (snap) => {
    callback(snap.val() === true);
  };

  connectedRef.on('value', handler);

  return () => connectedRef.off('value', handler);
}

/**
 * FairSplit - Firebase Initialization
 * @description Initialise Firebase et exporte les références
 */

import { FIREBASE_CONFIG, USE_EMULATOR, EMULATOR_PORTS } from './config.js';
import { log, warn } from './utils/debug.js';

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
 * Get Firebase global object (for compatibility)
 * @returns {Object} Firebase global object
 */
export function getFirebaseGlobal() {
  if (typeof firebase === 'undefined') {
    throw new Error('Firebase SDK not loaded.');
  }
  return firebase;
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

/**
 * FairSplit - Database Abstraction
 * @description Couche d'accès à Firebase Realtime Database
 * @version 3.0.0 - Espace foyer unique
 *
 * Toutes les données vivent sous un espace unique `household/`, partagé par
 * les comptes de la liste blanche.
 *
 * L'architecture précédente scopait chaque nœud par UID et ajoutait une table
 * `partners` redirigeant un « Partner » vers l'espace d'un « Owner ». Elle a
 * été retirée : la liste blanche est figée à deux adresses dans les règles, il
 * n'y a donc aucun cloisonnement à assurer, et l'indirection n'apportait pas
 * une capacité de plus. Elle coûtait en revanche une sémantique trompeuse —
 * `partners/{moi} = X` signifiait « je lis les données de X » alors que
 * l'interface laissait croire à une relation mutuelle — qui a produit des
 * accès rompus.
 *
 * Conséquence : plus rien à configurer. Un compte autorisé se connecte et voit
 * les données du foyer.
 */

import { DB_PATHS, DATA_ROOT } from './config.js';
import { log } from './utils/debug.js';

// Firebase database reference (set after initialization)
let database = null;

// Un utilisateur est-il authentifié ? Sert uniquement de garde-fou : le
// contrôle d'accès réel est assuré par database.rules.json.
let isAuthenticated = false;

/**
 * Initialize database reference
 * @param {Object} db - Firebase database instance
 */
export function initDatabase(db) {
  database = db;
}

/**
 * Enregistre l'état d'authentification (appelé au changement d'état auth)
 * @param {string|null} uid - UID de l'utilisateur, ou null à la déconnexion
 */
export function setAuthenticatedUser(uid) {
  isAuthenticated = Boolean(uid);
  log(isAuthenticated ? '[DB] Utilisateur authentifié' : '[DB] Utilisateur déconnecté');
}

/**
 * Construit un chemin dans l'espace de données courant
 *
 * La racine vaut `household` en usage normal, `sandbox` avec ?sandbox=1.
 *
 * @param {string} path - Chemin relatif (ex. 'salaries', 'periods/2026-01')
 * @returns {string} Chemin absolu (ex. 'household/periods/2026-01')
 */
export function getDataPath(path) {
  if (!isAuthenticated) {
    throw new Error('User not authenticated. Cannot access database.');
  }
  return path ? `${DATA_ROOT}/${path}` : DATA_ROOT;
}

// ===== GENERIC OPERATIONS =====

/**
 * Get data from path
 * @param {string} path - Chemin relatif à l'espace de données
 * @returns {Promise<*>} Data at path
 */
export async function dbGet(path) {
  if (!database) throw new Error('Database not initialized');

  const snapshot = await database.ref(getDataPath(path)).once('value');
  return snapshot.val();
}

/**
 * Set data at path
 * @param {string} path - Chemin relatif à l'espace de données
 * @param {*} data - Data to set
 * @returns {Promise<void>}
 */
export async function dbSet(path, data) {
  if (!database) throw new Error('Database not initialized');

  await database.ref(getDataPath(path)).set(data);
}

/**
 * Update data at path
 * @param {string} path - Chemin relatif à l'espace de données
 * @param {Object} updates - Partial updates
 * @returns {Promise<void>}
 */
export async function dbUpdate(path, updates) {
  if (!database) throw new Error('Database not initialized');

  await database.ref(getDataPath(path)).update(updates);
}

/**
 * Push new data to path with auto-generated key
 * @param {string} path - Chemin relatif à l'espace de données
 * @param {*} data - Data to push
 * @returns {Promise<string>} The generated key
 */
export async function dbPush(path, data) {
  if (!database) throw new Error('Database not initialized');

  const newRef = database.ref(getDataPath(path)).push();
  await newRef.set(data);
  return newRef.key;
}

// ===== REMINDERS =====

/**
 * Load reminder settings
 * @returns {Promise<Object>}
 */
export async function loadReminders() {
  const data = await dbGet(DB_PATHS.REMINDERS);
  return data || {
    finMois: false,
    budget: false,
    budgetAmount: 0,
    reimbursement: false
  };
}

/**
 * Save reminder settings
 * @param {Object} settings
 */
export async function saveReminders(settings) {
  await dbSet(DB_PATHS.REMINDERS, settings);
}

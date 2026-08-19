/**
 * FairSplit - Database Abstraction
 * @description Abstraction layer for Firebase Realtime Database
 * @version 2.0.0 - Multi-user support with UID-based paths
 */

import { DB_PATHS } from './config.js';
import { log, warn } from './utils/debug.js';

// Firebase database reference (set after initialization)
let database = null;

// Current authenticated user ID
let currentUserId = null;

// Owner user ID (may differ from currentUserId if user is a Partner)
let ownerUserId = null;

/**
 * Initialize database reference
 * @param {Object} db - Firebase database instance
 */
export function initDatabase(db) {
  database = db;
}

/**
 * Set current user ID (called on auth state change)
 * @param {string|null} uid - User ID or null if logged out
 */
export async function setCurrentUserId(uid) {
  currentUserId = uid;
  ownerUserId = null;

  if (uid) {
    // Check if this user is a Partner (has an Owner linked)
    await loadPartnerConfig();
    log('[DB] Current user ID set:', uid.substring(0, 8) + '...');
    if (ownerUserId && ownerUserId !== uid) {
      log('[DB] User is Partner, using Owner data:', ownerUserId.substring(0, 8) + '...');
    } else {
      log('[DB] User is Owner');
    }
  } else {
    log('[DB] User logged out');
  }
}

/**
 * Load partner configuration
 * Checks if current user has a partner link (is a Partner accessing Owner data)
 * @private
 */
async function loadPartnerConfig() {
  if (!database || !currentUserId) {
    ownerUserId = null;
    return;
  }

  try {
    const partnerSnapshot = await database.ref(`partners/${currentUserId}`).once('value');
    const linkedOwnerUid = partnerSnapshot.val();

    if (linkedOwnerUid) {
      // Current user is a Partner, use Owner's UID for data access
      ownerUserId = linkedOwnerUid;
    } else {
      // Current user is Owner (or has no partner configured)
      ownerUserId = currentUserId;
    }
  } catch (error) {
    warn('[DB] Could not load partner config:', error);
    ownerUserId = currentUserId; // Fallback to current user
  }
}

/**
 * Build user-scoped path
 * Uses ownerUserId (may be Partner's owner or current user if Owner)
 * @param {string} path - Base path (e.g., 'salaries', 'periods/2026-01')
 * @returns {string} User-scoped path (e.g., 'salaries/uid123', 'periods/uid123/2026-01')
 * @private
 */
export function getUserPath(path) {
  if (!currentUserId) {
    throw new Error('User not authenticated. Cannot access database.');
  }

  // Use ownerUserId (Partner's owner) or currentUserId (if user is Owner)
  const effectiveUid = ownerUserId || currentUserId;

  // Split path to insert UID after the first segment
  const segments = path.split('/');
  const firstSegment = segments[0];
  const rest = segments.slice(1);

  // Build: firstSegment/uid/rest
  return rest.length > 0
    ? `${firstSegment}/${effectiveUid}/${rest.join('/')}`
    : `${firstSegment}/${effectiveUid}`;
}

// ===== GENERIC OPERATIONS =====

/**
 * Get data from path (user-scoped)
 * @param {string} path - Database path (will be scoped to current user)
 * @returns {Promise<*>} Data at path
 */
export async function dbGet(path) {
  if (!database) throw new Error('Database not initialized');

  const userPath = getUserPath(path);
  const snapshot = await database.ref(userPath).once('value');
  return snapshot.val();
}

/**
 * Set data at path (user-scoped)
 * @param {string} path - Database path (will be scoped to current user)
 * @param {*} data - Data to set
 * @returns {Promise<void>}
 */
export async function dbSet(path, data) {
  if (!database) throw new Error('Database not initialized');

  const userPath = getUserPath(path);
  await database.ref(userPath).set(data);
}

/**
 * Update data at path (user-scoped)
 * @param {string} path - Database path (will be scoped to current user)
 * @param {Object} updates - Partial updates
 * @returns {Promise<void>}
 */
export async function dbUpdate(path, updates) {
  if (!database) throw new Error('Database not initialized');

  const userPath = getUserPath(path);
  await database.ref(userPath).update(updates);
}

/**
 * Push new data to path with auto-generated key (user-scoped)
 * @param {string} path - Database path (will be scoped to current user)
 * @param {*} data - Data to push
 * @returns {Promise<string>} The generated key
 */
export async function dbPush(path, data) {
  if (!database) throw new Error('Database not initialized');

  const userPath = getUserPath(path);
  const newRef = database.ref(userPath).push();
  await newRef.set(data);
  return newRef.key;
}

/**
 * Remove data at path (user-scoped)
 * @param {string} path - Database path (will be scoped to current user)
 * @returns {Promise<void>}
 */
export async function dbRemove(path) {
  if (!database) throw new Error('Database not initialized');

  const userPath = getUserPath(path);
  await database.ref(userPath).remove();
}

/**
 * Listen to data changes (user-scoped)
 * @param {string} path - Database path (will be scoped to current user)
 * @param {Function} callback - Callback function(data)
 * @returns {Function} Unsubscribe function
 */
export function dbListen(path, callback) {
  if (!database) throw new Error('Database not initialized');

  const userPath = getUserPath(path);
  const ref = database.ref(userPath);
  const handler = snapshot => callback(snapshot.val());

  ref.on('value', handler);

  // Return unsubscribe function
  return () => ref.off('value', handler);
}

// ===== REMINDERS =====

/**
 * Load reminder settings
 * @returns {Promise<Object>}
 */
export async function loadReminders() {
  // dbGet applique déjà getUserPath() — ne pas le pré-appliquer ici,
  // le chemin deviendrait reminders/{uid}/{uid}.
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
  // dbSet applique déjà getUserPath() — cf. loadReminders().
  await dbSet(DB_PATHS.REMINDERS, settings);
}

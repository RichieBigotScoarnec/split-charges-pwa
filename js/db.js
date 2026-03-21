/**
 * FairSplit - Database Abstraction
 * @description Abstraction layer for Firebase Realtime Database
 * @version 2.0.0 - Multi-user support with UID-based paths
 */

import { DB_PATHS } from './config.js';
import { getState } from './state.js';

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
 * Get database reference
 * @returns {Object} Firebase database
 */
export function getDatabase() {
  return database;
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
    console.log('[DB] Current user ID set:', uid.substring(0, 8) + '...');
    if (ownerUserId && ownerUserId !== uid) {
      console.log('[DB] User is Partner, using Owner data:', ownerUserId.substring(0, 8) + '...');
    } else {
      console.log('[DB] User is Owner');
    }
  } else {
    console.log('[DB] User logged out');
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
    console.warn('[DB] Could not load partner config:', error);
    ownerUserId = currentUserId; // Fallback to current user
  }
}

/**
 * Get current user ID
 * @returns {string|null} Current user ID
 */
export function getCurrentUserId() {
  return currentUserId;
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

// ===== PARTNER MANAGEMENT =====

/**
 * Link a partner to the current user (bidirectional)
 * Owner links Partner, Partner links Owner
 * @param {string} partnerUid - UID of the partner to link
 * @returns {Promise<void>}
 */
export async function linkPartner(partnerUid) {
  if (!database || !currentUserId) {
    throw new Error('User not authenticated');
  }

  if (partnerUid === currentUserId) {
    throw new Error('Cannot link yourself as partner');
  }

  try {
    // Bidirectional link: current user → partner, partner → current user
    const updates = {};
    updates[`partners/${currentUserId}`] = partnerUid;
    updates[`partners/${partnerUid}`] = currentUserId;

    await database.ref().update(updates);

    // Reload partner config to apply changes
    await loadPartnerConfig();

    console.log('[DB] Partner linked:', partnerUid.substring(0, 8) + '...');
  } catch (error) {
    console.error('[DB] Failed to link partner:', error);
    throw error;
  }
}

/**
 * Unlink the current partner
 * @returns {Promise<void>}
 */
export async function unlinkPartner() {
  if (!database || !currentUserId) {
    throw new Error('User not authenticated');
  }

  try {
    // Get current partner UID
    const partnerSnapshot = await database.ref(`partners/${currentUserId}`).once('value');
    const partnerUid = partnerSnapshot.val();

    if (!partnerUid) {
      console.log('[DB] No partner to unlink');
      return;
    }

    // Remove bidirectional link
    const updates = {};
    updates[`partners/${currentUserId}`] = null;
    updates[`partners/${partnerUid}`] = null;

    await database.ref().update(updates);

    // Reload partner config
    ownerUserId = currentUserId; // Reset to self

    console.log('[DB] Partner unlinked');
  } catch (error) {
    console.error('[DB] Failed to unlink partner:', error);
    throw error;
  }
}

/**
 * Get the UID of the linked partner (if any)
 * @returns {Promise<string|null>} Partner UID or null
 */
export async function getPartnerUid() {
  if (!database || !currentUserId) {
    return null;
  }

  try {
    const snapshot = await database.ref(`partners/${currentUserId}`).once('value');
    return snapshot.val();
  } catch (error) {
    console.warn('[DB] Could not get partner UID:', error);
    return null;
  }
}

/**
 * Check if current user is a Partner (accessing Owner's data)
 * @returns {boolean} True if user is Partner
 */
export function isPartner() {
  return ownerUserId !== null && ownerUserId !== currentUserId;
}

/**
 * Get the effective owner UID (current user or partner's owner)
 * @returns {string|null} Owner UID
 */
export function getOwnerUid() {
  return ownerUserId || currentUserId;
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

// ===== SALARIES =====

/**
 * Load salaries
 * @returns {Promise<{vous: number, conjointe: number}>}
 */
export async function loadSalaries() {
  const data = await dbGet(getUserPath(DB_PATHS.SALARIES));
  return data || { vous: 0, conjointe: 0 };
}

/**
 * Save salaries
 * @param {{vous: number, conjointe: number}} salaries
 * @returns {Promise<void>}
 */
export async function saveSalaries(salaries) {
  await dbSet(getUserPath(DB_PATHS.SALARIES), salaries);
}

/**
 * Listen to salary changes
 * @param {Function} callback
 * @returns {Function} Unsubscribe
 */
export function listenSalaries(callback) {
  return dbListen(getUserPath(DB_PATHS.SALARIES), callback);
}

// ===== PERIOD DATA =====

/**
 * Get period path
 * @param {string} period - Period string (YYYY-MM)
 * @returns {string} Database path
 */
function getPeriodPath(period) {
  return getUserPath(`${DB_PATHS.PERIODS}/${period}`);
}

/**
 * Load period data
 * @param {string} period - Period string (YYYY-MM)
 * @returns {Promise<Object>}
 */
export async function loadPeriodData(period) {
  const data = await dbGet(getPeriodPath(period));
  return data || {
    fixedCharges: [],
    variableCharges: [],
    reimbursements: [],
    summary: null
  };
}

/**
 * Save period data
 * @param {string} period - Period string
 * @param {Object} data - Period data
 * @returns {Promise<void>}
 */
export async function savePeriodData(period, data) {
  await dbSet(getPeriodPath(period), data);
}

/**
 * Save fixed charges for period
 * @param {string} period
 * @param {Array} charges
 */
export async function saveFixedCharges(period, charges) {
  await dbSet(`${getPeriodPath(period)}/fixedCharges`, charges);
}

/**
 * Save variable charges for period
 * @param {string} period
 * @param {Array} charges
 */
export async function saveVariableCharges(period, charges) {
  await dbSet(`${getPeriodPath(period)}/variableCharges`, charges);
}

/**
 * Save reimbursements for period
 * @param {string} period
 * @param {Array} reimbursements
 */
export async function saveReimbursements(period, reimbursements) {
  await dbSet(`${getPeriodPath(period)}/reimbursements`, reimbursements);
}

/**
 * Listen to period data changes
 * @param {string} period
 * @param {Function} callback
 * @returns {Function} Unsubscribe
 */
export function listenPeriodData(period, callback) {
  return dbListen(getPeriodPath(period), callback);
}

// ===== SHARE MODE =====

/**
 * Load share mode settings
 * @returns {Promise<{mode: string, customPercents: Object}>}
 */
export async function loadShareMode() {
  const data = await dbGet(getUserPath(DB_PATHS.SHARE_MODE));
  return data || { mode: 'prorata', customPercents: { vous: 50, conjointe: 50 } };
}

/**
 * Save share mode settings
 * @param {string} mode
 * @param {Object} customPercents
 */
export async function saveShareMode(mode, customPercents) {
  await dbSet(getUserPath(DB_PATHS.SHARE_MODE), { mode, customPercents });
}

// ===== REMINDERS =====

/**
 * Load reminder settings
 * @returns {Promise<Object>}
 */
export async function loadReminders() {
  const data = await dbGet(getUserPath(DB_PATHS.REMINDERS));
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
  await dbSet(getUserPath(DB_PATHS.REMINDERS), settings);
}

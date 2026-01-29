/**
 * FairSplit - Database Abstraction
 * @description Abstraction layer for Firebase Realtime Database
 */

import { DB_PATHS } from './config.js';

// Firebase database reference (set after initialization)
let database = null;

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

// ===== GENERIC OPERATIONS =====

/**
 * Get data from path
 * @param {string} path - Database path
 * @returns {Promise<*>} Data at path
 */
export async function dbGet(path) {
  if (!database) throw new Error('Database not initialized');

  const snapshot = await database.ref(path).once('value');
  return snapshot.val();
}

/**
 * Set data at path
 * @param {string} path - Database path
 * @param {*} data - Data to set
 * @returns {Promise<void>}
 */
export async function dbSet(path, data) {
  if (!database) throw new Error('Database not initialized');

  await database.ref(path).set(data);
}

/**
 * Update data at path
 * @param {string} path - Database path
 * @param {Object} updates - Partial updates
 * @returns {Promise<void>}
 */
export async function dbUpdate(path, updates) {
  if (!database) throw new Error('Database not initialized');

  await database.ref(path).update(updates);
}

/**
 * Listen to data changes
 * @param {string} path - Database path
 * @param {Function} callback - Callback function(data)
 * @returns {Function} Unsubscribe function
 */
export function dbListen(path, callback) {
  if (!database) throw new Error('Database not initialized');

  const ref = database.ref(path);
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
  const data = await dbGet(DB_PATHS.SALARIES);
  return data || { vous: 0, conjointe: 0 };
}

/**
 * Save salaries
 * @param {{vous: number, conjointe: number}} salaries
 * @returns {Promise<void>}
 */
export async function saveSalaries(salaries) {
  await dbSet(DB_PATHS.SALARIES, salaries);
}

/**
 * Listen to salary changes
 * @param {Function} callback
 * @returns {Function} Unsubscribe
 */
export function listenSalaries(callback) {
  return dbListen(DB_PATHS.SALARIES, callback);
}

// ===== PERIOD DATA =====

/**
 * Get period path
 * @param {string} period - Period string (YYYY-MM)
 * @returns {string} Database path
 */
function getPeriodPath(period) {
  return `${DB_PATHS.PERIODS}/${period}`;
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
  const data = await dbGet(DB_PATHS.SHARE_MODE);
  return data || { mode: 'prorata', customPercents: { vous: 50, conjointe: 50 } };
}

/**
 * Save share mode settings
 * @param {string} mode
 * @param {Object} customPercents
 */
export async function saveShareMode(mode, customPercents) {
  await dbSet(DB_PATHS.SHARE_MODE, { mode, customPercents });
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

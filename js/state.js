/**
 * FairSplit - State Management
 * @description Gestion d'état centralisée avec pattern Observer
 */

// ===== INITIAL STATE =====
const initialState = {
  // User & Auth
  currentUser: null,
  isAuthenticated: false,

  // Period
  currentPeriod: null,

  // Data
  salaries: { vous: 0, conjointe: 0 },
  fixedCharges: [],
  variableCharges: [],
  reimbursements: [],

  // Share settings
  shareMode: 'prorata',
  customPercents: { vous: 50, conjointe: 50 },

  // UI State
  editingCharge: null,
  quickAddState: {
    selectedCategory: null,
    splitMode: 'prorata',
    gpsLocation: null
  },

  // Reconduction
  previousMonthCharges: [],
  selectedReconductionItems: [],

  // Map
  mapInstance: null,

  // App state
  appInitialized: false,
  isOnline: navigator.onLine
};

// ===== STATE STORE =====
let state = { ...initialState };
const listeners = new Map();

// ===== PUBLIC API =====

/**
 * Get current state value
 * @param {string} key - State key (supports dot notation: 'salaries.vous')
 * @returns {*} State value
 */
export function getState(key) {
  if (!key) return { ...state };

  const keys = key.split('.');
  let value = state;

  for (const k of keys) {
    if (value === undefined || value === null) return undefined;
    value = value[k];
  }

  // Return copy for objects/arrays to prevent mutation
  if (Array.isArray(value)) return [...value];
  if (typeof value === 'object' && value !== null) return { ...value };
  return value;
}

/**
 * Set state value and notify listeners
 * @param {string} key - State key
 * @param {*} value - New value
 */
export function setState(key, value) {
  const keys = key.split('.');

  if (keys.length === 1) {
    state[key] = value;
  } else {
    let current = state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  // Notify listeners
  notifyListeners(key, value);
}

/**
 * Subscribe to state changes
 * @param {string} key - State key to watch
 * @param {Function} callback - Callback function(newValue, key)
 * @returns {Function} Unsubscribe function
 */
export function subscribe(key, callback) {
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key).add(callback);

  // Return unsubscribe function
  return () => {
    listeners.get(key)?.delete(callback);
  };
}

/**
 * Reset state to initial values
 */
export function resetState() {
  state = { ...initialState };
  listeners.forEach((callbacks, key) => {
    callbacks.forEach(cb => cb(getState(key), key));
  });
}

// ===== ARRAY HELPERS =====

/**
 * Add item to array state
 * @param {string} key - Array state key
 * @param {Object} item - Item to add
 */
export function addToArray(key, item) {
  const current = getState(key) || [];
  setState(key, [...current, item]);
}

/**
 * Update item in array state
 * @param {string} key - Array state key
 * @param {number|string} id - Item ID
 * @param {Object} updates - Properties to update
 */
export function updateInArray(key, id, updates) {
  const current = getState(key) || [];
  const updated = current.map(item =>
    item.id === id ? { ...item, ...updates } : item
  );
  setState(key, updated);
}

/**
 * Remove item from array state (soft delete)
 * @param {string} key - Array state key
 * @param {number|string} id - Item ID
 * @param {boolean} hard - If true, remove completely; if false, mark as deleted
 */
export function removeFromArray(key, id, hard = false) {
  const current = getState(key) || [];

  if (hard) {
    setState(key, current.filter(item => item.id !== id));
  } else {
    // Soft delete
    updateInArray(key, id, {
      deleted: true,
      deletedAt: new Date().toISOString()
    });
  }
}

/**
 * Get active items (not soft-deleted)
 * @param {string} key - Array state key
 * @returns {Array} Active items
 */
export function getActiveItems(key) {
  const items = getState(key) || [];
  return items.filter(item => !item.deleted);
}

// ===== PRIVATE HELPERS =====

function notifyListeners(changedKey, newValue) {
  // Notify exact key listeners
  if (listeners.has(changedKey)) {
    listeners.get(changedKey).forEach(cb => cb(newValue, changedKey));
  }

  // Notify parent key listeners (e.g., 'salaries' when 'salaries.vous' changes)
  const parts = changedKey.split('.');
  for (let i = 1; i < parts.length; i++) {
    const parentKey = parts.slice(0, i).join('.');
    if (listeners.has(parentKey)) {
      listeners.get(parentKey).forEach(cb => cb(getState(parentKey), parentKey));
    }
  }

  // Notify wildcard listeners
  if (listeners.has('*')) {
    listeners.get('*').forEach(cb => cb(newValue, changedKey));
  }
}

// ===== INITIALIZE CURRENT PERIOD =====
function initCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  state.currentPeriod = `${year}-${month}`;
}

initCurrentPeriod();

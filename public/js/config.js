/**
 * FairSplit - Configuration
 * @description Constantes et configuration Firebase
 *
 * Un seul environnement Firebase (fairsplit-foyer), une seule branche (main).
 *
 * Le double environnement TEST/PROD a été retiré : il imposait une divergence
 * permanente de ce fichier entre branches, donc un conflit à chaque merge, et
 * la PROD n'a jamais été alimentée (config en placeholders, base désactivée).
 *
 * Pour essayer sans toucher aux données réelles : FairSplit.html?sandbox=1.
 * Isolation plus stricte si la machine le permet : npm run emulators, puis
 * FairSplit.html?emulator=1.
 */

// ===== VERSION =====
export const VERSION = '4.0.0';

// ===== FIREBASE CONFIGURATION =====
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAq6JXMuVeua9xJ2hEw93GFOa_U8XJplgY",
  authDomain: "fairsplit-foyer.firebaseapp.com",
  databaseURL: "https://fairsplit-foyer-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fairsplit-foyer",
  storageBucket: "fairsplit-foyer.firebasestorage.app",
  messagingSenderId: "41121556897",
  appId: "1:41121556897:web:1ac9a7ab86649d489ec3e0"
};

// ===== ESPACE DE DONNÉES =====
// `?sandbox=1` bascule l'application sur un espace isolé, dans le même projet
// Firebase et sous la même liste blanche. Il remplace l'ancienne base de test
// séparée : essayer librement, puis saisir pour de vrai dans l'espace du foyer.
//
// L'émulateur reste préférable sur une machine qui peut l'exécuter, mais il
// exige un JDK 21+ et un port libre — deux conditions non réunies partout.
export const IS_SANDBOX =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('sandbox') === '1';

/** Racine des données : espace du foyer, ou bac à sable isolé */
export const DATA_ROOT = IS_SANDBOX ? 'sandbox' : 'household';

// ===== ÉMULATEUR LOCAL (opt-in) =====
// Activé uniquement via ?emulator=1 dans l'URL : brancher l'émulateur
// automatiquement sur localhost casserait `npm run serve` quand il n'est
// pas lancé.
export const USE_EMULATOR =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('emulator') === '1';

export const EMULATOR_PORTS = { database: 9000, auth: 9099 };

// ===== CATEGORIES =====
export const CATEGORIES = [
  { id: 'courses', icon: '🛒', label: 'Courses', color: '#4caf50' },
  { id: 'maison', icon: '🏠', label: 'Maison', color: '#2196f3' },
  { id: 'essence', icon: '🚗', label: 'Essence', color: '#ff9800' },
  { id: 'restaurant', icon: '🍕', label: 'Restaurant', color: '#e91e63' },
  { id: 'sante', icon: '💊', label: 'Santé', color: '#9c27b0' },
  { id: 'loisirs', icon: '🎮', label: 'Loisirs', color: '#00bcd4' },
  { id: 'transport', icon: '🚌', label: 'Transport', color: '#795548' },
  { id: 'autre', icon: '⚡', label: 'Autre', color: '#607d8b' }
];

// ===== PAYMENT TYPES =====
export const PAYMENT_TYPES = {
  VOUS: 'vous',
  CONJOINTE: 'conjointe',
  PARTAGE: 'partage',
  BOTH: 'both'
};

// ===== SENS D'UN REMBOURSEMENT =====
// Ces valeurs sont écrites en base ET comparées dans les calculs : elles
// doivent aussi être les `value` des <option> du formulaire. L'absence de
// constante partagée avait laissé le HTML dériver vers from-you/from-partner
// pendant que la logique testait encore vous-to-conjointe — donc aucune
// correspondance, et tout remboursement compté à l'envers.
export const REIMBURSEMENT_DIRECTIONS = {
  YOU_TO_PARTNER: 'vous-to-conjointe',
  PARTNER_TO_YOU: 'conjointe-to-vous'
};

// ===== SPLIT MODES =====
export const SPLIT_MODES = {
  PRORATA: 'prorata',
  FIFTY_FIFTY: '50-50',
  CUSTOM: 'custom'
};

// ===== DESTINATIONS DE VIREMENT =====
export const DESTINATIONS = [
  { id: 'env-charges-fixes', label: 'Env. Charges Fixes', icon: '🏦' },
  { id: 'compte-commun', label: 'Compte Commun', icon: '🤝' },
  { id: 'env-ordures', label: 'Env. Ordures', icon: '🗑️' },
  { id: 'env-taxe-fonciere', label: 'Env. Taxe Foncière', icon: '🏡' },
  { id: 'compte-perso', label: 'Compte Perso', icon: '👤' },
  { id: 'autre', label: 'Autre', icon: '📋' }
];

// ===== ACCÈS AUTORISÉS =====
export const ALLOWED_EMAILS = [
  'bigot.richard@gmail.com',
  'cindypepe.cp95@gmail.com'
];

// ===== VALIDATION LIMITS =====
export const LIMITS = {
  MAX_SALARY: 100000,
  MAX_CHARGE: 50000,
  MAX_NAME_LENGTH: 100,
  MAX_NOTE_LENGTH: 500
};

// ===== UI CONSTANTS =====
export const UI = {
  TOAST_DURATION: 3000,
  UNDO_DURATION: 5000,
  DEBOUNCE_DELAY: 300,
  ANIMATION_DURATION: 300
};

// ===== DATABASE PATHS =====
export const DB_PATHS = {
  SALARIES: 'salaries',
  PERIODS: 'periods',
  SHARE_MODE: 'shareMode',
  REMINDERS: 'reminders',
  CUSTOM_CATEGORIES: 'customCategories',
  CUSTOM_DESTINATIONS: 'customDestinations'
};

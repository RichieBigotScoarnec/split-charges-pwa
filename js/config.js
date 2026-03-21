/**
 * FairSplit - Configuration
 * @description Constantes et configuration Firebase
 *
 * Pour basculer entre TEST et PROD :
 *   - Branche develop → ENV = 'TEST'
 *   - Branche main    → ENV = 'PROD'
 * Seule cette ligne change entre les deux branches.
 */

// ===== ENVIRONMENT =====
export const ENV = 'TEST';
export const VERSION = '4.0.0';

// ===== FIREBASE CONFIGURATIONS =====
const FIREBASE_CONFIGS = {
  TEST: {
    apiKey: "AIzaSyAR3tFWBxdMHr27-NOK0jlOyQ8xZoXcVSU",
    authDomain: "fairsplit-test.firebaseapp.com",
    databaseURL: "https://fairsplit-test-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fairsplit-test",
    storageBucket: "fairsplit-test.firebasestorage.app",
    messagingSenderId: "455299346967",
    appId: "1:455299346967:web:7165ac7e84062657632252",
    measurementId: "G-9HW1XN8EF1"
  },
  PROD: {
    apiKey: "VOTRE_CLE_API_PROD",
    authDomain: "fairsplit-prod.firebaseapp.com",
    databaseURL: "https://fairsplit-prod-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fairsplit-prod",
    storageBucket: "fairsplit-prod.firebasestorage.app",
    messagingSenderId: "VOTRE_SENDER_ID_PROD",
    appId: "VOTRE_APP_ID_PROD",
    measurementId: "VOTRE_MEASUREMENT_ID_PROD"
  }
};

export const FIREBASE_CONFIG = FIREBASE_CONFIGS[ENV];

// ===== ENVIRONMENT METADATA =====
export const ENV_META = {
  TEST: {
    title: 'FairSplit TEST - Charges Partagées',
    manifest: 'manifest-test.json',
    icon192: 'icon-192-test.png',
    icon512: 'icon-512-test.png',
    showBadge: true
  },
  PROD: {
    title: 'FairSplit - Charges Partagées',
    manifest: 'manifest.json',
    icon192: 'icon-192.png',
    icon512: 'icon-512.png',
    showBadge: false
  }
};

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
  JOINT: 'joint',
  BOTH: 'both'
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
  { id: 'compte-joint', label: 'Compte Joint', icon: '🤝' },
  { id: 'env-ordures', label: 'Env. Ordures', icon: '🗑️' },
  { id: 'env-taxe-fonciere', label: 'Env. Taxe Foncière', icon: '🏡' },
  { id: 'compte-perso', label: 'Compte Perso', icon: '👤' },
  { id: 'autre', label: 'Autre', icon: '📋' }
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
  REMINDERS: 'reminders'
};

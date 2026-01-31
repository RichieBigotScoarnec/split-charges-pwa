/**
 * FairSplit - Configuration
 * @description Constantes et configuration Firebase
 */

// ===== ENVIRONMENT =====
export const ENV = 'TEST';
export const VERSION = '3.1.0';

// ===== FIREBASE CONFIGURATION =====
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAR3tFWBxdMHr27-NOK0jlOyQ8xZoXcVSU",
  authDomain: "fairsplit-test.firebaseapp.com",
  databaseURL: "https://fairsplit-test-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fairsplit-test",
  storageBucket: "fairsplit-test.firebasestorage.app",
  messagingSenderId: "455299346967",
  appId: "1:455299346967:web:7165ac7e84062657632252",
  measurementId: "G-9HW1XN8EF1"
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

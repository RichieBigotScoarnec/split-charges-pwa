/**
 * FairSplit - Authentication Module
 * @description Gestion de l'authentification Firebase (Google, Email/Password)
 */

import { getFirebaseAuth } from '../firebase-init.js';
import { setState, getState } from '../state.js';
import toast from '../components/toast.js';
import { initPeriod, loadPeriodData } from './period.js';
import { initShareMode, loadShareMode } from './share-mode.js';
import { initVariableCharges, loadVariableCharges } from './variable-charges.js';
import { initFixedCharges, loadFixedCharges } from './fixed-charges.js';
import { initReimbursements, loadReimbursements } from './reimbursements.js';
import { initSummary, calculateSummary } from './summary.js';

let appInitialized = false;

/**
 * Sign in with Google popup
 */
export async function signInWithGoogle() {
  const authErrorEl = document.getElementById('authError');
  if (authErrorEl) authErrorEl.textContent = '';

  try {
    const auth = getFirebaseAuth();
    const googleProvider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(googleProvider);
  } catch (error) {
    const message = `Erreur Google : ${error.message}`;
    if (authErrorEl) authErrorEl.textContent = message;
    toast.error(message);
    console.error('[Auth] Google sign-in error:', error);
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail() {
  const emailEl = document.getElementById('authEmail');
  const passwordEl = document.getElementById('authPassword');
  const authErrorEl = document.getElementById('authError');

  if (authErrorEl) authErrorEl.textContent = '';

  const email = emailEl?.value.trim();
  const password = passwordEl?.value;

  if (!email || !password) {
    const message = 'Email et mot de passe requis.';
    if (authErrorEl) authErrorEl.textContent = message;
    return;
  }

  try {
    const auth = getFirebaseAuth();
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    const message = `Erreur : ${error.message}`;
    if (authErrorEl) authErrorEl.textContent = message;
    toast.error(message);
    console.error('[Auth] Email sign-in error:', error);
  }
}

/**
 * Create new account with email and password
 */
export async function createAccount() {
  const emailEl = document.getElementById('authEmail');
  const passwordEl = document.getElementById('authPassword');
  const authErrorEl = document.getElementById('authError');

  if (authErrorEl) authErrorEl.textContent = '';

  const email = emailEl?.value.trim();
  const password = passwordEl?.value;

  if (!email || !password) {
    const message = 'Email et mot de passe requis.';
    if (authErrorEl) authErrorEl.textContent = message;
    return;
  }

  if (password.length < 6) {
    const message = 'Le mot de passe doit contenir au moins 6 caractères.';
    if (authErrorEl) authErrorEl.textContent = message;
    return;
  }

  try {
    const auth = getFirebaseAuth();
    await auth.createUserWithEmailAndPassword(email, password);
    toast.success('Compte créé avec succès');
  } catch (error) {
    const message = `Erreur : ${error.message}`;
    if (authErrorEl) authErrorEl.textContent = message;
    toast.error(message);
    console.error('[Auth] Account creation error:', error);
  }
}

/**
 * Sign out current user
 */
export async function signOut() {
  try {
    const auth = getFirebaseAuth();
    await auth.signOut();
    toast.info('Déconnecté');
  } catch (error) {
    const message = `Erreur déconnexion : ${error.message}`;
    const authErrorEl = document.getElementById('authError');
    if (authErrorEl) authErrorEl.textContent = message;
    toast.error(message);
    console.error('[Auth] Sign-out error:', error);
  }
}

/**
 * Update UI when user state changes
 * @param {Object|null} user - Firebase user object or null
 */
function updateAuthUI(user) {
  const authOverlay = document.getElementById('authOverlay');
  const mainApp = document.getElementById('mainApp');
  const testBadge = document.getElementById('testEnvironmentBadge');
  const userInfoBar = document.getElementById('userInfoBar');

  if (user) {
    // User authenticated
    if (authOverlay) authOverlay.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
    if (testBadge) testBadge.style.display = 'block';
    if (userInfoBar) userInfoBar.style.display = 'flex';

    // Update user info bar
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');

    if (userNameEl) {
      userNameEl.textContent = user.displayName || user.email || 'Utilisateur';
    }

    if (userAvatarEl) {
      if (user.photoURL) {
        userAvatarEl.src = user.photoURL;
        userAvatarEl.style.display = 'block';
      } else {
        userAvatarEl.style.display = 'none';
      }
    }

    // Clear auth form inputs
    const authEmailEl = document.getElementById('authEmail');
    const authPasswordEl = document.getElementById('authPassword');
    const authErrorEl = document.getElementById('authError');

    if (authEmailEl) authEmailEl.value = '';
    if (authPasswordEl) authPasswordEl.value = '';
    if (authErrorEl) authErrorEl.textContent = '';

    // Save user to global state
    setState('currentUser', {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    });

    console.log(`✅ Utilisateur connecté : ${user.displayName || user.email}`);
  } else {
    // No user - show auth overlay
    if (authOverlay) authOverlay.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
    if (testBadge) testBadge.style.display = 'none';
    if (userInfoBar) userInfoBar.style.display = 'none';

    // Clear global state
    setState('currentUser', null);

    // Reset app initialization flag
    appInitialized = false;

    console.log('⚠️ Utilisateur déconnecté');
  }
}

/**
 * Initialize app data after authentication
 * Called once after first successful auth
 */
async function initializeAppData() {
  if (appInitialized) return;

  console.log('📦 Initialisation des données utilisateur...');

  // Étape 3c : Period management
  initPeriod();
  await loadPeriodData();

  // Étape 3d : Share mode management
  initShareMode();
  await loadShareMode();

  // Étape 3e : Variable charges management
  initVariableCharges();
  await loadVariableCharges();

  // Étape 3f : Fixed charges management
  initFixedCharges();
  await loadFixedCharges();

  // Étape 3g : Reimbursements management
  initReimbursements();
  await loadReimbursements();

  // Étape 3h : Summary/Bilan management
  initSummary();
  calculateSummary();

  appInitialized = true;
  console.log('✅ Données utilisateur initialisées');
}

/**
 * Initialize authentication listener
 * Sets up onAuthStateChanged to handle user login/logout
 */
export function initAuth() {
  const auth = getFirebaseAuth();

  auth.onAuthStateChanged(async (user) => {
    console.log('[Auth] État changé:', user ? user.email : 'Déconnecté');

    // Update UI
    updateAuthUI(user);

    // Initialize app data if user just logged in
    if (user && !appInitialized) {
      await initializeAppData();
    }

    // If user logged out, reset app state
    if (!user) {
      // TODO Étape 3c-3h : Réinitialiser les données
      // - variableCharges = []
      // - fixedCharges = []
      // - reimbursements = []
      // - salaries = { vous: 0, conjointe: 0 }
      // - searchInput.value = ''
    }
  });

  // Expose auth functions globally for onclick handlers (legacy HTML compatibility)
  window.signInWithGoogle = signInWithGoogle;
  window.signInWithEmail = signInWithEmail;
  window.createAccount = createAccount;
  window.signOut = signOut;

  console.log('🔐 Authentification initialisée');
}

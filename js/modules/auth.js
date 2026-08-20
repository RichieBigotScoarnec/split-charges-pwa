/**
 * FairSplit - Authentication Module
 * @description Gestion de l'authentification Firebase (Google, Email/Password)
 */

import { getFirebaseAuth, getGoogleAuthProvider } from '../firebase-init.js';
import { setState } from '../state.js';
import { toast } from '../components/toast.js';
import { ALLOWED_EMAILS } from '../config.js';
import { initPeriod, loadPeriodData, backfillPeriodSalaries } from './period.js';
import { initShareMode, loadShareMode } from './share-mode.js';
import { initVariableCharges, loadVariableCharges } from './variable-charges.js';
import { initFixedCharges, loadFixedCharges } from './fixed-charges.js';
import { initReimbursements, loadReimbursements } from './reimbursements.js';
import { initSummary, calculateSummary } from './summary.js';
import { initSearch } from './search.js';
import { initExport } from './export.js';
import { initNotifications, cleanupNotifications } from './notifications.js';
import { initCategories } from './categories.js';
import { initTrends } from './trends.js';
import { initReconduction } from './reconduction.js';
import { initQuickAdd, cleanupQuickAdd } from './quick-add.js';
import { initMap, cleanupMap } from './map.js';
import { initCustomLists, populateAllSelects } from './custom-lists.js';
import { cleanupModals } from '../components/modal.js';
import { log, warn, error as logError } from '../utils/debug.js';

let appInitialized = false;

// ✅ FIX CRITIQUE 2: Stocker l'unsubscribe function pour éviter fuite mémoire
let authUnsubscribe = null;

// Guard against concurrent popup calls
let signInPending = false;

/**
 * Sign in with Google popup
 */
export async function signInWithGoogle() {
  if (signInPending) {
    log('[Auth] ⏳ signInWithPopup déjà en cours, ignoré');
    return;
  }

  log('[Auth] 🔵 signInWithGoogle() appelé');
  signInPending = true;

  const authErrorEl = document.getElementById('authError');
  if (authErrorEl) authErrorEl.textContent = '';

  try {
    const auth = getFirebaseAuth();
    const googleProvider = getGoogleAuthProvider();

    log('[Auth] 🔵 Lancement signInWithPopup...');
    await auth.signInWithPopup(googleProvider);
    log('[Auth] ✅ Connexion Google réussie !');
  } catch (error) {
    // Ignore cancelled-popup-request (user opened a new popup or clicked again)
    if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
      warn('[Auth] ⚠️ Popup annulé/fermé:', error.code);
    } else {
      logError('[Auth] ❌ ERREUR Google sign-in:', error);
      const message = `Erreur Google : ${error.message}`;
      if (authErrorEl) authErrorEl.textContent = message;
      toast.error(message);
    }
  } finally {
    signInPending = false;
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
    logError('[Auth] Email sign-in error:', error);
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
    logError('[Auth] Account creation error:', error);
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
    logError('[Auth] Sign-out error:', error);
  }
}

/**
 * Update UI when user state changes
 * @param {Object|null} user - Firebase user object or null
 */
function updateAuthUI(user) {
  const authOverlay = document.getElementById('authOverlay');
  const mainApp = document.getElementById('mainApp');
  const userInfoBar = document.getElementById('userInfoBar');

  if (user) {
    // User authenticated
    if (authOverlay) authOverlay.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
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
        userAvatarEl.alt = `Photo de profil de ${user.displayName || user.email || 'utilisateur'}`;
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

    log(`✅ Utilisateur connecté : ${user.displayName || user.email}`);
  } else {
    // No user - show auth overlay
    if (authOverlay) authOverlay.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
    if (userInfoBar) userInfoBar.style.display = 'none';

    // Clear global state
    setState('currentUser', null);

    // Reset app initialization flag
    appInitialized = false;

    log('⚠️ Utilisateur déconnecté');
  }
}

/**
 * Initialize app data after authentication
 * Called once after first successful auth
 */
async function initializeAppData() {
  if (appInitialized) return;

  log('📦 Initialisation des données utilisateur...');

  try {
  // Custom lists (categories/destinations) — must init before modules using selects
  await initCustomLists();
  populateAllSelects();

  // Étape 3c : Period management
  initPeriod();
  // Fige les salaires des périodes antérieures aux instantanés, avant tout
  // calcul : sinon le premier bilan affiché serait encore rétro-actif.
  await backfillPeriodSalaries();
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

  // Étape 4a : Search module
  initSearch();

  // Étape 4b : Export module
  initExport();

  // Étape 4c : Notifications module
  initNotifications();

  // Étape 4d : Categories analysis module
  initCategories();

  // Étape 4e : Trends module
  initTrends();

  // Étape 4f : Reconduction module
  initReconduction();

  // Étape 4g : Quick Add module
  initQuickAdd();

  // Étape 4h : Map module
  initMap();

  appInitialized = true;
  log('✅ Données utilisateur initialisées');
  } catch (error) {
    logError('❌ Erreur initialisation modules:', error);
    toast.error('Erreur lors du chargement des données');
  }
}

/**
 * Initialize authentication listener
 * Sets up onAuthStateChanged to handle user login/logout
 */
export function initAuth() {
  const auth = getFirebaseAuth();

  // ✅ FIX CRITIQUE 2: Nettoyer l'ancien listener s'il existe
  if (authUnsubscribe) {
    authUnsubscribe();
    log('[Auth] 🧹 Ancien listener nettoyé');
  }

  // ✅ FIX CRITIQUE 2: Stocker la fonction unsubscribe
  authUnsubscribe = auth.onAuthStateChanged(async (user) => {
    log('[Auth] État changé:', user ? user.email : 'Déconnecté');

    // Vérification whitelist — refuser tout compte non autorisé
    if (user && !ALLOWED_EMAILS.includes(user.email)) {
      warn('[Auth] ⛔ Accès refusé pour :', user.email);
      const authErrorEl = document.getElementById('authError');
      if (authErrorEl) authErrorEl.textContent = 'Accès non autorisé. Ce compte n\'est pas autorisé à utiliser cette application.';
      await auth.signOut();
      return;
    }

    // Update UI immediately (don't wait for DB)
    updateAuthUI(user);

    // Set current user ID for multi-user database structure
    const { setAuthenticatedUser } = await import('../db.js');
    setAuthenticatedUser(user ? user.uid : null);

    // Initialize app data if user just logged in
    if (user && !appInitialized) {
      await initializeAppData();
    }

    // If user logged out, cleanup and reset app state
    if (!user) {
      // Libérer les ressources encore actives : intervalle horaire et timeout
      // quotidien des notifications, écouteurs keydown, polling GPS de fond et
      // instance Leaflet. Ces fonctions étaient importées mais jamais appelées :
      // tout continuait de tourner après déconnexion, et se cumulait à la
      // reconnexion suivante.
      cleanupNotifications();
      cleanupQuickAdd();
      cleanupMap();
      cleanupModals();

      // ✅ FIX: Reset user data on logout for security/privacy
      const { resetUserData } = await import('../state.js');
      resetUserData();

      // Clear UI elements
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';

      // Clear displayed lists (the modules will handle re-rendering on next login)
      const variableChargesList = document.getElementById('variableChargesList');
      const fixedChargesList = document.getElementById('fixedChargesList');
      const reimbursementsList = document.getElementById('reimbursementsList');
      const summarySection = document.getElementById('summarySection');

      if (variableChargesList) variableChargesList.innerHTML = '<p class="empty-state">Connectez-vous pour voir vos charges</p>';
      if (fixedChargesList) fixedChargesList.innerHTML = '<p class="empty-state">Connectez-vous pour voir vos charges</p>';
      if (reimbursementsList) reimbursementsList.innerHTML = '<p class="empty-state">Connectez-vous pour voir vos remboursements</p>';
      if (summarySection) summarySection.innerHTML = '<p class="empty-state">Connectez-vous pour voir le bilan</p>';

      log('🔒 User logged out, data cleared');
    }
  });

  // Expose auth functions globally for onclick handlers (legacy HTML compatibility)
  // Uses _prefixed names to delegate from inline stubs defined in HTML
  window._signInWithGoogle = signInWithGoogle;
  window._signInWithEmail = signInWithEmail;
  window._createAccount = createAccount;
  window.signInWithGoogle = signInWithGoogle;
  window.signInWithEmail = signInWithEmail;
  window.createAccount = createAccount;
  window.signOut = signOut;

  log('🔐 Authentification initialisée');
}

/**
 * ✅ FIX CRITIQUE 2: Cleanup authentication listener
 * Call this when you need to explicitly remove the auth listener
 * (e.g., during app shutdown or hot module reload)
 */
export function cleanupAuth() {
  if (authUnsubscribe) {
    authUnsubscribe();
    authUnsubscribe = null;
    log('[Auth] 🧹 Listener d\'authentification nettoyé');
  }
}

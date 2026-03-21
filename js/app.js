/**
 * FairSplit - Main Application Entry Point
 * @description Initialise l'application et coordonne les modules
 */

import { ENV, VERSION, ENV_META } from './config.js';
import { initFirebase, onConnectionChange } from './firebase-init.js';
import { initDatabase } from './db.js';
import { setState, getState } from './state.js';
import { initModals } from './components/modal.js';
import { toast } from './components/toast.js';
import { initAuth } from './modules/auth.js';

// Modules migrated (initialized by auth.js after login):
// - period.js (Étape 3c) ✅
//
// Will be imported as modules are migrated (Étape 3d-3h)
// import { initSalaires } from './modules/salaires.js';
// import { initCharges } from './modules/charges.js';
// etc.

// ✅ FIX CRITIQUE 5: Stocker l'unsubscribe function pour le listener de connexion
let connectionUnsubscribe = null;

/**
 * Apply environment-specific metadata (title, manifest, icons, badge)
 * Allows a single HTML file to serve both TEST and PROD environments
 */
function applyEnvironment() {
  const meta = ENV_META[ENV];
  if (!meta) return;

  // Page title
  document.title = meta.title;

  // Manifest link
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) manifestLink.href = meta.manifest;

  // Icon 192
  const iconLink = document.querySelector('link[rel="icon"][sizes="192x192"]');
  if (iconLink) iconLink.href = meta.icon192;

  // Apple touch icon
  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (appleIcon) appleIcon.href = meta.icon192;

  // Meta description
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) {
    descMeta.content = ENV === 'TEST'
      ? 'FairSplit TEST - Partage équitable des charges au prorata des salaires'
      : 'FairSplit - Partage équitable des charges au prorata des salaires';
  }

  // Test environment badge visibility
  const testBadge = document.getElementById('testEnvironmentBadge');
  if (testBadge) {
    testBadge.style.display = meta.showBadge ? '' : 'none';
  }
}

/**
 * Initialize the application
 */
async function initApp() {
  console.log(`🚀 FairSplit ${VERSION} (${ENV})`);

  // 0. Apply environment metadata (title, manifest, icons, badge)
  applyEnvironment();

  try {
    // 1. Initialize Firebase
    const { database } = initFirebase();
    initDatabase(database);

    // 2. Setup connection monitoring
    // ✅ FIX CRITIQUE 5: Stocker l'unsubscribe function
    connectionUnsubscribe = onConnectionChange((isConnected) => {
      setState('isOnline', isConnected);
      console.log(isConnected ? '✅ Firebase: CONNECTÉ' : '⚠️ Firebase: DÉCONNECTÉ');
    });
    // Store for potential cleanup (not needed for SPA lifecycle)
    window._unsubscribeConnection = connectionUnsubscribe;

    // 3. Initialize UI components
    initModals();

    // 4. Initialize authentication
    initAuth();

    // 5. Mark app as initialized
    setState('appInitialized', true);

    toast.success('FairSplit chargé');

  } catch (error) {
    console.error('❌ Erreur initialisation:', error);
    toast.error('Erreur de chargement');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/**
 * ✅ FIX CRITIQUE 5: Cleanup application listeners
 * Call this when you need to explicitly remove all app listeners
 * (e.g., during app shutdown or hot module reload)
 */
export async function cleanupApp() {
  // Cleanup connection listener
  if (connectionUnsubscribe) {
    connectionUnsubscribe();
    connectionUnsubscribe = null;
    console.log('[App] 🧹 Listener de connexion Firebase nettoyé');
  }

  // Cleanup auth listener
  const { cleanupAuth } = await import('./modules/auth.js');
  cleanupAuth();
}

// Export for potential external use
export { initApp };

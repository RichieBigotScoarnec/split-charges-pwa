/**
 * FairSplit - Main Application Entry Point
 * @description Initialise l'application et coordonne les modules
 */

import { VERSION } from './config.js';
import { initFirebase, onConnectionChange } from './firebase-init.js';
import { initDatabase } from './db.js';
import { setState } from './state.js';
import { initModals } from './components/modal.js';
import { toast } from './components/toast.js';
import { initAuth } from './modules/auth.js';
import { log, error as logError } from './utils/debug.js';

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
 * Initialize the application
 */
async function initApp() {
  log(`🚀 FairSplit ${VERSION}`);

  try {
    // 1. Initialize Firebase
    const { database } = initFirebase();
    initDatabase(database);

    // 2. Setup connection monitoring
    // ✅ FIX CRITIQUE 5: Stocker l'unsubscribe function
    connectionUnsubscribe = onConnectionChange((isConnected) => {
      setState('isOnline', isConnected);
      log(isConnected ? '✅ Firebase: CONNECTÉ' : '⚠️ Firebase: DÉCONNECTÉ');
    });

    // 3. Initialize UI components
    initModals();

    // 4. Initialize authentication
    initAuth();

    // 5. Mark app as initialized
    setState('appInitialized', true);

    toast.success('FairSplit chargé');

  } catch (error) {
    logError('❌ Erreur initialisation:', error);
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
    log('[App] 🧹 Listener de connexion Firebase nettoyé');
  }

  // Cleanup auth listener
  const { cleanupAuth } = await import('./modules/auth.js');
  cleanupAuth();
}

// Export for potential external use
export { initApp };

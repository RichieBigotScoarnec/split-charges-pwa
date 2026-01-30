/**
 * FairSplit - Main Application Entry Point
 * @description Initialise l'application et coordonne les modules
 */

import { ENV, VERSION } from './config.js';
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

/**
 * Initialize the application
 */
async function initApp() {
  console.log(`🚀 FairSplit ${VERSION} (${ENV})`);

  try {
    // 1. Initialize Firebase
    const { database } = initFirebase();
    initDatabase(database);

    // 2. Setup connection monitoring
    onConnectionChange((isConnected) => {
      setState('isOnline', isConnected);
      console.log(isConnected ? '✅ Firebase: CONNECTÉ' : '⚠️ Firebase: DÉCONNECTÉ');
    });

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

// Export for potential external use
export { initApp };

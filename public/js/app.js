/**
 * FairSplit - Main Application Entry Point
 * @description Initialise l'application et coordonne les modules
 */

import { VERSION, IS_SANDBOX, DATA_ROOT } from './config.js';
import { showSandboxBanner } from './utils/sandbox-banner.js';
import { refreshConnectionBanner } from './utils/connection-banner.js';
import { initFirebase, onConnectionChange } from './firebase-init.js';
import { initDatabase } from './db.js';
import { setState } from './state.js';
import { initModals } from './components/modal.js';
import { toast } from './components/toast.js';
import { initAuth, revelerFormulaireConnexion } from './modules/auth.js';
import { log, error as logError } from './utils/debug.js';
import { initDiagnostics, noter } from './utils/diagnostics.js';

/**
 * Initialize the application
 */
async function initApp() {
  // Ouvert en tout premier : ce qu'on cherche à comprendre s'est produit
  // pendant l'initialisation, et une panne d'appareil ne se raconte pas.
  initDiagnostics();
  noter('demarrage', `FairSplit ${VERSION}`);

  log(`🚀 FairSplit ${VERSION} — espace « ${DATA_ROOT} »`);

  // Repère permanent : sans lui, rien ne distingue un essai des vraies données.
  // Un compte cantonné au bac à sable le fera poser après connexion, son
  // adresse n'étant pas connue ici.
  if (IS_SANDBOX) showSandboxBanner();

  try {
    // 1. Initialize Firebase
    const { database } = initFirebase();
    initDatabase(database);

    // 2. Surveillance de la liaison
    // Écoute maintenue pour la durée de vie de la page : l'application est
    // mono-page, il n'existe pas de point de démontage.
    onConnectionChange((isConnected) => {
      setState('isOnline', isConnected);
      log(isConnected ? '✅ Firebase: CONNECTÉ' : '⚠️ Firebase: DÉCONNECTÉ');
      // L'état n'était jusqu'ici que consigné : rien à l'écran ne distinguait
      // « ce mois est vide » de « je ne peux pas lire ce mois ». Une base
      // injoignable renvoyait un écran vide crédible et avalait les saisies.
      refreshConnectionBanner(isConnected);
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
    // L'échec peut précéder `initAuth`, donc son propre garde-fou : sans cela
    // l'écran resterait sur « Connexion… », sans commande ni explication.
    revelerFormulaireConnexion();
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

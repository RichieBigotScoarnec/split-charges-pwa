/**
 * FairSplit - Main Application Entry Point
 * @description Initialise l'application et coordonne les modules
 */

import { VERSION, IS_SANDBOX, DATA_ROOT } from './config.js';
import { showSandboxBanner } from './utils/sandbox-banner.js';
import { refreshConnectionBanner, initConnectionBanner } from './utils/connection-banner.js';
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

    // Au retour de veille, la reconnexion est normale : la temporisation du
    // bandeau repart, au lieu de se conclure sur du temps passé en veille.
    initConnectionBanner();

    // 3. Initialize UI components
    initModals();

    // 4. Initialize authentication
    initAuth();

    // 5. Mark app as initialized
    setState('appInitialized', true);

    // Aucune confirmation ici. « FairSplit chargé » s'affichait à cette ligne,
    // qui ne marque que la pose de l'écouteur d'authentification : Firebase
    // n'a encore rien répondu, aucune donnée n'est lue. Le message paraissait
    // donc par-dessus l'écran d'attente, à côté de « Connexion… » — deux
    // affirmations contraires dans le même coup d'œil, la fausse étant la
    // rassurante. La confirmation est émise là où elle est vraie : à la fin de
    // `initializeAppData`, quand les données du mois sont effectivement là.

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

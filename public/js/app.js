/**
 * FairSplit - Main Application Entry Point
 * @description Initialise l'application et coordonne les modules
 */

import { VERSION, IS_SANDBOX, DATA_ROOT } from './config.js';
import { showSandboxBanner } from './utils/sandbox-banner.js';
import { refreshConnectionBanner, initConnectionBanner, majSaisiesEnAttente } from './utils/connection-banner.js';
import { initFirebase, onConnectionChange } from './firebase-init.js';
import {
  initDatabase,
  signalerLiaison,
  saisiesEnAttente,
  rejouerFileDAttente,
  surFileModifiee,
  surLiaisonRetablie,
  retenterLaLiaison
} from './db.js';
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

    // Le bandeau suit la file : une saisie de plus pendant la coupure doit se
    // voir tout de suite, alors qu'aucun événement de connexion ne survient.
    surFileModifiee(majSaisiesEnAttente);

    // Une reprise réussie referme le bandeau et vide la file, exactement comme
    // le ferait une reconnexion annoncée par Firebase. C'est le seul moyen de
    // sortir du hors-ligne quand `.info/connected` reste faux alors que la base
    // répond — le cas qui a duré des heures.
    surLiaisonRetablie(() => {
      refreshConnectionBanner(true, saisiesEnAttente());
      synchroniserLesSaisies();
    });

    // 2. Surveillance de la liaison
    // Écoute maintenue pour la durée de vie de la page : l'application est
    // mono-page, il n'existe pas de point de démontage.
    onConnectionChange((isConnected) => {
      setState('isOnline', isConnected);
      log(isConnected ? '✅ Firebase: CONNECTÉ' : '⚠️ Firebase: DÉCONNECTÉ');

      // `db.js` doit l'apprendre avant tout le reste : c'est ce qui lui permet
      // de servir le miroir et de mettre les saisies en file sans attendre dix
      // puis quinze secondes à chaque opération.
      signalerLiaison(isConnected);

      // L'état n'était jusqu'ici que consigné : rien à l'écran ne distinguait
      // « ce mois est vide » de « je ne peux pas lire ce mois ». Une base
      // injoignable renvoyait un écran vide crédible et avalait les saisies.
      refreshConnectionBanner(isConnected, saisiesEnAttente());

      if (isConnected) synchroniserLesSaisies();
    });

    // Au retour de veille, la reconnexion est normale : la temporisation du
    // bandeau repart, au lieu de se conclure sur du temps passé en veille.
    initConnectionBanner(retenterLaLiaison);

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

/**
 * Envoie les saisies gardées sur l'appareil, à la reconnexion
 *
 * Ne recharge pas la page et ne redemande rien : les modules affichent déjà
 * ces saisies, `db.js` les leur ayant appliquées à la lecture. Le rejeu ne
 * fait que rendre vrai côté serveur ce qui est vrai à l'écran depuis la
 * coupure.
 *
 * Le silence est la règle quand la file est vide : une reconnexion se produit
 * à chaque sortie de veille, et un message à chacune finirait par masquer le
 * seul qui compte.
 *
 * @returns {Promise<void>}
 */
async function synchroniserLesSaisies() {
  const { envoyees, restantes, erreur } = await rejouerFileDAttente();

  if (envoyees > 0) {
    toast.success(envoyees === 1
      ? '1 saisie enregistrée'
      : `${envoyees} saisies enregistrées`);
    noter('hors-ligne', 'file rejouée', { envoyees, restantes });
  }

  // `erreur` distingue « on a essayé et ça a résisté » de « on n'a pas encore
  // essayé » — la session n'est pas toujours rétablie quand la liaison
  // s'établit. Sans cette nuance, chaque ouverture avec une file non vide
  // annoncerait un échec inexistant.
  if (restantes > 0 && erreur) {
    // La file résiste : le dire, plutôt que laisser le bandeau disparaître
    // avec la reconnexion en emportant le compte des saisies restées à quai.
    toast.error(restantes === 1
      ? '1 saisie n\'a pas pu être enregistrée'
      : `${restantes} saisies n'ont pas pu être enregistrées`);
    logError('❌ Rejeu incomplet :', erreur);
  }

  refreshConnectionBanner(true, restantes);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Export for potential external use
export { initApp };

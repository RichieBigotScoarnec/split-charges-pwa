/**
 * FairSplit - Authentication Module
 * @description Gestion de l'authentification Firebase (Google, Email/Password)
 */

import { getFirebaseAuth, getGoogleAuthProvider } from '../firebase-init.js';
import { setState } from '../state.js';
import { toast } from '../components/toast.js';
import { ALLOWED_EMAILS, SIGNUP_ENABLED, resolveDataRoot } from '../config.js';
import { initPeriod, loadPeriodData, backfillPeriodSalaries } from './period.js';
import { initShareMode, loadShareMode } from './share-mode.js';
import { initVariableCharges, loadVariableCharges } from './variable-charges.js';
import { initFixedCharges, loadFixedCharges } from './fixed-charges.js';
import { initReimbursements, loadReimbursements } from './reimbursements.js';
import { initSummary, calculateSummary } from './summary.js';
import { initSearch } from './search.js';
import { initExport } from './export.js';
import { initNotifications, cleanupNotifications } from './notifications.js';
import { initTrends } from './trends.js';
import { initReconduction } from './reconduction.js';
import { initQuickAdd, cleanupQuickAdd } from './quick-add.js';
import { initMap, cleanupMap } from './map.js';
import { initCustomLists, populateAllSelects } from './custom-lists.js';
import { cleanupModals } from '../components/modal.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { noter } from '../utils/diagnostics.js';

let appInitialized = false;

// Conservée pour être appelée avant d'en poser un nouveau : sans cela, deux
// écouteurs d'authentification coexistaient.
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
  // Le bouton est masqué, mais la fonction reste jointe depuis la console :
  // la garde appartient ici, pas seulement au balisage.
  if (!SIGNUP_ENABLED) {
    const el = document.getElementById('authError');
    if (el) el.textContent = "La création de compte n'est pas ouverte sur cette instance.";
    return;
  }

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
 * Délai au-delà duquel l'attente est signalée comme anormalement longue.
 *
 * Ce délai ne décide plus de l'affichage du formulaire. Il le proposait, et
 * c'était une erreur : sur un téléphone, la restauration de session dépasse
 * régulièrement six secondes — depuis l'activation d'App Check, une
 * attestation reCAPTCHA s'ajoute avant le premier accès. Le formulaire
 * apparaissait donc alors que la session était valide, et l'application
 * s'ouvrait seule un instant plus tard. On croyait avoir été déconnecté.
 */
const DELAI_ATTENTE_AUTH = 6000;

/**
 * Rend l'écran de connexion utilisable.
 *
 * Il part en attente — logo et nom seuls — et ne propose ses commandes qu'une
 * fois qu'on sait qu'elles servent à quelque chose : quand Firebase annonce
 * que personne n'est connecté, quand l'initialisation échoue, ou quand la
 * personne le demande. Sans effet la deuxième fois.
 */
export function revelerFormulaireConnexion() {
  const authOverlay = document.getElementById('authOverlay');
  if (authOverlay) authOverlay.classList.remove('auth-overlay--attente');
}

/**
 * Signale une attente anormalement longue, sans rien affirmer.
 *
 * L'écran reste en attente : il dit que c'est long et offre d'ouvrir le
 * formulaire à la demande. Une issue, donc, mais pas un état — quelqu'un dont
 * la session est valide ne doit jamais lire qu'il est déconnecté.
 */
function signalerAttenteLongue() {
  const authOverlay = document.getElementById('authOverlay');
  if (authOverlay) authOverlay.classList.add('auth-overlay--lent');
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
    // hidden plutôt qu'un style en ligne : celui-ci écraserait le
    // display: grid de la mise en page deux colonnes (>= 900 px).
    if (mainApp) mainApp.hidden = false;
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
    // Firebase a répondu, et il n'y a personne : le formulaire a lieu d'être.
    revelerFormulaireConnexion();
    if (mainApp) mainApp.hidden = true;
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
/**
 * Exécute une étape d'initialisation en isolant son échec
 *
 * Toute la séquence tenait auparavant dans un seul try/catch : l'échec du
 * premier `await` — le chargement des listes personnalisées — empêchait
 * silencieusement tout le reste, salaires et charges compris, avec pour seul
 * retour un toast générique. Un module défaillant ne doit pas en emporter
 * quinze, et le message doit nommer le coupable.
 *
 * @param {string} name - Nom de l'étape, affiché en cas d'échec
 * @param {Function} fn - Fonction à exécuter (peut être asynchrone)
 * @param {string[]} failures - Accumulateur des étapes en échec
 */
async function runStep(name, fn, failures) {
  const debut = Date.now();
  try {
    await fn();
    noter('init', `étape réussie : ${name}`, { ms: Date.now() - debut });
  } catch (error) {
    failures.push(name);
    logError(`❌ Étape « ${name} » échouée :`, error?.code || '', error?.message || error);
    // Le bandeau rouge nomme bien les étapes en échec, mais il disparaît et
    // personne ne le recopie. Le journal en garde la trace avec le motif — la
    // seule chose qui permette de comprendre après coup, depuis un téléphone
    // où la console est hors d'atteinte.
    noter('init', `étape ÉCHOUÉE : ${name}`, {
      ms: Date.now() - debut,
      code: error?.code || undefined,
      motif: error?.message || String(error),
      origine: typeof error?.stack === 'string' ? error.stack.split('\n')[1]?.trim() : undefined
    });
  }
}

async function initializeAppData() {
  if (appInitialized) return;

  log('📦 Initialisation des données utilisateur...');
  const failures = [];

  // Le sélecteur de mois se calcule à partir de la date courante, sans aucune
  // lecture en base. Il passe donc en premier et hors de toute étape réseau :
  // même base injoignable, l'utilisateur garde sa navigation entre les mois.
  // L'ordre inverse rendait la navigation otage d'un incident de connexion.
  await runStep('sélecteur de période', () => initPeriod(), failures);

  // Les listes personnalisées alimentent les <select> des autres modules :
  // elles restent en tête des étapes réseau, mais leur échec ne bloque plus
  // la suite.
  await runStep('listes personnalisées', async () => {
    await initCustomLists();
    populateAllSelects();
  }, failures);

  // Le mode de partage et le report sont des entrées de tout calcul de solde :
  // ils précèdent le chargement des données du mois. Chargé après, le mode de
  // partage laissait le premier bilan se calculer au prorata par défaut.
  await runStep('mode de partage', async () => {
    initShareMode();
    await loadShareMode();
  }, failures);

  await runStep('report du solde', async () => {
    const { initCarryOver } = await import('./carry-over.js');
    await initCarryOver();
  }, failures);

  // Aucune lecture : la corbeille se peuple à partir de ce que les chargeurs
  // recueillent au passage. Elle précède donc leur exécution.
  await runStep('corbeille', async () => {
    const { initTrash } = await import('./trash.js');
    initTrash();
  }, failures);

  // Les prénoms nomment les emplacements partout à l'écran : ils précèdent
  // tout rendu, sinon l'interface afficherait d'abord les libellés d'origine.
  await runStep('prénoms des membres', async () => {
    const { initMembers } = await import('./members.js');
    await initMembers();
  }, failures);

  // Ne lit rien non plus : la sauvegarde n'interroge la base qu'au moment où
  // l'utilisateur la demande.
  await runStep('sauvegarde', async () => {
    const { initBackup } = await import('./backup.js');
    initBackup();
  }, failures);

  await runStep('salaires de la période', async () => {
    // Fige les salaires des périodes antérieures aux instantanés, avant tout
    // calcul : sinon le premier bilan affiché serait encore rétro-actif.
    await backfillPeriodSalaries();
    await loadPeriodData();
  }, failures);

  await runStep('charges variables', async () => {
    initVariableCharges();
    await loadVariableCharges();
  }, failures);

  await runStep('charges fixes', async () => {
    initFixedCharges();
    await loadFixedCharges();
  }, failures);

  await runStep('remboursements', async () => {
    initReimbursements();
    await loadReimbursements();
  }, failures);

  await runStep('bilan', () => {
    initSummary();
    calculateSummary();
  }, failures);

  await runStep('recherche', () => initSearch(), failures);
  await runStep('export', () => initExport(), failures);
  await runStep('notifications', () => initNotifications(), failures);
  await runStep('budgets par catégorie', async () => {
    const { initCategoryBudgets } = await import('./category-budgets.js');
    await initCategoryBudgets();
  }, failures);
  await runStep('tendances', () => initTrends(), failures);
  await runStep('reconduction', () => initReconduction(), failures);
  await runStep('saisie rapide', () => initQuickAdd(), failures);
  await runStep('carte', () => initMap(), failures);

  appInitialized = true;

  // Signal de disponibilité réelle. #mainApp devient visible dès la réussite
  // de l'authentification, bien avant que les modules soient initialisés :
  // s'y fier laisse une fenêtre où une saisie part dans le vide. Ce marqueur
  // sert aux tests E2E et au diagnostic.
  document.body.dataset.appReady = 'true';

  if (failures.length) {
    warn('⚠️ Modules en échec :', failures.join(', '));
    toast.error(`Chargement partiel — en échec : ${failures.join(', ')}`);
  } else {
    log('✅ Données utilisateur initialisées');
  }
}

/**
 * Initialize authentication listener
 * Sets up onAuthStateChanged to handle user login/logout
 */
export function initAuth() {
  const auth = getFirebaseAuth();

  // Le bouton d'inscription part masqué du HTML : lever SIGNUP_ENABLED suffit
  // à le rétablir, sans avoir à retoucher le balisage.
  if (SIGNUP_ENABLED) {
    const creerCompte = document.getElementById('createAccountBtn');
    if (creerCompte) creerCompte.hidden = false;
  }

  if (authUnsubscribe) {
    authUnsubscribe();
    log('[Auth] 🧹 Ancien listener nettoyé');
  }

  // Le bouton n'apparaît qu'en attente prolongée, mais son écouteur se pose
  // une fois pour toutes : le reposer à chaque bascule en accumulerait.
  const forcer = document.getElementById('authForcerFormulaire');
  if (forcer) forcer.addEventListener('click', revelerFormulaireConnexion);

  // Garde-fou : l'écran d'attente ne tient que sur la promesse d'une réponse
  // de Firebase. Si elle tarde — service lent, attestation App Check, jeton
  // illisible — rester muet devant « Connexion… » enferme la personne devant
  // un écran sans commande.
  //
  // Passé ce délai, l'écran le dit et offre d'ouvrir le formulaire. Il ne
  // l'ouvre plus de lui-même : c'est ce qu'il faisait, et une session valide
  // mais lente se voyait alors présenter un écran de connexion démenti la
  // seconde suivante.
  const secours = setTimeout(() => {
    warn('[Auth] ⏱️ Firebase tarde à répondre, attente signalée à l\'écran');
    noter('auth', 'attente prolongée signalée');
    signalerAttenteLongue();
  }, DELAI_ATTENTE_AUTH);

  authUnsubscribe = auth.onAuthStateChanged(async (user) => {
    clearTimeout(secours);
    log('[Auth] État changé:', user ? user.email : 'Déconnecté');

    // Vérification whitelist — refuser tout compte non autorisé
    if (user && !ALLOWED_EMAILS.includes(user.email)) {
      warn('[Auth] ⛔ Accès refusé pour :', user.email);
      const authErrorEl = document.getElementById('authError');
      if (authErrorEl) authErrorEl.textContent = 'Accès non autorisé. Ce compte n\'est pas autorisé à utiliser cette application.';
      await auth.signOut();
      return;
    }

    // Adresse non vérifiée : les règles refusent l'espace du foyer, autant le
    // dire ici. Sans ce contrôle, le compte s'authentifiait, l'interface
    // s'ouvrait, et chaque lecture échouait ensuite une à une — « Chargement
    // partiel » suivi de la liste des modules, pour une cause introuvable
    // depuis l'écran. Le bac à sable n'est pas concerné : le compte de test
    // s'authentifie par mot de passe et n'a pas d'adresse à prouver.
    if (user && resolveDataRoot(user.email) === 'household' && user.emailVerified === false) {
      warn('[Auth] ⛔ Adresse non vérifiée :', user.email);
      const authErrorEl = document.getElementById('authError');
      if (authErrorEl) {
        authErrorEl.textContent = 'Adresse non vérifiée. Vérifiez votre adresse e-mail, ou connectez-vous avec Google.';
      }
      await auth.signOut();
      return;
    }

    // Update UI immediately (don't wait for DB)
    updateAuthUI(user);

    // Set current user ID for multi-user database structure
    const { setAuthenticatedUser, getDataRoot } = await import('../db.js');
    setAuthenticatedUser(user ? user.uid : null, user ? user.email : null);

    // Un compte cantonné au bac à sable doit le voir à l'écran : l'URL ne le
    // dit pas, et rien d'autre ne distingue un essai des vraies données.
    if (user && getDataRoot() === 'sandbox') {
      const { showSandboxBanner } = await import('../utils/sandbox-banner.js');
      showSandboxBanner();
    }

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
      delete document.body.dataset.appReady;

      cleanupNotifications();
      cleanupQuickAdd();
      cleanupMap();
      cleanupModals();

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


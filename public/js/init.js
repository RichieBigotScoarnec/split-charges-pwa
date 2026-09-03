/**
 * FairSplit Init
 * @description Délégation d'événements globale + enregistrement du Service Worker
 *
 * Ce fichier est intentionnellement non-module (pas de type="module").
 * Il est chargé avec defer après le parsing HTML.
 *
 * Responsabilités :
 *   1. Délégation click → data-action (boutons, liens)
 *   2. Délégation change → data-on-change (selects, checkboxes)
 *   3. Délégation input  → data-on-input  (champs texte)
 *   4. Enregistrement du Service Worker
 *
 * Les modules ES6 (app.js et ses imports) exposent leurs fonctions
 * via window.* pour que la délégation puisse les appeler.
 */

// ===== 0. LES SEULES ACTIONS QUE LA DÉLÉGATION ACCEPTE =====
//
// Les trois délégations ci-dessous résolvaient un nom de fonction directement
// sur `window`, à partir d'un attribut du DOM. Quarante-sept fonctions étaient
// ainsi joignables par leur nom — dont `settleBalance`, qui inscrit un
// remboursement, `pickBackupFile`, dont la restauration écrase toute la base,
// et les trois suppressions.
//
// La politique de sécurité de la page se passe de `'unsafe-inline'` sur
// `script-src`, précisément pour qu'un balisage injecté ne puisse pas exécuter
// de code. Mais l'application avait réimplémenté en JavaScript le mécanisme
// que cette directive existe pour interdire : `data-action` est un gestionnaire
// inline que la CSP ne voit pas et ne peut pas restreindre. Toute injection
// HTML — y compris celle qui ne peut pas exécuter de script — devenait donc un
// appel de fonction arbitraire, à un clic près. Et `data-on-input` n'exige même
// pas le clic : la frappe suffit.
//
// Aucune injection n'est connue dans cette base de code. C'est un amplificateur,
// pas une faille autonome — mais c'est exactement la défense en profondeur que
// la CSP était censée fournir.
//
// La liste ci-dessous est l'inventaire exact de ce que le balisage déclenche,
// HTML et gabarits JS confondus. Un nom absent ne fait plus rien.
// `tests/actions-declarees.test.js` la compare au balisage réel et tombe dès
// qu'un `data-action` la déborde — ou qu'elle garde un nom devenu inutile.
const ACTIONS_AUTORISEES = new Set([
  'appliquerCategorieAuLot', 'appliquerEnveloppeAuLot',
  'basculerChargeChoisie', 'basculerModeSelection', 'basculerResume',
  'changePeriod', 'clearSearch', 'closeModal', 'closeQuickAddModal',
  'createAccount', 'creerEnveloppeProposee', 'declarerAbonnementsProposes',
  'deleteFixedCharge', 'deleteReimbursement',
  'deleteVariableCharge', 'devoilerPrive', 'downloadBackup', 'editFixedCharge',
  'editReimbursement', 'editVariableCharge', 'exportToCSV',
  'exportToPDF', 'focusSalaries', 'handleQuickAddSubmit',
  'navigatePeriod', 'ouvrirDetailCategorie', 'ouvrirDetailPayeur',
  'ouvrirRapportDuMois',
  'pickBackupFile', 'requestNotificationPermission',
  'restoreFromTrash', 'saveCategoryBudgets', 'saveMembers',
  'saveReminderSettings', 'selectShareMode', 'settleBalance',
  'showBackup', 'showBudgetEditor', 'showManageCategoriesModal',
  'showImportModal', 'showManageDestinationsModal', 'showManageEnvelopesModal', 'showPrivateExpensesModal',
  'showMapModal', 'showQuickAddModal', 'showTrash', 'signInWithEmail',
  'signInWithGoogle', 'signOut', 'supprimerLaSelection',
  'toutSelectionner', 'toggleBudgetInput', 'toggleCarryOver',
  'toggleFixedChargeSplit', 'toggleFixedChargePerso', 'toggleFixedChargeSplitMode', 'toggleRemindersPanel', 'toggleTrends',
  'toggleVariableChargePerso', 'toggleVariableChargeSplit', 'toggleVariableChargeSplitMode'
]);

/**
 * La fonction visée par un attribut, si elle a le droit d'être appelée
 * @param {string} nom - Contenu de data-action / data-on-change / data-on-input
 * @returns {Function|null}
 */
function actionAutorisee(nom) {
  if (!ACTIONS_AUTORISEES.has(nom)) return null;
  return typeof window[nom] === 'function' ? window[nom] : null;
}

// ===== 1. DÉLÉGATION CLICK (data-action) =====
document.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const arg = btn.dataset.arg;

  const fn = actionAutorisee(action);
  if (fn) {
    e.preventDefault();
    fn(arg);
  } else {
    // Fonction pas encore exposée (module pas encore initialisé) — ignorer silencieusement
    // console.warn('[Init] Action non trouvée sur window:', action);
  }
});

// ===== 2. DÉLÉGATION CHANGE (data-on-change) =====
document.addEventListener('change', function (e) {
  const el = e.target.closest('[data-on-change]');
  if (!el) return;

  const fns = el.dataset.onChange.split(',');
  fns.forEach(function (fnName) {
    const fn = actionAutorisee(fnName.trim());
    if (fn) fn(el.value, el);
  });
});

// ===== 3. DÉLÉGATION INPUT (data-on-input) =====
document.addEventListener('input', function (e) {
  const el = e.target.closest('[data-on-input]');
  if (!el) return;

  const fns = el.dataset.onInput.split(',');
  fns.forEach(function (fnName) {
    const fn = actionAutorisee(fnName.trim());
    if (fn) fn(el.value, el);
  });
});

// ===== 4. SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js')
      .catch(function (err) {
        // Erreur non-bloquante : l'app fonctionne sans SW
        void err;
      });
  });
}

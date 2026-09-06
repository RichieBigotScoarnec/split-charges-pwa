/**
 * FairSplit - Share Mode Module
 * @description Gestion du mode de partage (prorata, 50-50, custom)
 */

import { setState, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { calculateSummary } from './summary.js';
import { log, error as logError } from '../utils/debug.js';
import { parseMontantOu } from '../utils/montant.js';
import { ecouterUneFois } from '../utils/ecouteur.js';

/**
 * Select and apply share mode
 * @param {string} mode - 'prorata', '50-50', or 'custom'
 */
export function selectShareMode(mode) {
  setState('shareMode', mode);

  // Update UI - deselect all, select current
  document.querySelectorAll('.share-mode-option').forEach(el => {
    el.classList.remove('selected');
  });

  const customPercentagesEl = document.getElementById('customPercentages');

  if (mode === 'prorata') {
    const prorataEl = document.getElementById('modeProrata');
    if (prorataEl) prorataEl.classList.add('selected');
    if (customPercentagesEl) customPercentagesEl.classList.remove('active');
  } else if (mode === '50-50') {
    const mode5050El = document.getElementById('mode5050');
    if (mode5050El) mode5050El.classList.add('selected');
    if (customPercentagesEl) customPercentagesEl.classList.remove('active');
  } else if (mode === 'custom') {
    const customEl = document.getElementById('modeCustom');
    if (customEl) customEl.classList.add('selected');
    if (customPercentagesEl) customPercentagesEl.classList.add('active');
    validateCustomPercents();
  }

  saveShareMode();

  // Le report AVANT le bilan : il dépend du mode, lui aussi.
  recalculerApresChangementDeMode();

  log(`💰 Mode de partage : ${mode}`);
}

/**
 * Recalcule ce que le changement de mode invalide — le report, puis le bilan
 *
 * `calculateSummary()` lit `getState('carryOver')`, une valeur produite par
 * `computeBalanceChain` **sous l'ancien mode**. Changer de mode recalculait donc
 * le mois affiché mais laissait son report tel quel : le solde mêlait deux
 * modes de partage.
 *
 * Mesuré — deux mois à 900 € payés par « vous », salaires 3 000/1 000, passage
 * du prorata au 50-50 : l'écran annonçait 675 € là où la chaîne recalculée
 * donne 900 €. 225 € d'écart, sans un mot, jusqu'au prochain changement de mois
 * ou rechargement de l'application.
 *
 * L'ordre compte : le report d'abord, le bilan ensuite. L'inverse afficherait
 * brièvement le solde faux avant de le corriger.
 *
 * @returns {Promise<void>}
 */
async function recalculerApresChangementDeMode() {
  try {
    const { refreshCarryOver } = await import('./carry-over.js');
    await refreshCarryOver();
  } catch (error) {
    // Un report indisponible ne doit pas priver du bilan : `refreshCarryOver`
    // retombe déjà sur zéro et le journalise. On rend la main au bilan.
    logError('❌ Report non recalculé après changement de mode :', error);
  }
  calculateSummary();
}

/**
 * Validate custom percentages (must sum to 100)
 */
export function validateCustomPercents() {
  const yourPercentEl = document.getElementById('customPercentYou');
  const partnerPercentEl = document.getElementById('customPercentPartner');
  const validationEl = document.getElementById('shareModeValidation');

  if (!yourPercentEl || !partnerPercentEl || !validationEl) return;

  const yourPercent = parseMontantOu(yourPercentEl.value);
  const partnerPercent = parseMontantOu(partnerPercentEl.value);
  const total = yourPercent + partnerPercent;

  if (total === 100 && yourPercent >= 0 && partnerPercent >= 0) {
    validationEl.textContent = '✓ Répartition valide';
    validationEl.className = 'share-mode-validation valid';

    // Save to state
    setState('customPercents', {
      vous: yourPercent,
      conjointe: partnerPercent
    });

    saveShareMode();

    // Même raison qu'au-dessus : les pourcentages entrent dans le calcul du
    // report exactement comme le mode.
    recalculerApresChangementDeMode();
  } else {
    validationEl.textContent = `Total: ${total}% (doit être 100%)`;
    validationEl.className = 'share-mode-validation invalid';
  }
}

/**
 * Un chargement est-il en cours ?
 *
 * Ce drapeau était positionné à trois endroits et lu nulle part. Le garde-fou
 * qu'il devait constituer n'existait donc pas : charger le mode de partage
 * appelait selectShareMode, qui réécrit aussitôt en base ce qu'on vient d'en
 * lire. À chaque ouverture de l'application et à chaque changement de mois,
 * une écriture pour rien — et, à deux appareils, la possibilité d'écraser le
 * choix que l'autre venait de faire.
 */
let _isLoading = false;

/**
 * Save share mode to Firebase
 */
async function saveShareMode() {
  // Rien à réécrire quand on vient de lire.
  if (_isLoading) return;

  const shareMode = getState('shareMode');
  const customPercents = getState('customPercents');

  try {
    // Use dbSet from db.js which handles UID-scoped paths
    const { dbSet } = await import('../db.js');
    await dbSet('shareMode', {
      mode: shareMode,
      customPercents: shareMode === 'custom' ? customPercents : null
    });

    log('💾 Mode de partage sauvegardé');
  } catch (error) {
    logError('❌ Erreur sauvegarde mode partage:', error);
    toast.error('Erreur : impossible de sauvegarder le mode de partage');
  }
}

/**
 * Applique un mode sans le réécrire en base
 *
 * `_isLoading` était relevé puis rabaissé à la main, aux trois endroits où
 * `loadShareMode` applique un mode. `selectShareMode` appelle `calculateSummary`
 * — et, en mode `custom`, `validateCustomPercents` : si l'un des deux lève, la
 * ligne qui rabaisse le drapeau n'est jamais atteinte. Il reste alors levé pour
 * toute la session, et `saveShareMode` devient un non-événement : le foyer peut
 * changer de mode autant qu'il veut, plus rien n'est enregistré, et rien ne le
 * dit. Le prochain chargement rétablit l'ancien mode, donc l'ancien bilan.
 *
 * `finally` le rabaisse quoi qu'il arrive, et l'erreur continue son chemin
 * jusqu'à `runStep`.
 *
 * @param {string} mode - 'prorata' | '50-50' | 'custom'
 * @returns {void}
 */
function appliquerSansReecrire(mode) {
  _isLoading = true;
  try {
    selectShareMode(mode);
  } finally {
    _isLoading = false;
  }
}

/**
 * Load share mode from Firebase
 */
export async function loadShareMode() {
  try {
    // Use dbGet from db.js which handles UID-scoped paths
    const { dbGet } = await import('../db.js');
    const data = await dbGet('shareMode');

    if (data) {
      const mode = data.mode || 'prorata';

      // Load custom percents if available
      if (data.customPercents) {
        setState('customPercents', data.customPercents);

        const yourPercentEl = document.getElementById('customPercentYou');
        const partnerPercentEl = document.getElementById('customPercentPartner');

        if (yourPercentEl) yourPercentEl.value = data.customPercents.vous;
        if (partnerPercentEl) partnerPercentEl.value = data.customPercents.conjointe;
      }

      // Update UI (this will also save and recalc summary)
      appliquerSansReecrire(mode);

      log(`📥 Mode de partage chargé : ${mode}`);
    } else {
      // No saved mode, use default 'prorata'
      appliquerSansReecrire('prorata');
    }
  } catch (error) {
    logError('❌ Erreur chargement mode partage:', error);

    // Le repli au prorata reste appliqué : sans mode, aucun bilan ne se
    // calcule, et une application qui n'affiche rien est pire qu'une qui
    // affiche un chiffre daté.
    appliquerSansReecrire('prorata');

    // Mais l'erreur remonte.
    //
    // Elle était avalée ici, avec pour tout signe un toast qui passe. Un foyer
    // en 50-50 voyait alors le bilan entier recalculé au prorata — des parts
    // et un solde parfaitement crédibles, et faux, sans que rien à l'écran ne
    // permette de s'en douter. C'est la faute que `depuisMiroir` refuse de
    // commettre trois fichiers plus loin : « rendre null afficherait un mois
    // vide parfaitement crédible ».
    //
    // `runStep` la reçoit, la consigne au journal avec son motif, et nomme
    // l'étape dans « Chargement partiel — en échec : mode de partage ». Ce
    // bandeau existe déjà et sert exactement à ça ; il n'y avait qu'à ne pas
    // l'empêcher de faire son travail.
    throw error;
  }
}

/**
 * Initialize share mode module
 * Sets up event listeners for mode selection and custom percent inputs
 */
export function initShareMode() {
  // Initialize default values in state
  setState('shareMode', 'prorata');
  setState('customPercents', { vous: 50, conjointe: 50 });

  // Setup event listeners for custom percent inputs
  const yourPercentEl = document.getElementById('customPercentYou');
  const partnerPercentEl = document.getElementById('customPercentPartner');

  ecouterUneFois(yourPercentEl, 'input', validateCustomPercents);
  ecouterUneFois(partnerPercentEl, 'input', validateCustomPercents);

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.selectShareMode = selectShareMode;

  log('💰 Gestion mode de partage initialisée');
}

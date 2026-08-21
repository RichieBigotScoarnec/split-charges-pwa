/**
 * FairSplit - Period Management Module
 * @description Gestion des périodes (YYYY-MM), dropdown, navigation, chargement données
 */

import { getCurrentPeriod, formatPeriod } from '../utils/date.js';
import { resolveSalaries, normalizeSalaries } from '../utils/salaries.js';
import { setState, getState } from '../state.js';
import { validateAmount } from '../utils/validation.js';
import { LIMITS } from '../config.js';
import { toast } from '../components/toast.js';
import { loadVariableCharges } from './variable-charges.js';
import { loadFixedCharges } from './fixed-charges.js';
import { loadReimbursements } from './reimbursements.js';
import { calculateSummary } from './summary.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { exigerElement } from '../utils/diagnostics.js';

/**
 * Populate period dropdown with last 12 months
 */
function populatePeriodDropdown() {
  const select = document.getElementById('periodSelect');
  if (!select) return;

  select.innerHTML = '';
  const currentPeriod = getState('currentPeriod');

  // Generate last 12 months + current month
  for (let i = 0; i < 12; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const periodStr = `${year}-${month}`;

    const option = document.createElement('option');
    option.value = periodStr;
    option.textContent = formatPeriod(periodStr);

    if (periodStr === currentPeriod) {
      option.selected = true;
    }

    select.appendChild(option);
  }

  updatePeriodInfo();
}

/**
 * Update period info badge (current vs archived)
 */
function updatePeriodInfo() {
  const info = document.getElementById('periodInfo');
  if (!info) return;

  const currentPeriod = getState('currentPeriod');
  const actualCurrentPeriod = getCurrentPeriod();

  if (currentPeriod === actualCurrentPeriod) {
    info.innerHTML = '<span class="current-period-badge">✓ Période actuelle</span>';
  } else {
    // « lecture seule » était faux : rien n'empêche de modifier un mois passé,
    // et c'est voulu — corriger une charge oubliée est un besoin normal, et
    // l'instantané de salaires par période rend la correction sûre.
    info.innerHTML = '<span class="period-archived-label">📁 Mois archivé — modifiable</span>';
  }
}

/**
 * Change current period (called when dropdown changes)
 */
export function changePeriod() {
  const select = document.getElementById('periodSelect');
  if (!select) return;

  const newPeriod = select.value;
  setState('currentPeriod', newPeriod);

  updatePeriodInfo();
  loadPeriodData();
}

/**
 * Navigate to next/previous period
 * @param {number} direction - 1 for previous month, -1 for next month
 */
export function navigatePeriod(direction) {
  const select = document.getElementById('periodSelect');
  if (!select) return;

  const currentIndex = select.selectedIndex;
  const newIndex = currentIndex - direction; // Inverse because newer periods are first

  if (newIndex >= 0 && newIndex < select.options.length) {
    select.selectedIndex = newIndex;
    changePeriod();
  }
}

/**
 * Load period data from Firebase
 * Loads both salaries (global) and period-specific data
 */
export async function loadPeriodData() {
  // Même repli que saveSalaries : jamais lire sous `periods/undefined`
  const currentPeriod = getState('currentPeriod') || getCurrentPeriod();

  try {
    // 1. Salaires : l'instantané de la période fait foi, à défaut les globaux
    const { dbGet } = await import('../db.js');
    const [periodSalaries, globalSalaries] = await Promise.all([
      dbGet(`periods/${currentPeriod}/salaries`),
      dbGet('salaries')
    ]);

    const { salaries } = resolveSalaries(periodSalaries, globalSalaries);
    setState('salaries', salaries);

    // Les quatre champs de revenus reprennent l'instantané du mois affiché.
    restoreIncomeFields();

    // Un mois sans revenus complémentaires ne doit pas afficher le bloc replié
    // sur des zéros muets : on l'ouvre s'il porte une valeur.
    revealExtraIncomeIfUsed(salaries);

    // 2. Load period-specific data using individual module loaders
    // This ensures proper object-to-array conversion from Firebase
    await loadVariableCharges();
    await loadFixedCharges();
    await loadReimbursements();

    // Clear search when switching periods
    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const searchResultsInfo = document.getElementById('searchResultsInfo');

    if (searchInput) searchInput.value = '';
    if (searchClearBtn) searchClearBtn.classList.remove('visible');
    if (searchResultsInfo) searchResultsInfo.classList.remove('visible');

    // Le report d'un mois ne dépend que des mois qui le précèdent : il se
    // recalcule au changement de période, pas à chaque charge ajoutée.
    const { refreshCarryOver } = await import('./carry-over.js');
    await refreshCarryOver();

    // Calculate summary (rendering is done by individual loaders)
    calculateSummary();

    // Reconduction des charges récurrentes : silencieuse si le mois n'est pas
    // neuf, et ne s'exécute qu'une fois par mois cible.
    const { applyRecurringCharges } = await import('./reconduction.js');
    await applyRecurringCharges();

    log(`📅 Période chargée : ${formatPeriod(currentPeriod)}`);

  } catch (error) {
    logError('❌ Erreur chargement données période:', error);
    toast.error('Erreur lors du chargement des données');
  }
}

/**
 * Save salaries (global, not period-specific)
 */
/**
 * Les quatre champs de revenus, saisis dans le même bloc et validés de la
 * même façon. Les décrire une fois évite de répéter quatre fois la même
 * séquence de contrôles — c'est cette répétition, déjà présente pour les deux
 * salaires, qui aurait doublé avec les revenus complémentaires.
 */
const CHAMPS_REVENUS = [
  { id: 'salaireVous', cle: 'vous', libelle: 'votre salaire' },
  { id: 'salaireConjointe', cle: 'conjointe', libelle: 'le salaire conjoint' },
  { id: 'revenusVous', cle: 'extraVous', libelle: 'vos revenus complémentaires' },
  { id: 'revenusConjointe', cle: 'extraConjointe', libelle: 'les revenus complémentaires conjoints' }
];

/**
 * Lit et valide les quatre champs de revenus
 *
 * Un champ vide vaut zéro : ne rien saisir dans « revenus complémentaires »
 * doit laisser le calcul strictement inchangé.
 *
 * @returns {{revenus: Object|null, erreur: string|null}} Les revenus, ou le motif du refus
 */
function readIncomeFields() {
  const revenus = {};

  for (const champ of CHAMPS_REVENUS) {
    const input = document.getElementById(champ.id);
    const brut = (input?.value ?? '').trim();

    if (brut === '') {
      revenus[champ.cle] = 0;
      continue;
    }

    // Un revenu peut légitimement valoir zéro, contrairement à une charge :
    // validateAmount, et non validateChargeAmount.
    const verdict = validateAmount(brut, champ.libelle, LIMITS.MAX_SALARY);
    if (!verdict.valid) {
      return { revenus: null, erreur: verdict.error };
    }

    revenus[champ.cle] = parseFloat(brut);
  }

  return { revenus, erreur: null };
}

/**
 * Réaffiche dans les champs les valeurs connues de l'état
 *
 * Appelé après un refus : l'écran doit revenir à ce qui est réellement
 * enregistré plutôt que de conserver une saisie rejetée.
 */
function restoreIncomeFields() {
  const connus = getState('salaries') || {};
  for (const champ of CHAMPS_REVENUS) {
    const input = document.getElementById(champ.id);
    if (input) input.value = connus[champ.cle] || 0;
  }
}

/**
 * Sauvegarde les revenus de la période affichée
 *
 * Salaires et revenus complémentaires vivent dans le même instantané : ils
 * décrivent le même mois et se lisent d'une seule requête.
 *
 * @returns {Promise<void>}
 */
export async function saveSalaries(cleModifiee = null) {
  const indicator = document.getElementById('salariesSaveIndicator');

  const { revenus, erreur } = readIncomeFields();
  if (erreur) {
    toast.error(erreur);
    restoreIncomeFields();
    return;
  }

  if (indicator) {
    indicator.className = 'save-indicator is-saving';
  }

  try {
    // Repli sur le mois calendaire : l'écran principal s'affiche dès la
    // réussite de l'authentification, avant qu'initPeriod() ait renseigné
    // l'état. Une saisie de salaire dans cet intervalle écrivait sous
    // `periods/undefined/salaries` et était perdue au rechargement.
    const currentPeriod = getState('currentPeriod') || getCurrentPeriod();

    // N'écrire que le champ modifié.
    //
    // L'instantané était réécrit en entier à chaque saisie : si l'un renseigne
    // son salaire pendant que l'autre renseigne le sien, la seconde écriture
    // emportait la première — sans le moindre signe. Une mise à jour partielle
    // ne touche que la clé concernée.
    const aEcrire = cleModifiee
      ? { [cleModifiee]: revenus[cleModifiee] }
      : revenus;

    const { dbUpdate } = await import('../db.js');

    // L'instantané de la période consultée fait toujours foi pour son calcul.
    await dbUpdate(`periods/${currentPeriod}/salaries`, aEcrire);

    // Les revenus globaux ne suivent que si l'on édite le mois en cours :
    // corriger un mois archivé ne doit pas redéfinir la valeur par défaut des
    // mois suivants.
    if (currentPeriod === getCurrentPeriod()) {
      await dbUpdate('salaries', aEcrire);
    }

    setState('salaries', revenus);

    if (indicator) {
      indicator.className = 'save-indicator is-saved';
      setTimeout(() => {
        indicator.className = 'save-indicator';
      }, 2000);
    }

    calculateSummary();

  } catch (error) {
    logError('❌ Erreur sauvegarde salaires:', error);
    if (indicator) indicator.className = 'save-indicator';
    toast.error('Erreur : impossible de sauvegarder les salaires');
  }
}

/**
 * Dote d'un instantané de salaires les périodes qui n'en ont pas
 *
 * Les périodes créées avant l'introduction des instantanés se calculaient avec
 * les salaires globaux courants. Les figer sur cette même valeur ne change
 * donc aucun montant affiché : on gèle l'existant, et l'historique devient
 * exact à partir de maintenant.
 *
 * Idempotente : n'écrit que là où l'instantané manque, donc sans effet dès la
 * deuxième exécution.
 *
 * @returns {Promise<number>} Nombre de périodes complétées
 */
export async function backfillPeriodSalaries() {
  try {
    const { dbGet, dbSet } = await import('../db.js');

    const globalSalaries = normalizeSalaries(await dbGet('salaries'));
    if (!globalSalaries) {
      log('💤 Backfill salaires ignoré : aucun salaire global défini');
      return 0;
    }

    const periods = await dbGet('periods');
    if (!periods || typeof periods !== 'object') return 0;

    const missing = Object.keys(periods).filter(p => !periods[p]?.salaries);
    if (missing.length === 0) return 0;

    for (const period of missing) {
      await dbSet(`periods/${period}/salaries`, globalSalaries);
    }

    log(`🧬 Instantané de salaires ajouté à ${missing.length} période(s) : ${missing.join(', ')}`);
    return missing.length;
  } catch (error) {
    // Non bloquant : sans instantané, la période retombe sur les salaires
    // globaux, soit exactement le comportement précédent.
    warn('⚠️ Backfill des salaires par période impossible :', error);
    return 0;
  }
}

/**
 * Ouvre ou referme le bloc des revenus complémentaires
 *
 * Replié par défaut : la plupart des foyers n'ont que des salaires, et deux
 * champs de plus en permanence alourdiraient l'écran pour rien.
 */
export function toggleExtraIncome() {
  const bloc = document.getElementById('extraIncomeFields');
  const bascule = document.getElementById('extraIncomeToggle');
  if (!bloc || !bascule) return;

  const ouvert = !bloc.hidden;
  bloc.hidden = ouvert;
  bascule.setAttribute('aria-expanded', String(!ouvert));
}

/**
 * Déplie le bloc si le mois porte des revenus complémentaires
 *
 * Les laisser cachés reviendrait à faire peser sur le calcul une valeur que
 * rien à l'écran ne montre.
 *
 * @param {Object} salaries - Instantané de revenus du mois
 */
function revealExtraIncomeIfUsed(salaries) {
  const bloc = document.getElementById('extraIncomeFields');
  const bascule = document.getElementById('extraIncomeToggle');
  if (!bloc || !bascule) return;

  if ((salaries.extraVous || 0) > 0 || (salaries.extraConjointe || 0) > 0) {
    bloc.hidden = false;
    bascule.setAttribute('aria-expanded', 'true');
  }
}

/**
 * Amène l'utilisateur au champ des salaires
 *
 * L'état vide du bilan énonçait une condition sans offrir le moyen de la
 * remplir, alors que le bloc Salaires se trouve plus bas dans la page.
 */
export function focusSalaries() {
  const input = document.getElementById('salaireVous');
  if (!input) return;

  input.closest('section, .card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Le focus après le défilement, sinon le navigateur saute sèchement
  setTimeout(() => input.focus({ preventScroll: true }), 350);
}

/**
 * Initialize period module
 * Sets up event listeners for period dropdown and navigation
 */
export function initPeriod() {
  // Initialize current period in state
  const currentPeriod = getCurrentPeriod();
  setState('currentPeriod', currentPeriod);

  // Les écouteurs d'abord, le remplissage du sélecteur ensuite.
  //
  // L'ordre inverse liait deux pannes qui semblaient distinctes : si
  // `populatePeriodDropdown` lève, l'étape entière est rattrapée par
  // `runStep`, et les champs de revenus n'ont jamais reçu leur écouteur. On
  // observait alors une liste de mois vide *et* des salaires qui ne
  // s'enregistrent pas — deux symptômes, une seule cause. Attacher d'abord
  // rend chaque panne indépendante et bien plus lisible.
  const periodSelect = exigerElement('periodSelect', 'changer de mois');
  if (periodSelect) {
    periodSelect.addEventListener('change', changePeriod);
  }

  // Les quatre champs de revenus déclenchent la même sauvegarde.
  for (const champ of CHAMPS_REVENUS) {
    const input = exigerElement(champ.id, `enregistrer ${champ.libelle}`);
    // Le champ modifié est transmis : n'écrire que lui évite d'écraser la
    // saisie simultanée de l'autre personne.
    if (input) input.addEventListener('change', () => saveSalaries(champ.cle));
  }

  const bascule = exigerElement('extraIncomeToggle', 'afficher les revenus complémentaires');
  if (bascule) bascule.addEventListener('click', toggleExtraIncome);

  // Populate dropdown
  populatePeriodDropdown();

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.changePeriod = changePeriod;
  window.navigatePeriod = navigatePeriod;
  window.saveSalaries = saveSalaries;
  window.focusSalaries = focusSalaries;
  window.toggleExtraIncome = toggleExtraIncome;

  log('📅 Gestion périodes initialisée');
}

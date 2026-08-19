/**
 * FairSplit - Period Management Module
 * @description Gestion des périodes (YYYY-MM), dropdown, navigation, chargement données
 */

import { getCurrentPeriod, formatPeriod } from '../utils/date.js';
import { resolveSalaries, normalizeSalaries } from '../utils/salaries.js';
import { setState, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { loadVariableCharges } from './variable-charges.js';
import { loadFixedCharges } from './fixed-charges.js';
import { loadReimbursements } from './reimbursements.js';
import { calculateSummary } from './summary.js';
import { log, warn, error as logError } from '../utils/debug.js';

/**
 * Populate period dropdown with last 12 months
 */
export function populatePeriodDropdown() {
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
    info.innerHTML = '<span class="period-archived-label">📁 Période archivée (lecture seule)</span>';
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
  const currentPeriod = getState('currentPeriod');

  try {
    // 1. Salaires : l'instantané de la période fait foi, à défaut les globaux
    const { dbGet } = await import('../db.js');
    const [periodSalaries, globalSalaries] = await Promise.all([
      dbGet(`periods/${currentPeriod}/salaries`),
      dbGet('salaries')
    ]);

    const { salaries } = resolveSalaries(periodSalaries, globalSalaries);
    setState('salaries', salaries);

    // Update UI inputs
    const vousInput = document.getElementById('salaireVous');
    const conjointeInput = document.getElementById('salaireConjointe');
    if (vousInput) vousInput.value = salaries.vous;
    if (conjointeInput) conjointeInput.value = salaries.conjointe;

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

    // Calculate summary (rendering is done by individual loaders)
    calculateSummary();

    // ✅ Check for reconduction banner
    const { checkReconductionNeeded } = await import('./reconduction.js');
    checkReconductionNeeded();

    log(`📅 Période chargée : ${formatPeriod(currentPeriod)}`);

  } catch (error) {
    logError('❌ Erreur chargement données période:', error);
    toast.error('Erreur lors du chargement des données');
  }
}

/**
 * Save salaries (global, not period-specific)
 */
export async function saveSalaries() {
  const indicator = document.getElementById('salariesSaveIndicator');

  if (indicator) {
    indicator.className = 'save-indicator is-saving';
  }

  const vousInput = document.getElementById('salaireVous');
  const conjointeInput = document.getElementById('salaireConjointe');

  const rawVous = parseFloat(vousInput?.value || 0);
  const rawConjointe = parseFloat(conjointeInput?.value || 0);

  // Validation
  if (isNaN(rawVous) && vousInput?.value.trim() !== '') {
    toast.error('Valeur invalide pour votre salaire');
    const currentSalaries = getState('salaries') || { vous: 0, conjointe: 0 };
    if (vousInput) vousInput.value = currentSalaries.vous || 0;
    return;
  }

  if (isNaN(rawConjointe) && conjointeInput?.value.trim() !== '') {
    toast.error('Valeur invalide pour le salaire conjoint');
    const currentSalaries = getState('salaries') || { vous: 0, conjointe: 0 };
    if (conjointeInput) conjointeInput.value = currentSalaries.conjointe || 0;
    return;
  }

  const salaries = {
    vous: isNaN(rawVous) ? 0 : rawVous,
    conjointe: isNaN(rawConjointe) ? 0 : rawConjointe
  };

  // Validate: no negatives
  if (salaries.vous < 0 || salaries.conjointe < 0) {
    toast.error('Les salaires ne peuvent pas être négatifs');
    salaries.vous = Math.max(0, salaries.vous);
    salaries.conjointe = Math.max(0, salaries.conjointe);
    if (vousInput) vousInput.value = salaries.vous;
    if (conjointeInput) conjointeInput.value = salaries.conjointe;
    return;
  }

  // Validate: max 100,000€
  if (salaries.vous > 100000 || salaries.conjointe > 100000) {
    toast.error('Limite maximale : 100 000€ par salaire');
    salaries.vous = Math.min(100000, salaries.vous);
    salaries.conjointe = Math.min(100000, salaries.conjointe);
    if (vousInput) vousInput.value = salaries.vous;
    if (conjointeInput) conjointeInput.value = salaries.conjointe;
    return;
  }

  try {
    const { dbSet } = await import('../db.js');
    const currentPeriod = getState('currentPeriod');

    // L'instantané de la période consultée fait toujours foi pour son calcul.
    await dbSet(`periods/${currentPeriod}/salaries`, salaries);

    // Les salaires globaux ne suivent que si l'on édite le mois en cours :
    // corriger un mois archivé ne doit pas redéfinir la valeur par défaut des
    // mois suivants.
    if (currentPeriod === getCurrentPeriod()) {
      await dbSet('salaries', salaries);
    }

    setState('salaries', salaries);

    if (indicator) {
      indicator.className = 'save-indicator is-saved';
      setTimeout(() => {
        indicator.className = 'save-indicator';
      }, 2000);
    }

    // Recalculate summary
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
 * Initialize period module
 * Sets up event listeners for period dropdown and navigation
 */
export function initPeriod() {
  // Initialize current period in state
  const currentPeriod = getCurrentPeriod();
  setState('currentPeriod', currentPeriod);

  // Populate dropdown
  populatePeriodDropdown();

  // Setup event listeners
  const periodSelect = document.getElementById('periodSelect');
  if (periodSelect) {
    periodSelect.addEventListener('change', changePeriod);
  }

  // Setup event listeners for salary inputs
  const vousInput = document.getElementById('salaireVous');
  const conjointeInput = document.getElementById('salaireConjointe');
  if (vousInput) {
    vousInput.addEventListener('change', saveSalaries);
  }
  if (conjointeInput) {
    conjointeInput.addEventListener('change', saveSalaries);
  }

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.changePeriod = changePeriod;
  window.navigatePeriod = navigatePeriod;
  window.saveSalaries = saveSalaries;

  log('📅 Gestion périodes initialisée');
}

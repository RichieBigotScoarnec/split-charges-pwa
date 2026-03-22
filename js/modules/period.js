/**
 * FairSplit - Period Management Module
 * @description Gestion des périodes (YYYY-MM), dropdown, navigation, chargement données
 */

import { getCurrentPeriod, formatPeriod } from '../utils/date.js';
import { setState, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { loadVariableCharges } from './variable-charges.js';
import { loadFixedCharges } from './fixed-charges.js';
import { loadReimbursements } from './reimbursements.js';
import { calculateSummary } from './summary.js';
import { getUserPath } from '../db.js';
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
    info.innerHTML = '<span style="color: var(--text-secondary);">📁 Période archivée (lecture seule)</span>';
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
    // 1. Load salaries (global, not period-specific)
    // Use dbGet from db.js which handles UID-scoped paths
    const { dbGet } = await import('../db.js');
    const salaries = await dbGet('salaries');

    if (salaries) {
      setState('salaries', salaries);

      // Update UI inputs
      const vousInput = document.getElementById('salaireVous');
      const conjointeInput = document.getElementById('salaireConjointe');
      if (vousInput) vousInput.value = salaries.vous || 0;
      if (conjointeInput) conjointeInput.value = salaries.conjointe || 0;
    }

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
 * Save current period data to Firebase
 */
export async function savePeriodData() {
  const currentPeriod = getState('currentPeriod');

  const fixedCharges = getState('fixedCharges') || [];
  const variableCharges = getState('variableCharges') || [];
  const reimbursements = getState('reimbursements') || [];

  try {
    // Note: Summary is NOT saved to Firebase because it's calculated dynamically
    // from charges + reimbursements. Saving it would be redundant and could cause
    // data inconsistency. Summary is recalculated on every page load.

    // Use dbSet from db.js which handles UID-scoped paths
    const { dbSet } = await import('../db.js');
    await dbSet(`periods/${currentPeriod}`, {
      fixedCharges,
      variableCharges,
      reimbursements
    });

    log('💾 Données période sauvegardées');
  } catch (error) {
    logError('❌ Erreur sauvegarde données période:', error);
    toast.error('Erreur lors de la sauvegarde');
    throw error;
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

  let salaries = {
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
    // Use dbSet from db.js which handles UID-scoped paths
    const { dbSet } = await import('../db.js');
    await dbSet('salaries', salaries);
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

/**
 * FairSplit - Period Management Module
 * @description Gestion des périodes (YYYY-MM), dropdown, navigation, chargement données
 */

import { getCurrentPeriod, formatPeriod } from '../utils/date.js';
import { setState, getState } from '../state.js';
import { getFirebaseDatabase } from '../firebase-init.js';
import { toast } from '../components/toast.js';
import { renderVariableCharges } from './variable-charges.js';
import { renderFixedCharges } from './fixed-charges.js';
import { renderReimbursements } from './reimbursements.js';
import { calculateSummary } from './summary.js';

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
  const database = getFirebaseDatabase();
  const currentPeriod = getState('currentPeriod');

  try {
    // 1. Load salaries (global, not period-specific)
    const salariesSnapshot = await database.ref('salaries').once('value');
    if (salariesSnapshot.exists()) {
      const salaries = salariesSnapshot.val();
      setState('salaries', salaries);

      // Update UI inputs
      const vousInput = document.getElementById('salaireVous');
      const conjointeInput = document.getElementById('salaireConjointe');
      if (vousInput) vousInput.value = salaries.vous || 0;
      if (conjointeInput) conjointeInput.value = salaries.conjointe || 0;
    }

    // 2. Load period-specific data
    const periodSnapshot = await database.ref(`periods/${currentPeriod}`).once('value');

    if (periodSnapshot.exists()) {
      const data = periodSnapshot.val();
      setState('fixedCharges', data.fixedCharges || []);
      setState('variableCharges', data.variableCharges || []);
      setState('reimbursements', data.reimbursements || []);
    } else {
      // No data for this period, reset to empty arrays
      setState('fixedCharges', []);
      setState('variableCharges', []);
      setState('reimbursements', []);
    }

    // Clear search when switching periods
    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const searchResultsInfo = document.getElementById('searchResultsInfo');

    if (searchInput) searchInput.value = '';
    if (searchClearBtn) searchClearBtn.classList.remove('visible');
    if (searchResultsInfo) searchResultsInfo.classList.remove('visible');

    // Render all UI
    renderVariableCharges();
    renderFixedCharges();
    renderReimbursements();
    calculateSummary();

    // TODO Étape 3h : Check for reconduction banner
    // checkForNewMonth();

    console.log(`📅 Période chargée : ${formatPeriod(currentPeriod)}`);

  } catch (error) {
    console.error('❌ Erreur chargement données période:', error);
    toast.error('Erreur lors du chargement des données');
  }
}

/**
 * Save current period data to Firebase
 */
export async function savePeriodData() {
  const database = getFirebaseDatabase();
  const currentPeriod = getState('currentPeriod');

  const fixedCharges = getState('fixedCharges') || [];
  const variableCharges = getState('variableCharges') || [];
  const reimbursements = getState('reimbursements') || [];

  try {
    // TODO Étape 3h : Calculate summary
    // const summary = calculateSummary();

    await database.ref(`periods/${currentPeriod}`).set({
      fixedCharges,
      variableCharges,
      reimbursements
      // summary (TODO Étape 3h)
    });

    console.log('💾 Données période sauvegardées');
  } catch (error) {
    console.error('❌ Erreur sauvegarde données période:', error);
    toast.error('Erreur lors de la sauvegarde');
    throw error;
  }
}

/**
 * Save salaries (global, not period-specific)
 */
export async function saveSalaries() {
  const database = getFirebaseDatabase();
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
    await database.ref('salaries').set(salaries);
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
    console.error('❌ Erreur sauvegarde salaires:', error);
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

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.changePeriod = changePeriod;
  window.navigatePeriod = navigatePeriod;
  window.saveSalaries = saveSalaries;

  console.log('📅 Gestion périodes initialisée');
}

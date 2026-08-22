/**
 * FairSplit - Share Mode Module
 * @description Gestion du mode de partage (prorata, 50-50, custom)
 */

import { setState, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { calculateSummary } from './summary.js';
import { log, error as logError } from '../utils/debug.js';
import { parseMontantOu } from '../utils/montant.js';

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

  // Recalculate summary
  calculateSummary();

  log(`💰 Mode de partage : ${mode}`);
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

    // Recalculate summary
    calculateSummary();
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
      _isLoading = true;
      selectShareMode(mode);
      _isLoading = false;

      log(`📥 Mode de partage chargé : ${mode}`);
    } else {
      // No saved mode, use default 'prorata'
      _isLoading = true;
      selectShareMode('prorata');
      _isLoading = false;
    }
  } catch (error) {
    logError('❌ Erreur chargement mode partage:', error);
    toast.error('Erreur lors du chargement du mode de partage');
    // Fallback to prorata
    _isLoading = true;
    selectShareMode('prorata');
    _isLoading = false;
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

  if (yourPercentEl) {
    yourPercentEl.addEventListener('input', validateCustomPercents);
  }

  if (partnerPercentEl) {
    partnerPercentEl.addEventListener('input', validateCustomPercents);
  }

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.selectShareMode = selectShareMode;

  log('💰 Gestion mode de partage initialisée');
}

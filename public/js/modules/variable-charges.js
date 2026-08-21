// ===== MODULE : GESTION DES CHARGES VARIABLES =====
// Fonctionnalités : add, edit, delete, render, validation

import { setState, getState } from '../state.js';
import { collectDeleted } from '../utils/soft-delete.js';
import { refreshTrashButton } from './trash.js';
import { refreshMapButton } from './map.js';
import { invalidateTrends } from './trends.js';
// Les règles de saisie vivent dans utils/validation.js : réécrites dans
// chaque formulaire, elles avaient divergé.
import { validateChargeAmount, validateChargeName } from '../utils/validation.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal, showConfirmModal } from '../components/modal.js';
import { formatCurrency, escapeHtml, formatPaidBy } from '../utils/format.js';
import { calculateSummary } from './summary.js';
import { getCategoryIcon as getCategoryEmoji, populateCategorySelect } from './custom-lists.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { exigerElement } from '../utils/diagnostics.js';

/**
 * Initialise le module de gestion des charges variables
 */
/**
 * Show add variable charge modal
 */
export function showAddVariableChargeModal() {
  const chargeIdEl = document.getElementById('variableChargeId');
  const formEl = document.getElementById('variableChargeForm');

  if (chargeIdEl) chargeIdEl.value = '';
  if (formEl) formEl.reset();

  // Reset split override
  const splitToggle = document.getElementById('variableChargeSplitToggle');
  if (splitToggle) {
    splitToggle.checked = false;
    document.getElementById('variableChargeSplitOptions').style.display = 'none';
  }

  showModal('modalAddVariableCharge');
}

export function initVariableCharges() {
  log('📦 Initialisation module charges variables');

  // Les écouteurs d'abord, le remplissage ensuite.
  //
  // L'ordre inverse coûtait le bouton : `populateCategorySelect` lève si la
  // liste des catégories n'est pas exploitable, l'étape entière est rattrapée
  // par `runStep`, et « + Ajouter » restait sans écouteur — un bouton bien
  // visible sur lequel il ne se passait rien. Attacher d'abord garantit que
  // l'action reste possible même si le reste de l'initialisation échoue.
  const addBtn = exigerElement('addVariableChargeBtn', 'ouvrir l\'ajout de charge variable');
  if (addBtn) {
    addBtn.addEventListener('click', showAddVariableChargeModal);
  }

  const saveBtn = exigerElement('saveVariableCharge', 'enregistrer une charge variable');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveVariableCharge);
  }

  // Peupler le select catégorie dynamiquement
  populateCategorySelect('variableChargeCategory');

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.showAddVariableChargeModal = showAddVariableChargeModal;
  window.editVariableCharge = editVariableCharge;
  window.deleteVariableCharge = deleteVariableCharge;
  window.toggleVariableChargeSplit = function() {
    const toggle = document.getElementById('variableChargeSplitToggle');
    const options = document.getElementById('variableChargeSplitOptions');
    if (toggle && options) {
      options.style.display = toggle.checked ? 'block' : 'none';
    }
  };
  window.toggleVariableChargeSplitMode = function(value) {
    const customRow = document.getElementById('variableChargeSplitCustom');
    if (customRow) {
      customRow.style.display = value === 'custom' ? 'block' : 'none';
    }
  };

  log('✅ Module charges variables initialisé');
}

/**
 * Charge les charges variables depuis Firebase pour la période actuelle
 */
export async function loadVariableCharges() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    warn('⚠️ Pas de période active, chargement charges variables ignoré');
    return;
  }

  try {
    // Use dbGet from db.js which handles UID-scoped paths
    const { dbGet } = await import('../db.js');
    const charges = await dbGet(`periods/${currentPeriod}/variableCharges`);

    if (charges) {
      // Filtrer les charges non supprimées et valides
      const activeCharges = Object.entries(charges)
        .filter(([id, charge]) => {
          // Filtrer les charges supprimées
          if (charge.deleted) return false;
          // Filtrer les charges invalides (sans id ou amount invalide)
          // Note: description est optionnel (anciennes charges peuvent ne pas en avoir)
          if (!id || typeof charge.amount !== 'number') {
            warn(`⚠️ Charge invalide ignorée:`, id, charge);
            return false;
          }
          return true;
        })
        .map(([id, charge]) => ({ id, ...charge }));

      // Le nœud complet est déjà lu : recueillir les entrées supprimées
      // ici évite une seconde lecture pour la corbeille.
      setState('deleted.variableCharges', collectDeleted(charges));
      setState('variableCharges', activeCharges);
      log(`📊 ${activeCharges.length} charges variables chargées`);
    } else {
      setState('deleted.variableCharges', []);
      setState('variableCharges', []);
      log('📊 Aucune charge variable pour cette période');
    }

    renderVariableCharges();
    // Le nombre d'éléments supprimés vient de changer.
    refreshTrashButton();
    // Les charges localisées aussi, et le graphique de tendances devient
    // périmé. Ces vues se raccordent ici plutôt qu'au bilan : celui-ci sort
    // par anticipation quand aucun salaire n'est saisi.
    refreshMapButton();
    invalidateTrends();
  } catch (error) {
    logError('❌ Erreur chargement charges variables :', error);
    toast.error('Erreur de chargement des charges variables');
  }
}

/**
 * Sauvegarde une charge variable (ajout ou édition)
 */
export async function saveVariableCharge() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const chargeId = document.getElementById('variableChargeId').value;
  const description = document.getElementById('variableChargeDescription').value.trim();
  const amount = parseFloat(document.getElementById('variableChargeAmount').value);
  const category = document.getElementById('variableChargeCategory').value;
  const paidBy = document.getElementById('variableChargePaidBy').value;

  // Répartition spéciale
  const splitToggle = document.getElementById('variableChargeSplitToggle');
  let splitOverride = null;
  if (splitToggle && splitToggle.checked) {
    const splitMode = document.getElementById('variableChargeSplitMode').value;
    if (splitMode === 'custom') {
      const vous = parseInt(document.getElementById('variableChargeSplitVous').value) || 50;
      const conjointe = parseInt(document.getElementById('variableChargeSplitConjointe').value) || 50;
      if (vous + conjointe !== 100) {
        toast.error('La répartition doit totaliser 100%');
        return;
      }
      splitOverride = { mode: 'custom', vous, conjointe };
    } else {
      splitOverride = { mode: '50-50' };
    }
  }

  // Validation
  const descriptionValide = validateChargeName(description);
  if (!descriptionValide.valid) {
    toast.error(descriptionValide.error);
    return;
  }

  const montantValide = validateChargeAmount(amount);
  if (!montantValide.valid) {
    toast.error(montantValide.error);
    return;
  }

  if (!category) {
    toast.error('Catégorie requise');
    return;
  }

  if (!paidBy) {
    toast.error('Payeur requis');
    return;
  }

  try {
    const chargeData = {
      description,
      amount,
      category,
      paidBy,
      splitOverride,
      timestamp: Date.now(),
      deleted: false
    };

    // Use dbUpdate/dbPush from db.js which handles UID-scoped paths
    const { dbUpdate, dbPush } = await import('../db.js');

    let key;
    if (chargeId) {
      // Édition
      key = chargeId;
      await dbUpdate(`periods/${currentPeriod}/variableCharges/${key}`, chargeData);
      toast.success('Charge modifiée');
    } else {
      // Ajout
      key = await dbPush(`periods/${currentPeriod}/variableCharges`, chargeData);
      toast.success('Charge ajoutée');
    }

    // Mettre à jour le state local
    await loadVariableCharges();
    closeModal('modalAddVariableCharge', true);

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    logError('❌ Erreur sauvegarde charge variable :', error);
    toast.error('Erreur de sauvegarde');
  }
}

/**
 * Édite une charge variable existante
 * @param {string} chargeId - ID de la charge à éditer
 */
export function editVariableCharge(chargeId) {
  const charges = getState('variableCharges') || [];
  const charge = charges.find(c => c.id === chargeId);

  if (!charge) {
    toast.error('Charge introuvable');
    return;
  }

  // Pré-remplir le formulaire
  document.getElementById('variableChargeId').value = charge.id;
  document.getElementById('variableChargeDescription').value = charge.description;
  document.getElementById('variableChargeAmount').value = charge.amount;
  document.getElementById('variableChargeCategory').value = charge.category;
  document.getElementById('variableChargePaidBy').value = charge.paidBy;

  // Restaurer splitOverride
  const splitToggle = document.getElementById('variableChargeSplitToggle');
  const splitOptions = document.getElementById('variableChargeSplitOptions');
  if (splitToggle && charge.splitOverride) {
    splitToggle.checked = true;
    splitOptions.style.display = 'block';
    document.getElementById('variableChargeSplitMode').value = charge.splitOverride.mode;
    const customRow = document.getElementById('variableChargeSplitCustom');
    if (charge.splitOverride.mode === 'custom') {
      customRow.style.display = 'flex';
      document.getElementById('variableChargeSplitVous').value = charge.splitOverride.vous || 50;
      document.getElementById('variableChargeSplitConjointe').value = charge.splitOverride.conjointe || 50;
    } else {
      customRow.style.display = 'none';
    }
  } else if (splitToggle) {
    splitToggle.checked = false;
    splitOptions.style.display = 'none';
  }

  showModal('modalAddVariableCharge');
}

/**
 * Supprime une charge variable (soft delete)
 * @param {string} chargeId - ID de la charge à supprimer
 */
export async function deleteVariableCharge(chargeId) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const charges = getState('variableCharges') || [];
  const charge = charges.find(c => c.id === chargeId);

  if (!charge) {
    toast.error('Charge introuvable');
    return;
  }

  const confirmed = await showConfirmModal(`Supprimer "${charge.description}" (${formatCurrency(charge.amount)}) ?`);
  if (!confirmed) return;

  try {
    // Use dbUpdate from db.js which handles UID-scoped paths
    const { dbUpdate } = await import('../db.js');

    // Soft delete
    await dbUpdate(`periods/${currentPeriod}/variableCharges/${chargeId}`, { deleted: true });

    // Mettre à jour le state local
    await loadVariableCharges();
    toast.success('Charge supprimée', {
      undo: async () => {
        await dbUpdate(`periods/${currentPeriod}/variableCharges/${chargeId}`, { deleted: false });
        await loadVariableCharges();
        calculateSummary();
        toast.success('Suppression annulée');
      }
    });

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    logError('❌ Erreur suppression charge variable :', error);
    toast.error('Erreur de suppression');
  }
}

/**
 * Affiche la liste des charges variables dans le DOM
 */
export function renderVariableCharges() {
  const charges = getState('variableCharges') || [];
  const listElement = document.getElementById('variableChargesList');
  const totalElement = document.getElementById('variableChargesTotal');

  if (!listElement) {
    warn('⚠️ Element #variableChargesList introuvable');
    return;
  }

  // Vider la liste
  listElement.innerHTML = '';

  if (charges.length === 0) {
    listElement.innerHTML = '<p class="empty-state">Aucune charge variable pour cette période</p>';
    if (totalElement) totalElement.textContent = formatCurrency(0);
    return;
  }

  // Grouper par catégorie
  const byCategory = charges.reduce((acc, charge) => {
    if (!acc[charge.category]) acc[charge.category] = [];
    acc[charge.category].push(charge);
    return acc;
  }, {});

  // Afficher par catégorie
  let total = 0;
  Object.entries(byCategory).forEach(([category, categoryCharges]) => {
    const categoryTotal = categoryCharges.reduce((sum, c) => sum + c.amount, 0);
    total += categoryTotal;

    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'charge-category';
    categoryDiv.innerHTML = `
      <h4 class="category-header">
        ${getCategoryIcon(category)} ${escapeHtml(category)}
        <span class="category-total">${formatCurrency(categoryTotal)}</span>
      </h4>
    `;

    const chargesList = document.createElement('div');
    chargesList.className = 'charges-list';

    categoryCharges.forEach(charge => {
      // Validation supplémentaire
      if (!charge.id) {
        warn('⚠️ Charge invalide ignorée dans le rendu (pas d\'ID):', charge);
        return;
      }

      const chargeDiv = document.createElement('div');
      chargeDiv.className = 'charge-item';
      chargeDiv.dataset.id = charge.id;
      const splitTag = charge.splitOverride
        ? `<span class="charge-split-tag">${charge.splitOverride.mode === '50-50' ? '50/50' : `${charge.splitOverride.vous}/${charge.splitOverride.conjointe}`}</span>`
        : '';
      const locationName = charge.location ? (charge.location.name || charge.location.place) : null;
      const locationTag = locationName
        ? `<span class="charge-location">📍 ${escapeHtml(locationName)}</span>`
        : '';
      chargeDiv.innerHTML = `
        <div class="charge-info">
          <span class="charge-description">${escapeHtml(charge.description || 'Sans description')} ${splitTag}</span>
          <span class="charge-payer">Payé par ${formatPaidBy(charge.paidBy)}</span>
          ${locationTag}
        </div>
        <div class="charge-actions">
          <span class="charge-amount">${formatCurrency(charge.amount || 0)}</span>
          <button class="btn-icon" data-action="editVariableCharge" data-arg="${escapeHtml(charge.id)}" aria-label="Modifier ${escapeHtml(charge.description || '')}">
            ✏️
          </button>
          <button class="btn-icon btn-delete" data-action="deleteVariableCharge" data-arg="${escapeHtml(charge.id)}" aria-label="Supprimer ${escapeHtml(charge.description || '')}">
            🗑️
          </button>
        </div>
      `;
      chargesList.appendChild(chargeDiv);
    });

    categoryDiv.appendChild(chargesList);
    listElement.appendChild(categoryDiv);
  });

  // Afficher le total
  if (totalElement) {
    totalElement.textContent = formatCurrency(total);
  }
}

/**
 * Retourne l'icône emoji pour une catégorie (depuis custom-lists)
 * @param {string} category - Nom de la catégorie
 * @returns {string} Emoji icône
 */
function getCategoryIcon(category) {
  return getCategoryEmoji(category);
}


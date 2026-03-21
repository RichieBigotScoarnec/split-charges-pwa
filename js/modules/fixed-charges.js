// ===== MODULE : GESTION DES CHARGES FIXES =====
// Fonctionnalités : add, edit, delete, render, validation

import { setState, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { formatCurrency, escapeHtml, formatPaidBy } from '../utils/format.js';
import { calculateSummary } from './summary.js';

/**
 * Initialise le module de gestion des charges fixes
 */
/**
 * Show add fixed charge modal
 */
export function showAddFixedChargeModal() {
  const chargeIdEl = document.getElementById('fixedChargeId');
  const formEl = document.getElementById('fixedChargeForm');

  if (chargeIdEl) chargeIdEl.value = '';
  if (formEl) formEl.reset();
  const recurringEl = document.getElementById('fixedChargeRecurring');
  if (recurringEl) recurringEl.checked = true;

  // Reset split override
  const splitToggle = document.getElementById('fixedChargeSplitToggle');
  if (splitToggle) {
    splitToggle.checked = false;
    document.getElementById('fixedChargeSplitOptions').style.display = 'none';
  }

  showModal('modalAddFixedCharge');
}

export function initFixedCharges() {
  console.log('📦 Initialisation module charges fixes');

  // Listener sur le bouton d'ajout
  const addBtn = document.getElementById('addFixedChargeBtn');
  if (addBtn) {
    addBtn.addEventListener('click', showAddFixedChargeModal);
  }

  // Listener sur le formulaire de sauvegarde
  const saveBtn = document.getElementById('saveFixedCharge');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveFixedCharge);
  }

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.showAddFixedChargeModal = showAddFixedChargeModal;
  window.editFixedCharge = editFixedCharge;
  window.deleteFixedCharge = deleteFixedCharge;

  console.log('✅ Module charges fixes initialisé');
}

/**
 * Charge les charges fixes depuis Firebase pour la période actuelle
 */
export async function loadFixedCharges() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    console.warn('⚠️ Pas de période active, chargement charges fixes ignoré');
    return;
  }

  try {
    // Use dbGet from db.js which handles UID-scoped paths
    const { dbGet } = await import('../db.js');
    const charges = await dbGet(`periods/${currentPeriod}/fixedCharges`);

    if (charges) {
      // Filtrer les charges non supprimées
      const activeCharges = Object.entries(charges)
        .filter(([_, charge]) => !charge.deleted)
        .map(([id, charge]) => ({ id, ...charge }));

      setState('fixedCharges', activeCharges);
      console.log(`📊 ${activeCharges.length} charges fixes chargées`);
    } else {
      setState('fixedCharges', []);
      console.log('📊 Aucune charge fixe pour cette période');
    }

    renderFixedCharges();
  } catch (error) {
    console.error('❌ Erreur chargement charges fixes :', error);
    toast.error('Erreur de chargement des charges fixes');
  }
}

/**
 * Sauvegarde une charge fixe (ajout ou édition)
 */
export async function saveFixedCharge() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const chargeId = document.getElementById('fixedChargeId').value;
  const description = document.getElementById('fixedChargeDescription').value.trim();
  const amount = parseFloat(document.getElementById('fixedChargeAmount').value);
  const category = document.getElementById('fixedChargeCategory').value;
  const paidBy = document.getElementById('fixedChargePaidBy').value;
  const destination = document.getElementById('fixedChargeDestination')?.value || '';
  const recurring = document.getElementById('fixedChargeRecurring')?.checked ?? true;

  // Répartition spéciale
  const splitToggle = document.getElementById('fixedChargeSplitToggle');
  let splitOverride = null;
  if (splitToggle && splitToggle.checked) {
    const splitMode = document.getElementById('fixedChargeSplitMode').value;
    if (splitMode === 'custom') {
      const vous = parseInt(document.getElementById('fixedChargeSplitVous').value) || 50;
      const conjointe = parseInt(document.getElementById('fixedChargeSplitConjointe').value) || 50;
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
  if (!description || description.length > 100) {
    toast.error('Description requise (max 100 caractères)');
    return;
  }

  if (isNaN(amount) || amount <= 0 || amount > 100000) {
    toast.error('Montant invalide (0-100000€)');
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
      destination,
      recurring,
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
      await dbUpdate(`periods/${currentPeriod}/fixedCharges/${key}`, chargeData);
      toast.success('Charge modifiée');
    } else {
      // Ajout
      key = await dbPush(`periods/${currentPeriod}/fixedCharges`, chargeData);
      toast.success('Charge ajoutée');
    }

    // Mettre à jour le state local
    await loadFixedCharges();
    closeModal('modalAddFixedCharge', true);

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    console.error('❌ Erreur sauvegarde charge fixe :', error);
    toast.error('Erreur de sauvegarde');
  }
}

/**
 * Édite une charge fixe existante
 * @param {string} chargeId - ID de la charge à éditer
 */
export function editFixedCharge(chargeId) {
  const charges = getState('fixedCharges') || [];
  const charge = charges.find(c => c.id === chargeId);

  if (!charge) {
    toast.error('Charge introuvable');
    return;
  }

  // Pré-remplir le formulaire
  document.getElementById('fixedChargeId').value = charge.id;
  document.getElementById('fixedChargeDescription').value = charge.description;
  document.getElementById('fixedChargeAmount').value = charge.amount;
  document.getElementById('fixedChargeCategory').value = charge.category;
  document.getElementById('fixedChargePaidBy').value = charge.paidBy;
  const destEl = document.getElementById('fixedChargeDestination');
  if (destEl) destEl.value = charge.destination || '';
  const recurringEl = document.getElementById('fixedChargeRecurring');
  if (recurringEl) recurringEl.checked = charge.recurring !== false;

  // Restaurer splitOverride
  const splitToggle = document.getElementById('fixedChargeSplitToggle');
  const splitOptions = document.getElementById('fixedChargeSplitOptions');
  if (splitToggle && charge.splitOverride) {
    splitToggle.checked = true;
    splitOptions.style.display = 'block';
    document.getElementById('fixedChargeSplitMode').value = charge.splitOverride.mode;
    const customRow = document.getElementById('fixedChargeSplitCustom');
    if (charge.splitOverride.mode === 'custom') {
      customRow.style.display = 'flex';
      document.getElementById('fixedChargeSplitVous').value = charge.splitOverride.vous || 50;
      document.getElementById('fixedChargeSplitConjointe').value = charge.splitOverride.conjointe || 50;
    } else {
      customRow.style.display = 'none';
    }
  } else if (splitToggle) {
    splitToggle.checked = false;
    splitOptions.style.display = 'none';
  }

  showModal('modalAddFixedCharge');
}

/**
 * Supprime une charge fixe (soft delete)
 * @param {string} chargeId - ID de la charge à supprimer
 */
export async function deleteFixedCharge(chargeId) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const charges = getState('fixedCharges') || [];
  const charge = charges.find(c => c.id === chargeId);

  if (!charge) {
    toast.error('Charge introuvable');
    return;
  }

  if (!confirm(`Supprimer "${charge.description}" (${formatCurrency(charge.amount)}) ?`)) {
    return;
  }

  try {
    // Use dbUpdate from db.js which handles UID-scoped paths
    const { dbUpdate } = await import('../db.js');

    // Soft delete
    await dbUpdate(`periods/${currentPeriod}/fixedCharges/${chargeId}`, { deleted: true });

    // Mettre à jour le state local
    await loadFixedCharges();
    toast.success('Charge supprimée', {
      undo: async () => {
        await dbUpdate(`periods/${currentPeriod}/fixedCharges/${chargeId}`, { deleted: false });
        await loadFixedCharges();
        calculateSummary();
        toast.success('Suppression annulée');
      }
    });

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    console.error('❌ Erreur suppression charge fixe :', error);
    toast.error('Erreur de suppression');
  }
}

/**
 * Affiche la liste des charges fixes dans le DOM
 */
export function renderFixedCharges() {
  const charges = getState('fixedCharges') || [];
  const listElement = document.getElementById('fixedChargesList');
  const totalElement = document.getElementById('fixedChargesTotal');

  if (!listElement) {
    console.warn('⚠️ Element #fixedChargesList introuvable');
    return;
  }

  // Vider la liste
  listElement.innerHTML = '';

  if (charges.length === 0) {
    listElement.innerHTML = '<p class="empty-state">Aucune charge fixe pour cette période</p>';
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
      const chargeDiv = document.createElement('div');
      chargeDiv.className = 'charge-item';
      chargeDiv.dataset.id = charge.id;
      const destinationTag = charge.destination
        ? `<span class="charge-destination">→ ${escapeHtml(charge.destination)}</span>`
        : '';
      const ponctuelTag = charge.recurring === false
        ? '<span class="charge-ponctuel">ponctuelle</span>'
        : '';
      const splitTag = charge.splitOverride
        ? `<span class="charge-split-tag">${charge.splitOverride.mode === '50-50' ? '50/50' : `${charge.splitOverride.vous}/${charge.splitOverride.conjointe}`}</span>`
        : '';
      chargeDiv.innerHTML = `
        <div class="charge-info">
          <span class="charge-description">${escapeHtml(charge.description)} ${ponctuelTag} ${splitTag}</span>
          <span class="charge-payer">Payé par ${formatPaidBy(charge.paidBy)} ${destinationTag}</span>
        </div>
        <div class="charge-actions">
          <span class="charge-amount">${formatCurrency(charge.amount)}</span>
          <button class="btn-icon" onclick="editFixedCharge('${escapeHtml(charge.id)}')" title="Modifier">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-icon btn-delete" onclick="deleteFixedCharge('${escapeHtml(charge.id)}')" title="Supprimer">
            <i class="fas fa-trash"></i>
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
 * Retourne l'icône pour une catégorie
 * @param {string} category - Nom de la catégorie
 * @returns {string} HTML de l'icône
 */
function getCategoryIcon(category) {
  const icons = {
    'Loyer': '<i class="fas fa-home"></i>',
    'Énergie': '<i class="fas fa-bolt"></i>',
    'Internet': '<i class="fas fa-wifi"></i>',
    'Assurances': '<i class="fas fa-shield-alt"></i>',
    'Abonnements': '<i class="fas fa-calendar-check"></i>',
    'Autre': '<i class="fas fa-ellipsis-h"></i>'
  };
  return icons[category] || icons['Autre'];
}


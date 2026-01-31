// ===== MODULE : GESTION DES CHARGES VARIABLES =====
// Fonctionnalités : add, edit, delete, render, validation

import { getFirebaseDatabase } from '../firebase-init.js';
import { setState, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { formatCurrency } from '../utils/format.js';
import { calculateSummary } from './summary.js';

let database = null;

/**
 * Initialise le module de gestion des charges variables
 */
export function initVariableCharges() {
  console.log('📦 Initialisation module charges variables');
  database = getFirebaseDatabase();

  // Listener sur le bouton d'ajout
  const addBtn = document.getElementById('addVariableChargeBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      document.getElementById('variableChargeId').value = '';
      document.getElementById('variableChargeForm').reset();
      showModal('variableChargeModal');
    });
  }

  // Listener sur le formulaire de sauvegarde
  const saveBtn = document.getElementById('saveVariableCharge');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveVariableCharge);
  }

  console.log('✅ Module charges variables initialisé');
}

/**
 * Charge les charges variables depuis Firebase pour la période actuelle
 */
export async function loadVariableCharges() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    console.warn('⚠️ Pas de période active, chargement charges variables ignoré');
    return;
  }

  try {
    const snapshot = await database.ref(`periods/${currentPeriod}/variableCharges`).once('value');

    if (snapshot.exists()) {
      const charges = snapshot.val();
      // Filtrer les charges non supprimées
      const activeCharges = Object.entries(charges)
        .filter(([_, charge]) => !charge.deleted)
        .map(([id, charge]) => ({ id, ...charge }));

      setState('variableCharges', activeCharges);
      console.log(`📊 ${activeCharges.length} charges variables chargées`);
    } else {
      setState('variableCharges', []);
      console.log('📊 Aucune charge variable pour cette période');
    }

    renderVariableCharges();
  } catch (error) {
    console.error('❌ Erreur chargement charges variables :', error);
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
      timestamp: Date.now(),
      deleted: false
    };

    let key;
    if (chargeId) {
      // Édition
      key = chargeId;
      await database.ref(`periods/${currentPeriod}/variableCharges/${key}`).update(chargeData);
      toast.success('Charge modifiée');
    } else {
      // Ajout
      const newRef = database.ref(`periods/${currentPeriod}/variableCharges`).push();
      key = newRef.key;
      await newRef.set(chargeData);
      toast.success('Charge ajoutée');
    }

    // Mettre à jour le state local
    await loadVariableCharges();
    closeModal('variableChargeModal', true);

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    console.error('❌ Erreur sauvegarde charge variable :', error);
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

  showModal('variableChargeModal');
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

  if (!confirm(`Supprimer "${charge.description}" (${formatCurrency(charge.amount)}) ?`)) {
    return;
  }

  try {
    // Soft delete
    await database.ref(`periods/${currentPeriod}/variableCharges/${chargeId}`).update({ deleted: true });

    // Mettre à jour le state local
    await loadVariableCharges();
    toast.success('Charge supprimée', {
      undo: async () => {
        await database.ref(`periods/${currentPeriod}/variableCharges/${chargeId}`).update({ deleted: false });
        await loadVariableCharges();
        calculateSummary();
        toast.success('Suppression annulée');
      }
    });

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    console.error('❌ Erreur suppression charge variable :', error);
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
    console.warn('⚠️ Element #variableChargesList introuvable');
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
        ${getCategoryIcon(category)} ${category}
        <span class="category-total">${formatCurrency(categoryTotal)}</span>
      </h4>
    `;

    const chargesList = document.createElement('div');
    chargesList.className = 'charges-list';

    categoryCharges.forEach(charge => {
      const chargeDiv = document.createElement('div');
      chargeDiv.className = 'charge-item';
      chargeDiv.innerHTML = `
        <div class="charge-info">
          <span class="charge-description">${charge.description}</span>
          <span class="charge-payer">Payé par ${charge.paidBy === 'vous' ? 'Vous' : 'Conjointe'}</span>
        </div>
        <div class="charge-actions">
          <span class="charge-amount">${formatCurrency(charge.amount)}</span>
          <button class="btn-icon" onclick="editVariableCharge('${charge.id}')" title="Modifier">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-icon btn-delete" onclick="deleteVariableCharge('${charge.id}')" title="Supprimer">
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
    'Alimentation': '<i class="fas fa-utensils"></i>',
    'Transport': '<i class="fas fa-car"></i>',
    'Loisirs': '<i class="fas fa-gamepad"></i>',
    'Santé': '<i class="fas fa-heartbeat"></i>',
    'Autre': '<i class="fas fa-ellipsis-h"></i>'
  };
  return icons[category] || icons['Autre'];
}

// Exposer les fonctions globalement pour les onclick handlers
window.editVariableCharge = editVariableCharge;
window.deleteVariableCharge = deleteVariableCharge;

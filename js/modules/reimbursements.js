// ===== MODULE : GESTION DES REMBOURSEMENTS =====
// Fonctionnalités : add, delete, render

import { getFirebaseDatabase } from '../firebase-init.js';
import { setState, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { formatCurrency, escapeHtml } from '../utils/format.js';
import { calculateSummary } from './summary.js';
import { getUserPath } from '../db.js';

let database = null;

/**
 * Initialise le module de gestion des remboursements
 */
/**
 * Show add reimbursement modal
 */
export function showAddReimbursementModal() {
  const formEl = document.getElementById('reimbursementForm');
  if (formEl) formEl.reset();

  showModal('reimbursementModal');
}

export function initReimbursements() {
  console.log('📦 Initialisation module remboursements');
  database = getFirebaseDatabase();

  // Listener sur le bouton d'ajout
  const addBtn = document.getElementById('addReimbursementBtn');
  if (addBtn) {
    addBtn.addEventListener('click', showAddReimbursementModal);
  }

  // Listener sur le formulaire de sauvegarde
  const saveBtn = document.getElementById('saveReimbursement');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveReimbursement);
  }

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.showAddReimbursementModal = showAddReimbursementModal;
  window.deleteReimbursement = deleteReimbursement;

  console.log('✅ Module remboursements initialisé');
}

/**
 * Charge les remboursements depuis Firebase pour la période actuelle
 */
export async function loadReimbursements() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    console.warn('⚠️ Pas de période active, chargement remboursements ignoré');
    return;
  }

  try {
    const snapshot = await database.ref(getUserPath(`periods/${currentPeriod}/reimbursements`)).once('value');

    if (snapshot.exists()) {
      const reimbursements = snapshot.val();
      // Filtrer les remboursements non supprimés
      const activeReimbursements = Object.entries(reimbursements)
        .filter(([_, reimb]) => !reimb.deleted)
        .map(([id, reimb]) => ({ id, ...reimb }));

      setState('reimbursements', activeReimbursements);
      console.log(`📊 ${activeReimbursements.length} remboursements chargés`);
    } else {
      setState('reimbursements', []);
      console.log('📊 Aucun remboursement pour cette période');
    }

    renderReimbursements();
  } catch (error) {
    console.error('❌ Erreur chargement remboursements :', error);
    toast.error('Erreur de chargement des remboursements');
  }
}

/**
 * Sauvegarde un remboursement (ajout uniquement, pas d'édition)
 */
export async function saveReimbursement() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const direction = document.getElementById('reimbursementDirection').value;
  const amount = parseFloat(document.getElementById('reimbursementAmount').value);
  const note = document.getElementById('reimbursementNote').value.trim();

  // Validation
  if (!direction) {
    toast.error('Direction requise');
    return;
  }

  if (isNaN(amount) || amount <= 0 || amount > 100000) {
    toast.error('Montant invalide (0-100000€)');
    return;
  }

  try {
    const reimbursementData = {
      direction,
      amount,
      note: note || '',
      timestamp: Date.now(),
      deleted: false
    };

    // Ajout
    const newRef = database.ref(getUserPath(`periods/${currentPeriod}/reimbursements`)).push();
    await newRef.set(reimbursementData);
    toast.success('Remboursement ajouté');

    // Mettre à jour le state local
    await loadReimbursements();
    closeModal('reimbursementModal', true);

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    console.error('❌ Erreur sauvegarde remboursement :', error);
    toast.error('Erreur de sauvegarde');
  }
}

/**
 * Supprime un remboursement (soft delete)
 * @param {string} reimbursementId - ID du remboursement à supprimer
 */
export async function deleteReimbursement(reimbursementId) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const reimbursements = getState('reimbursements') || [];
  const reimbursement = reimbursements.find(r => r.id === reimbursementId);

  if (!reimbursement) {
    toast.error('Remboursement introuvable');
    return;
  }

  const directionText = reimbursement.direction === 'vous-to-conjointe'
    ? 'Vous → Conjointe'
    : 'Conjointe → Vous';

  if (!confirm(`Supprimer le remboursement ${directionText} de ${formatCurrency(reimbursement.amount)} ?`)) {
    return;
  }

  try {
    // Soft delete
    await database.ref(getUserPath(`periods/${currentPeriod}/reimbursements/${reimbursementId}`)).update({ deleted: true });

    // Mettre à jour le state local
    await loadReimbursements();
    toast.success('Remboursement supprimé', {
      undo: async () => {
        await database.ref(getUserPath(`periods/${currentPeriod}/reimbursements/${reimbursementId}`)).update({ deleted: false });
        await loadReimbursements();
        calculateSummary();
        toast.success('Suppression annulée');
      }
    });

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    console.error('❌ Erreur suppression remboursement :', error);
    toast.error('Erreur de suppression');
  }
}

/**
 * Affiche la liste des remboursements dans le DOM
 */
export function renderReimbursements() {
  const reimbursements = getState('reimbursements') || [];
  const listElement = document.getElementById('reimbursementsList');
  const totalElement = document.getElementById('reimbursementsTotal');

  if (!listElement) {
    console.warn('⚠️ Element #reimbursementsList introuvable');
    return;
  }

  // Vider la liste
  listElement.innerHTML = '';

  if (reimbursements.length === 0) {
    listElement.innerHTML = '<p class="empty-state">Aucun remboursement pour cette période</p>';
    if (totalElement) totalElement.textContent = formatCurrency(0);
    return;
  }

  // Calculer les totaux par direction
  let totalYouToPartner = 0;
  let totalPartnerToYou = 0;

  reimbursements.forEach(reimb => {
    if (reimb.direction === 'vous-to-conjointe') {
      totalYouToPartner += reimb.amount;
    } else {
      totalPartnerToYou += reimb.amount;
    }
  });

  // Afficher les remboursements
  reimbursements.forEach(reimb => {
    const reimbDiv = document.createElement('div');
    reimbDiv.className = 'reimbursement-item';

    const directionIcon = reimb.direction === 'vous-to-conjointe'
      ? '<i class="fas fa-arrow-right"></i>'
      : '<i class="fas fa-arrow-left"></i>';
    const directionText = reimb.direction === 'vous-to-conjointe'
      ? 'Vous → Conjointe'
      : 'Conjointe → Vous';
    const directionClass = reimb.direction === 'vous-to-conjointe'
      ? 'direction-you-to-partner'
      : 'direction-partner-to-you';

    reimbDiv.innerHTML = `
      <div class="reimbursement-info">
        <span class="reimbursement-direction ${directionClass}">
          ${directionIcon} ${directionText}
        </span>
        ${reimb.note ? `<span class="reimbursement-note">${escapeHtml(reimb.note)}</span>` : ''}
      </div>
      <div class="reimbursement-actions">
        <span class="reimbursement-amount">${formatCurrency(reimb.amount)}</span>
        <button class="btn-icon btn-delete" onclick="deleteReimbursement('${escapeHtml(reimb.id)}')" title="Supprimer">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
    listElement.appendChild(reimbDiv);
  });

  // Afficher le total net
  const netAmount = totalYouToPartner - totalPartnerToYou;
  if (totalElement) {
    if (netAmount > 0) {
      totalElement.innerHTML = `Vous devez : <strong>${formatCurrency(netAmount)}</strong>`;
      totalElement.className = 'reimbursements-total you-owe';
    } else if (netAmount < 0) {
      totalElement.innerHTML = `Conjointe doit : <strong>${formatCurrency(Math.abs(netAmount))}</strong>`;
      totalElement.className = 'reimbursements-total partner-owes';
    } else {
      totalElement.innerHTML = `Équilibré : <strong>${formatCurrency(0)}</strong>`;
      totalElement.className = 'reimbursements-total balanced';
    }
  }
}


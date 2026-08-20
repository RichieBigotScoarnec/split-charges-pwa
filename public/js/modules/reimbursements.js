// ===== MODULE : GESTION DES REMBOURSEMENTS =====
// Fonctionnalités : add, delete, render

import { setState, getState } from '../state.js';
import { REIMBURSEMENT_DIRECTIONS } from '../config.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal, showConfirmModal } from '../components/modal.js';
import { formatCurrency, escapeHtml } from '../utils/format.js';
import { calculateSummary } from './summary.js';
import { log, warn, error as logError } from '../utils/debug.js';

/**
 * Initialise le module de gestion des remboursements
 */
/**
 * Show add reimbursement modal
 */
export function showAddReimbursementModal() {
  const formEl = document.getElementById('reimbursementForm');
  if (formEl) formEl.reset();

  showModal('modalAddReimbursement');
}

export function initReimbursements() {
  log('📦 Initialisation module remboursements');

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

  log('✅ Module remboursements initialisé');
}

/**
 * Charge les remboursements depuis Firebase pour la période actuelle
 */
export async function loadReimbursements() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    warn('⚠️ Pas de période active, chargement remboursements ignoré');
    return;
  }

  try {
    // Use dbGet from db.js which handles UID-scoped paths
    const { dbGet } = await import('../db.js');
    const reimbursements = await dbGet(`periods/${currentPeriod}/reimbursements`);

    if (reimbursements) {
      // Filtrer les remboursements non supprimés
      const activeReimbursements = Object.entries(reimbursements)
        .filter(([_, reimb]) => !reimb.deleted)
        .map(([id, reimb]) => ({ id, ...reimb }));

      setState('reimbursements', activeReimbursements);
      log(`📊 ${activeReimbursements.length} remboursements chargés`);
    } else {
      setState('reimbursements', []);
      log('📊 Aucun remboursement pour cette période');
    }

    renderReimbursements();
  } catch (error) {
    logError('❌ Erreur chargement remboursements :', error);
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

    // Use dbPush from db.js which handles UID-scoped paths
    const { dbPush } = await import('../db.js');

    // Ajout
    await dbPush(`periods/${currentPeriod}/reimbursements`, reimbursementData);
    toast.success('Remboursement ajouté');

    // Mettre à jour le state local
    await loadReimbursements();
    closeModal('modalAddReimbursement', true);

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    logError('❌ Erreur sauvegarde remboursement :', error);
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

  const directionText = reimbursement.direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER
    ? 'Vous → Conjointe'
    : 'Conjointe → Vous';

  const confirmed = await showConfirmModal(`Supprimer le remboursement ${directionText} de ${formatCurrency(reimbursement.amount)} ?`);
  if (!confirmed) return;

  try {
    // Use dbUpdate from db.js which handles UID-scoped paths
    const { dbUpdate } = await import('../db.js');

    // Soft delete
    await dbUpdate(`periods/${currentPeriod}/reimbursements/${reimbursementId}`, { deleted: true });

    // Mettre à jour le state local
    await loadReimbursements();
    toast.success('Remboursement supprimé', {
      undo: async () => {
        await dbUpdate(`periods/${currentPeriod}/reimbursements/${reimbursementId}`, { deleted: false });
        await loadReimbursements();
        calculateSummary();
        toast.success('Suppression annulée');
      }
    });

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    logError('❌ Erreur suppression remboursement :', error);
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
    warn('⚠️ Element #reimbursementsList introuvable');
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
    if (reimb.direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER) {
      totalYouToPartner += reimb.amount;
    } else {
      totalPartnerToYou += reimb.amount;
    }
  });

  // Afficher les remboursements
  reimbursements.forEach(reimb => {
    const reimbDiv = document.createElement('div');
    reimbDiv.className = 'reimbursement-item';

    const directionIcon = reimb.direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER
      ? '→'
      : '←';
    const directionText = reimb.direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER
      ? 'Vous → Conjointe'
      : 'Conjointe → Vous';
    const directionClass = reimb.direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER
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
        <button class="btn-icon btn-delete" data-action="deleteReimbursement" data-arg="${escapeHtml(reimb.id)}" aria-label="Supprimer ce remboursement">
          🗑️
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


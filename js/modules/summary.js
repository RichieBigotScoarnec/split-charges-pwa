// ===== MODULE : GESTION DU BILAN/SUMMARY =====
// Fonctionnalités : calculateSummary, renderSummary, reconduction période

import { getFirebaseDatabase } from '../firebase-init.js';
import { setState, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { formatCurrency } from '../utils/format.js';
import { renderVariableCharges } from './variable-charges.js';
import { renderFixedCharges } from './fixed-charges.js';
import { renderReimbursements } from './reimbursements.js';

let database = null;

/**
 * Initialise le module summary
 */
export function initSummary() {
  console.log('📦 Initialisation module summary/bilan');
  database = getFirebaseDatabase();

  // Listener pour la reconduction de période
  const reconductBtn = document.getElementById('reconductPeriodBtn');
  if (reconductBtn) {
    reconductBtn.addEventListener('click', reconductPeriod);
  }

  console.log('✅ Module summary/bilan initialisé');
}

/**
 * Calcule le bilan financier complet
 * @returns {Object} Résumé du bilan
 */
export function calculateSummary() {
  const salaries = getState('salaries') || { vous: 0, conjointe: 0 };
  const fixedCharges = getState('fixedCharges') || [];
  const variableCharges = getState('variableCharges') || [];
  const reimbursements = getState('reimbursements') || [];
  const shareMode = getState('shareMode') || 'prorata';
  const customPercents = getState('customPercents') || { vous: 50, conjointe: 50 };

  const totalSalaries = salaries.vous + salaries.conjointe;

  // Si pas de salaires, impossible de calculer
  if (totalSalaries === 0) {
    const summaryElement = document.getElementById('summarySection');
    if (summaryElement) {
      summaryElement.innerHTML = '<p class="empty-state">Veuillez renseigner les salaires pour calculer le bilan</p>';
    }
    return { total: 0, yourShare: 0, partnerShare: 0, balance: 0 };
  }

  // Filtrer les éléments actifs (non supprimés)
  const activeFixed = fixedCharges.filter(c => !c.deleted);
  const activeVariable = variableCharges.filter(c => !c.deleted);
  const activeReimbs = reimbursements.filter(r => !r.deleted);

  // Calculer le total des charges
  const totalCharges = [...activeFixed, ...activeVariable].reduce((sum, c) => sum + c.amount, 0);

  // Calculer les parts théoriques (ce que chacun DOIT payer)
  let yourTheoricalShare = 0;
  let partnerTheoricalShare = 0;

  [...activeFixed, ...activeVariable].forEach(charge => {
    const amount = charge.amount;

    if (shareMode === '50-50') {
      yourTheoricalShare += amount * 0.5;
      partnerTheoricalShare += amount * 0.5;
    } else if (shareMode === 'custom') {
      yourTheoricalShare += amount * (customPercents.vous / 100);
      partnerTheoricalShare += amount * (customPercents.conjointe / 100);
    } else { // prorata
      yourTheoricalShare += amount * (salaries.vous / totalSalaries);
      partnerTheoricalShare += amount * (salaries.conjointe / totalSalaries);
    }
  });

  // Calculer les paiements réels (ce que chacun a PAYÉ)
  let yourActualPayments = 0;
  let partnerActualPayments = 0;

  [...activeFixed, ...activeVariable].forEach(charge => {
    if (charge.paidBy === 'vous') {
      yourActualPayments += charge.amount;
    } else if (charge.paidBy === 'conjointe') {
      partnerActualPayments += charge.amount;
    } else {
      // Compte joint : chacun a payé sa part théorique (pas de dette)
      yourActualPayments += yourTheoricalShare / (yourTheoricalShare + partnerTheoricalShare) * charge.amount;
      partnerActualPayments += partnerTheoricalShare / (yourTheoricalShare + partnerTheoricalShare) * charge.amount;
    }
  });

  // Calculer le solde AVANT remboursements
  let balanceBeforeReimbs = yourActualPayments - yourTheoricalShare;

  // Appliquer les remboursements
  let reimbursementAdjustment = 0;
  activeReimbs.forEach(reimb => {
    if (reimb.direction === 'vous-to-conjointe') {
      reimbursementAdjustment -= reimb.amount;
    } else {
      reimbursementAdjustment += reimb.amount;
    }
  });

  const finalBalance = balanceBeforeReimbs + reimbursementAdjustment;

  // Afficher le résumé
  renderSummary({
    totalCharges,
    yourTheoricalShare,
    partnerTheoricalShare,
    yourActualPayments,
    partnerActualPayments,
    balanceBeforeReimbs,
    reimbursementAdjustment,
    finalBalance
  });

  return {
    total: totalCharges,
    yourShare: yourTheoricalShare,
    partnerShare: partnerTheoricalShare,
    balance: finalBalance
  };
}

/**
 * Affiche le bilan dans le DOM
 * @param {Object} summary - Résumé calculé
 */
function renderSummary(summary) {
  const summaryElement = document.getElementById('summarySection');
  if (!summaryElement) {
    console.warn('⚠️ Element #summarySection introuvable');
    return;
  }

  const {
    totalCharges,
    yourTheoricalShare,
    partnerTheoricalShare,
    yourActualPayments,
    partnerActualPayments,
    balanceBeforeReimbs,
    reimbursementAdjustment,
    finalBalance
  } = summary;

  // Déterminer qui doit à qui
  let balanceText = '';
  let balanceClass = '';

  if (finalBalance > 0) {
    balanceText = `Vous avez payé <strong>${formatCurrency(Math.abs(finalBalance))}</strong> de trop<br><small>→ Conjointe vous doit ce montant</small>`;
    balanceClass = 'balance-positive';
  } else if (finalBalance < 0) {
    balanceText = `Vous devez <strong>${formatCurrency(Math.abs(finalBalance))}</strong><br><small>→ À rembourser à Conjointe</small>`;
    balanceClass = 'balance-negative';
  } else {
    balanceText = `<strong>Équilibré</strong><br><small>Aucun remboursement nécessaire</small>`;
    balanceClass = 'balance-zero';
  }

  summaryElement.innerHTML = `
    <div class="summary-card">
      <h3>📊 Bilan du mois</h3>

      <div class="summary-row">
        <span>Total charges :</span>
        <strong>${formatCurrency(totalCharges)}</strong>
      </div>

      <div class="summary-divider"></div>

      <div class="summary-row">
        <span>Votre part théorique :</span>
        <strong>${formatCurrency(yourTheoricalShare)}</strong>
      </div>
      <div class="summary-row">
        <span>Part conjointe théorique :</span>
        <strong>${formatCurrency(partnerTheoricalShare)}</strong>
      </div>

      <div class="summary-divider"></div>

      <div class="summary-row">
        <span>Vous avez payé :</span>
        <strong>${formatCurrency(yourActualPayments)}</strong>
      </div>
      <div class="summary-row">
        <span>Conjointe a payé :</span>
        <strong>${formatCurrency(partnerActualPayments)}</strong>
      </div>

      ${reimbursementAdjustment !== 0 ? `
        <div class="summary-divider"></div>
        <div class="summary-row">
          <span>Remboursements :</span>
          <strong class="${reimbursementAdjustment > 0 ? 'positive' : 'negative'}">${formatCurrency(reimbursementAdjustment)}</strong>
        </div>
      ` : ''}

      <div class="summary-divider"></div>

      <div class="summary-balance ${balanceClass}">
        ${balanceText}
      </div>
    </div>
  `;
}

/**
 * Rafraîchit tous les affichages (après modification de données)
 */
export function renderAll() {
  console.log('🔄 Rafraîchissement de tous les affichages...');

  renderVariableCharges();
  renderFixedCharges();
  renderReimbursements();
  calculateSummary();

  console.log('✅ Tous les affichages rafraîchis');
}

/**
 * Reconduction de la période actuelle vers le mois suivant
 * Copie les charges fixes et les salaires, ignore les charges variables et remboursements
 */
async function reconductPeriod() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  // Calculer la période suivante (mois suivant)
  const [year, month] = currentPeriod.split('-').map(Number);
  const nextDate = new Date(year, month, 1); // mois est 0-indexé en JS, donc month donne le mois suivant
  const nextPeriod = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  if (!confirm(`Reconduire les données vers ${nextPeriod} ?\n\n✅ Copié : Charges fixes, Salaires\n❌ Non copié : Charges variables, Remboursements`)) {
    return;
  }

  try {
    const database = getFirebaseDatabase();
    const userId = getState('currentUser')?.uid;
    if (!userId) {
      toast.error('Utilisateur non connecté');
      return;
    }

    // Récupérer les données de la période actuelle
    const currentSnapshot = await database.ref(`users/${userId}/periods/${currentPeriod}`).once('value');
    const currentData = currentSnapshot.val() || {};

    // Préparer les données pour la nouvelle période
    const newPeriodData = {
      fixedCharges: currentData.fixedCharges || {},
      salaries: currentData.salaries || { vous: 0, conjointe: 0 },
      shareMode: currentData.shareMode || { mode: 'prorata' },
      variableCharges: {}, // Vide
      reimbursements: {}   // Vide
    };

    // Écrire dans la nouvelle période
    await database.ref(`users/${userId}/periods/${nextPeriod}`).set(newPeriodData);

    toast.success(`Période ${nextPeriod} créée avec succès`);

    // Changer vers la nouvelle période
    setState('currentPeriod', nextPeriod);
    const periodSelect = document.getElementById('periodSelect');
    if (periodSelect) {
      // Ajouter la nouvelle option si elle n'existe pas
      const existingOption = Array.from(periodSelect.options).find(opt => opt.value === nextPeriod);
      if (!existingOption) {
        const option = document.createElement('option');
        option.value = nextPeriod;
        option.textContent = nextPeriod;
        periodSelect.insertBefore(option, periodSelect.firstChild);
      }
      periodSelect.value = nextPeriod;
    }

    // Recharger les données de la nouvelle période
    const { loadPeriodData } = await import('./period.js');
    await loadPeriodData();
    renderAll();

  } catch (error) {
    console.error('❌ Erreur reconduction période :', error);
    toast.error('Erreur lors de la reconduction');
  }
}

// Exposer les fonctions globalement
window.reconductPeriod = reconductPeriod;

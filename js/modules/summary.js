// ===== MODULE : GESTION DU BILAN/SUMMARY =====
// Fonctionnalités : calculateSummary, renderSummary

import { getState } from '../state.js';
import { formatCurrency } from '../utils/format.js';
import { renderVariableCharges } from './variable-charges.js';
import { renderFixedCharges } from './fixed-charges.js';
import { renderReimbursements } from './reimbursements.js';

/**
 * Initialise le module summary
 */
export function initSummary() {
  console.log('📦 Initialisation module summary/bilan');
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
      const totalShares = yourTheoricalShare + partnerTheoricalShare;
      const yourRatio = totalShares > 0 ? yourTheoricalShare / totalShares : 0.5;
      const partnerRatio = totalShares > 0 ? partnerTheoricalShare / totalShares : 0.5;
      yourActualPayments += yourRatio * charge.amount;
      partnerActualPayments += partnerRatio * charge.amount;
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

// Note : La reconduction de période est gérée par le module reconduction.js

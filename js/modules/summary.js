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

  // Calculer le récap virements par destination
  const virementsByDestination = calculateVirementsByDestination(activeFixed, {
    shareMode, salaries, totalSalaries, customPercents
  });

  // Afficher le résumé
  renderSummary({
    totalCharges,
    yourTheoricalShare,
    partnerTheoricalShare,
    yourActualPayments,
    partnerActualPayments,
    balanceBeforeReimbs,
    reimbursementAdjustment,
    finalBalance,
    virementsByDestination
  });

  return {
    total: totalCharges,
    yourShare: yourTheoricalShare,
    partnerShare: partnerTheoricalShare,
    balance: finalBalance
  };
}

/**
 * Calcule les montants à virer par destination
 * Groupé par destination, montant = part conjointe de chaque charge fixe
 * @param {Array} fixedCharges - Charges fixes actives
 * @param {Object} params - Paramètres de calcul (shareMode, salaries, etc.)
 * @returns {Array} Liste triée [{destination, charges: [{description, amount, partnerShare}], total}]
 */
function calculateVirementsByDestination(fixedCharges, params) {
  const { shareMode, salaries, totalSalaries, customPercents } = params;
  const grouped = {};

  fixedCharges.forEach(charge => {
    const dest = charge.destination || '';
    if (!dest) return; // Ignorer les charges sans destination

    // Calculer la part conjointe pour cette charge
    let partnerShare = 0;
    if (shareMode === '50-50') {
      partnerShare = charge.amount * 0.5;
    } else if (shareMode === 'custom') {
      partnerShare = charge.amount * (customPercents.conjointe / 100);
    } else {
      partnerShare = totalSalaries > 0
        ? charge.amount * (salaries.conjointe / totalSalaries)
        : charge.amount * 0.5;
    }

    if (!grouped[dest]) {
      grouped[dest] = { destination: dest, charges: [], total: 0 };
    }
    grouped[dest].charges.push({
      description: charge.description,
      amount: charge.amount,
      partnerShare
    });
    grouped[dest].total += partnerShare;
  });

  return Object.values(grouped).sort((a, b) => b.total - a.total);
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
    finalBalance,
    virementsByDestination
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

      <div class="summary-divider"></div>

      <div class="summary-row">
        <span>Solde avant remboursements :</span>
        <strong class="${balanceBeforeReimbs > 0 ? 'positive' : balanceBeforeReimbs < 0 ? 'negative' : ''}">${balanceBeforeReimbs > 0 ? '+' : ''}${formatCurrency(balanceBeforeReimbs)}</strong>
      </div>

      ${reimbursementAdjustment !== 0 ? `
        <div class="summary-row">
          <span>Remboursements effectués :</span>
          <strong class="${reimbursementAdjustment > 0 ? 'positive' : 'negative'}">${reimbursementAdjustment > 0 ? '+' : ''}${formatCurrency(reimbursementAdjustment)}</strong>
        </div>
      ` : ''}

      <div class="summary-divider"></div>

      <div class="summary-balance ${balanceClass}">
        ${balanceText}
      </div>
    </div>

    ${renderBudgetGauge(totalCharges)}

    ${virementsByDestination && virementsByDestination.length > 0 ? `
    <div class="summary-card virements-recap">
      <h3>🏦 Récap Virements Conjointe</h3>
      <p class="virements-subtitle">Montants à virer par destination</p>

      ${virementsByDestination.map(group => `
        <div class="virement-group">
          <div class="virement-destination">
            <span class="virement-dest-name">${group.destination}</span>
            <strong class="virement-dest-total">${formatCurrency(group.total)}</strong>
          </div>
          <div class="virement-details">
            ${group.charges.map(c => `
              <div class="virement-detail-row">
                <span>${c.description}</span>
                <span>${formatCurrency(c.partnerShare)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}

      <div class="summary-divider"></div>
      <div class="summary-row virement-grand-total">
        <span>Total virements :</span>
        <strong>${formatCurrency(virementsByDestination.reduce((sum, g) => sum + g.total, 0))}</strong>
      </div>
    </div>
    ` : ''}
  `;
}

/**
 * Génère le HTML de la jauge budget si le budget est activé
 * @param {number} totalCharges - Total des charges du mois
 * @returns {string} HTML de la jauge ou chaîne vide
 */
function renderBudgetGauge(totalCharges) {
  const budgetToggle = document.getElementById('reminderBudget');
  const budgetInput = document.getElementById('budgetAmount');

  if (!budgetToggle || !budgetToggle.checked || !budgetInput) return '';

  const budgetLimit = parseFloat(budgetInput.value) || 0;
  if (budgetLimit <= 0) return '';

  const percentage = Math.min((totalCharges / budgetLimit) * 100, 100);
  const isOver = totalCharges > budgetLimit;
  const remaining = budgetLimit - totalCharges;

  let statusClass = 'budget-ok';
  let statusIcon = '✅';
  let statusText = `Reste ${formatCurrency(remaining)}`;

  if (percentage >= 100) {
    statusClass = 'budget-over';
    statusIcon = '🚨';
    statusText = `Dépassé de ${formatCurrency(Math.abs(remaining))}`;
  } else if (percentage >= 80) {
    statusClass = 'budget-warning';
    statusIcon = '⚠️';
    statusText = `Reste ${formatCurrency(remaining)}`;
  }

  return `
    <div class="summary-card budget-gauge ${statusClass}">
      <h3>${statusIcon} Budget mensuel</h3>
      <div class="budget-progress-container">
        <div class="budget-progress-bar">
          <div class="budget-progress-fill ${statusClass}" style="width: ${percentage}%"></div>
        </div>
        <div class="budget-progress-labels">
          <span>${formatCurrency(totalCharges)}</span>
          <span>${formatCurrency(budgetLimit)}</span>
        </div>
      </div>
      <div class="budget-status">
        <span class="budget-percentage">${Math.round(percentage)}%</span>
        <span class="budget-remaining">${statusText}</span>
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

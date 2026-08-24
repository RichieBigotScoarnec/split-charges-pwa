// ===== MODULE : GESTION DU BILAN/SUMMARY =====
// Fonctionnalités : calculateSummary, renderSummary

import { getState, setState } from '../state.js';
import { refreshSearchVisibility } from './search.js';
import { formatCurrency, escapeHtml } from '../utils/format.js';
import { suivreLeBilan, CLASSE_REDONDANTE } from '../utils/barre-solde.js';
import { computeSummary, computeVirementsByDestination } from '../utils/calculations.js';
import { resolveIncomeBase } from '../utils/salaries.js';
import { describeBalance, memberLabel } from '../utils/members.js';
import { renderCategoryBudgets } from './category-budgets.js';
import { log, warn } from '../utils/debug.js';
import { parseMontantOu } from '../utils/montant.js';

/**
 * Initialise le module summary
 */
export function initSummary() {
  log('📦 Initialisation module summary/bilan');
  log('✅ Module summary/bilan initialisé');
}

/**
 * Calcule le bilan financier complet
 * @returns {Object} Résumé du bilan
 */
export function calculateSummary() {
  // La recherche n'a de sens que s'il existe des charges à filtrer
  refreshSearchVisibility();

  const salaries = getState('salaries') || { vous: 0, conjointe: 0 };
  const fixedCharges = getState('fixedCharges') || [];
  const variableCharges = getState('variableCharges') || [];
  const reimbursements = getState('reimbursements') || [];
  const shareMode = getState('shareMode') || 'prorata';
  const customPercents = getState('customPercents') || { vous: 50, conjointe: 50 };

  // Le prorata porte sur l'ensemble des revenus, salaires et revenus
  // complémentaires confondus : c'est cette assiette qui décide des parts.
  const incomeBase = resolveIncomeBase(salaries);
  const totalSalaries = incomeBase.total;

  // Si pas de salaires, impossible de calculer
  if (totalSalaries === 0) {
    // Le solde publié dans l'état sert aux rappels, qui ne peuvent pas
    // importer ce module sans créer un cycle.
    setState('dernierSolde', 0);

    const summaryElement = document.getElementById('summarySection');
    if (summaryElement) {
      updateBalanceBar(null, '');
      summaryElement.innerHTML =
        '<div class="empty-state">' +
        '<p>Renseignez vos deux salaires pour obtenir le bilan du mois.</p>' +
        '<button type="button" class="btn btn-primary" data-action="focusSalaries">' +
        'Renseigner les salaires</button>' +
        '</div>';
    }
    return { total: 0, yourShare: 0, partnerShare: 0, balance: 0 };
  }

  // Report du mois précédent : nul tant que la fonction n'est pas activée,
  // l'ajout est donc sans effet sur le comportement historique.
  const carryOver = getState('carryOver') || 0;

  // Calculs purs délégués à utils/calculations.js (couverts par tests unitaires)
  const summary = computeSummary({
    salaries, fixedCharges, variableCharges, reimbursements, shareMode, customPercents, carryOver
  });

  // Publié pour les rappels : eux ne peuvent pas appeler ce module sans créer
  // un cycle d'imports, et le solde est la seule chose qu'ils aient à savoir.
  setState('dernierSolde', summary.balance);

  // Récap virements par destination (charges fixes actives uniquement)
  const activeFixed = fixedCharges.filter(c => !c.deleted);
  const virementsByDestination = computeVirementsByDestination(activeFixed, {
    shareMode, salaries: incomeBase, totalSalaries, customPercents
  });

  // Afficher le résumé
  renderSummary({
    totalCharges: summary.total,
    yourTheoricalShare: summary.yourShare,
    partnerTheoricalShare: summary.partnerShare,
    yourActualPayments: summary.yourActualPayments,
    partnerActualPayments: summary.partnerActualPayments,
    balanceBeforeReimbs: summary.balanceBeforeReimbs,
    reimbursementAdjustment: summary.reimbursementAdjustment,
    carryOver: summary.carryOver,
    finalBalance: summary.balance,
    virementsByDestination
  });

  return {
    total: summary.total,
    yourShare: summary.yourShare,
    partnerShare: summary.partnerShare,
    balance: summary.balance
  };
}

/**
 * Assemble la phrase du solde autour du montant
 *
 * Le montant est mis en évidence ; le reste vient de describeBalance, qui
 * accorde la conjugaison au sujet.
 *
 * @param {Object} solde - Sortie de describeBalance
 * @param {number} montant - Solde du mois
 * @returns {string} Fragment HTML
 */
function phraseSolde(solde, montant) {
  const somme = `<strong>${formatCurrency(Math.abs(montant))}</strong>`;
  return solde.suffixe
    ? `${escapeHtml(solde.prefixe)} ${somme} ${escapeHtml(solde.suffixe)}`
    : `${escapeHtml(solde.prefixe)} ${somme}`;
}

/**
 * Affiche le bilan dans le DOM
 * @param {Object} summary - Résumé calculé
 */
function renderSummary(summary) {
  const summaryElement = document.getElementById('summarySection');
  if (!summaryElement) {
    warn('⚠️ Element #summarySection introuvable');
    return;
  }

  const {
    totalCharges,
    yourTheoricalShare,
    partnerTheoricalShare,
    yourActualPayments,
    partnerActualPayments,
    reimbursementAdjustment,
    carryOver,
    finalBalance,
    virementsByDestination
  } = summary;

  // Calculer les pourcentages de répartition
  const yourPercent = totalCharges > 0 ? Math.round((yourTheoricalShare / totalCharges) * 100) : 50;
  const partnerPercent = totalCharges > 0 ? 100 - yourPercent : 50;

  // Déterminer qui doit à qui
  const membres = getState('members');
  const nomVous = memberLabel('vous', membres);
  const nomConjointe = memberLabel('conjointe', membres);
  const soldeDit = describeBalance(finalBalance, membres);

  let balanceText;
  let balanceClass;

  if (finalBalance > 0) {
    balanceText = phraseSolde(soldeDit, finalBalance);
    balanceClass = 'balance-positive';
  } else if (finalBalance < 0) {
    balanceText = phraseSolde(soldeDit, finalBalance);
    balanceClass = 'balance-negative';
  } else {
    balanceText = `<strong>Comptes équilibrés</strong> — rien à se rembourser`;
    balanceClass = 'balance-zero';
  }

  // Explication du calcul (utilise le solde arrondi pour éviter décalage d'1 centime)
  let balanceExplanation = '';
  if (carryOver !== 0) {
    // Avec un report, « a payé plus que sa part » serait faux : le solde
    // affiché mêle le mois courant et l'ardoise des mois précédents. On dit
    // donc explicitement quelle part vient du passé.
    const debiteur = carryOver > 0 ? 'la conjointe devait' : 'vous deviez';
    balanceExplanation = `<small>dont ${formatCurrency(Math.abs(carryOver))} que ${debiteur} déjà au titre des mois précédents</small>`;
  } else if (finalBalance !== 0) {
    const overpayer = soldeDit.crediteur;
    balanceExplanation = `<small>${escapeHtml(overpayer)} a payé ${formatCurrency(Math.abs(finalBalance))} de plus que sa part</small>`;
  }

  // L'action n'a de sens que s'il reste quelque chose à régler, et elle vit
  // dans le bilan — pas dans la barre.
  //
  // Elle a été dans la barre tant que celle-ci restait visible en permanence :
  // c'était là qu'on lisait le solde. Depuis que la barre s'efface tant que le
  // bilan dit la même chose, l'y laisser rendait le bouton inatteignable
  // précisément sur le premier écran, celui où l'on décide de solder. Sept
  // contrôles de bout en bout l'ont dit avant qu'on ne s'en aperçoive à
  // l'usage.
  //
  // Le bilan porte le montant, son explication et maintenant son geste. La
  // barre redevient ce qu'elle prétend être : un rappel pendant qu'on parcourt
  // les charges, qui invite à remonter.
  const settleButton = finalBalance !== 0
    ? '<button type="button" class="btn-settle" data-action="settleBalance">Régler ce solde</button>'
    : '';

  // Le texte est enveloppé : sans cela, la mise en page flex de la barre
  // scinderait « Conjointe vous doit » et le montant en deux éléments séparés
  // par un intervalle.
  // Même texte que le bilan : une seule source, pas de calcul dupliqué
  updateBalanceBar(`<span>${balanceText}</span>`, balanceClass);

  // Les budgets se lisent sur les mêmes charges que le bilan : ils se
  // rafraîchissent au même moment, sans hameçon supplémentaire dans chaque
  // chargeur.
  renderCategoryBudgets();

  summaryElement.innerHTML = `
    <div class="summary-card">
      <div class="summary-balance ${balanceClass}">
        ${balanceText}
        ${balanceExplanation}
        ${settleButton}
      </div>

      <details class="summary-details">
        <summary>Voir le détail</summary>

        <div class="summary-row summary-total-row">
          <span>Total des charges</span>
          <strong>${formatCurrency(totalCharges)}</strong>
        </div>

        <div class="summary-divider"></div>

        <div class="summary-section-label">Répartition à payer</div>
        <div class="summary-row">
          <span>${escapeHtml(nomVous)} <span class="summary-percent">${yourPercent}%</span></span>
          <strong>${formatCurrency(yourTheoricalShare)}</strong>
        </div>
        <div class="summary-row">
          <span>${escapeHtml(nomConjointe)} <span class="summary-percent">${partnerPercent}%</span></span>
          <strong>${formatCurrency(partnerTheoricalShare)}</strong>
        </div>

        <div class="summary-divider"></div>

        <div class="summary-section-label">Paiements réels</div>
        <div class="summary-row">
          <span>${escapeHtml(nomVous)} a payé</span>
          <strong>${formatCurrency(yourActualPayments)}</strong>
        </div>
        <div class="summary-row">
          <span>${escapeHtml(memberLabel('conjointe', getState('members')))} a payé</span>
          <strong>${formatCurrency(partnerActualPayments)}</strong>
        </div>

        ${reimbursementAdjustment !== 0 ? `
          <div class="summary-divider"></div>
          <div class="summary-row">
            <span>Remboursements effectués</span>
            <strong class="${reimbursementAdjustment > 0 ? 'positive' : 'negative'}">${reimbursementAdjustment > 0 ? '+' : ''}${formatCurrency(reimbursementAdjustment)}</strong>
          </div>
        ` : ''}
      </details>
    </div>

    ${renderBudgetGauge(totalCharges)}

    ${virementsByDestination && virementsByDestination.length > 0 ? `
    <div class="summary-card virements-recap">
      <h3>🏦 Récap virements — ${escapeHtml(nomConjointe)}</h3>
      <p class="virements-subtitle">Montants à virer par destination</p>

      ${virementsByDestination.map(group => `
        <div class="virement-group">
          <div class="virement-destination">
            <span class="virement-dest-name">${escapeHtml(group.destination)}</span>
            <strong class="virement-dest-total">${formatCurrency(group.total)}</strong>
          </div>
          <div class="virement-details">
            ${group.charges.map(c => `
              <div class="virement-detail-row">
                <span>${escapeHtml(c.description)}</span>
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

  // Le bilan vient d'être réécrit : l'élément que la barre observait n'existe
  // plus. Sans ce rappel, l'observation resterait posée sur un nœud détaché —
  // ce qui ne lève rien, mais fige la barre dans son dernier état.
  suivreLeBilan();
}

/**
 * Reflète le solde net dans la barre collante
 *
 * L'application répond à une question — qui doit combien à qui — et il fallait
 * faire défiler jusqu'au bilan pour la lire. La barre reprend le texte déjà
 * produit pour le bilan : aucune logique de calcul n'est dupliquée.
 *
 * @param {string|null} html - Texte du solde, déjà échappé ; null pour masquer
 * @param {string} cssClass - balance-positive | balance-negative | balance-zero
 */
function updateBalanceBar(html, cssClass) {
  const bar = document.getElementById('balanceBar');
  if (!bar) return;

  if (!html) {
    bar.hidden = true;
    bar.innerHTML = '';
    // La classe s'en va avec le contenu : la garder ferait qu'un solde
    // redevenu calculable ressusciterait la barre déjà repliée, sans que le
    // bilan ait rien à voir avec cet état.
    bar.classList.remove(CLASSE_REDONDANTE);
    return;
  }

  bar.className = `balance-bar ${cssClass}`;
  bar.innerHTML = html;
  bar.hidden = false;
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

  const budgetLimit = parseMontantOu(budgetInput.value);
  if (budgetLimit <= 0) return '';

  const percentage = Math.min((totalCharges / budgetLimit) * 100, 100);
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

// Note : La reconduction de période est gérée par le module reconduction.js

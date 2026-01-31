// ===== MODULE : ANALYSE PAR CATÉGORIE =====
// Fonctionnalités : statistiques, comparaisons, visualisation par catégorie

import { getState } from '../state.js';
import { formatCurrency } from '../utils/format.js';

/**
 * Initialise le module d'analyse par catégorie
 */
export function initCategories() {
  console.log('📦 Initialisation module analyse catégories');

  setupCategoryAnalysisUI();

  console.log('✅ Module analyse catégories initialisé');
}

/**
 * Configure les listeners UI pour l'analyse par catégorie
 */
function setupCategoryAnalysisUI() {
  const analyzeBtn = document.getElementById('analyzeCategoriesBtn');

  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      analyzeCategoriesData();
      renderCategoryAnalysis();
    });
  }

  // Analyser automatiquement au chargement
  analyzeCategoriesData();
}

/**
 * Analyse les données par catégorie
 * @returns {Object} Données d'analyse par catégorie
 */
export function analyzeCategoriesData() {
  const fixedCharges = getState('fixedCharges') || [];
  const variableCharges = getState('variableCharges') || [];

  const analysis = {
    fixed: analyzeCategoryType(fixedCharges, 'fixed'),
    variable: analyzeCategoryType(variableCharges, 'variable'),
    total: {}
  };

  // Calculer les totaux globaux
  analysis.total = calculateTotalAnalysis(analysis.fixed, analysis.variable);

  return analysis;
}

/**
 * Analyse un type de charges par catégorie
 * @param {Array} charges - Liste des charges
 * @param {string} type - Type de charges ('fixed' ou 'variable')
 * @returns {Object} Analyse par catégorie
 */
function analyzeCategoryType(charges, type) {
  const categoryData = {};

  // Grouper par catégorie
  charges.forEach(charge => {
    const category = charge.category || 'Autre';

    if (!categoryData[category]) {
      categoryData[category] = {
        category: category,
        type: type,
        charges: [],
        total: 0,
        count: 0,
        average: 0,
        paidByYou: 0,
        paidByPartner: 0
      };
    }

    categoryData[category].charges.push(charge);
    categoryData[category].total += charge.amount;
    categoryData[category].count++;

    if (charge.paidBy === 'vous') {
      categoryData[category].paidByYou += charge.amount;
    } else {
      categoryData[category].paidByPartner += charge.amount;
    }
  });

  // Calculer les moyennes et pourcentages
  const totalAmount = Object.values(categoryData).reduce((sum, cat) => sum + cat.total, 0);

  Object.values(categoryData).forEach(cat => {
    cat.average = cat.count > 0 ? cat.total / cat.count : 0;
    cat.percentage = totalAmount > 0 ? (cat.total / totalAmount) * 100 : 0;
  });

  return categoryData;
}

/**
 * Calcule l'analyse totale (fixed + variable)
 * @param {Object} fixedAnalysis - Analyse charges fixes
 * @param {Object} variableAnalysis - Analyse charges variables
 * @returns {Object} Analyse totale
 */
function calculateTotalAnalysis(fixedAnalysis, variableAnalysis) {
  const totalData = {};

  // Fusionner les catégories
  const allCategories = new Set([
    ...Object.keys(fixedAnalysis),
    ...Object.keys(variableAnalysis)
  ]);

  allCategories.forEach(category => {
    const fixed = fixedAnalysis[category] || { total: 0, count: 0, paidByYou: 0, paidByPartner: 0 };
    const variable = variableAnalysis[category] || { total: 0, count: 0, paidByYou: 0, paidByPartner: 0 };

    totalData[category] = {
      category: category,
      total: fixed.total + variable.total,
      count: fixed.count + variable.count,
      paidByYou: fixed.paidByYou + variable.paidByYou,
      paidByPartner: fixed.paidByPartner + variable.paidByPartner,
      fixedTotal: fixed.total,
      variableTotal: variable.total
    };
  });

  // Calculer les pourcentages
  const grandTotal = Object.values(totalData).reduce((sum, cat) => sum + cat.total, 0);

  Object.values(totalData).forEach(cat => {
    cat.percentage = grandTotal > 0 ? (cat.total / grandTotal) * 100 : 0;
    cat.average = cat.count > 0 ? cat.total / cat.count : 0;
  });

  return totalData;
}

/**
 * Affiche l'analyse par catégorie dans le DOM
 */
export function renderCategoryAnalysis() {
  const analysis = analyzeCategoriesData();
  const container = document.getElementById('categoryAnalysisContainer');

  if (!container) {
    console.warn('⚠️ Element #categoryAnalysisContainer introuvable');
    return;
  }

  // Vider le conteneur
  container.innerHTML = '';

  // Trier les catégories par total décroissant
  const sortedCategories = Object.values(analysis.total).sort((a, b) => b.total - a.total);

  if (sortedCategories.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucune donnée à analyser pour cette période</p>';
    return;
  }

  // Créer le tableau d'analyse
  const table = document.createElement('table');
  table.className = 'category-analysis-table';

  // En-tête
  table.innerHTML = `
    <thead>
      <tr>
        <th>Catégorie</th>
        <th>Total</th>
        <th>%</th>
        <th>Nombre</th>
        <th>Moyenne</th>
        <th>Payé par Vous</th>
        <th>Payé par Conjointe</th>
        <th>Fixes</th>
        <th>Variables</th>
      </tr>
    </thead>
    <tbody>
    </tbody>
  `;

  const tbody = table.querySelector('tbody');

  // Lignes de données
  sortedCategories.forEach((cat, index) => {
    const row = document.createElement('tr');
    row.className = index % 2 === 0 ? 'even' : 'odd';

    row.innerHTML = `
      <td class="category-name">
        <span class="category-icon">${getCategoryIcon(cat.category)}</span>
        ${cat.category}
      </td>
      <td class="amount-total"><strong>${formatCurrency(cat.total)}</strong></td>
      <td class="percentage">
        <div class="percentage-bar">
          <div class="percentage-fill" style="width: ${cat.percentage}%"></div>
          <span class="percentage-text">${cat.percentage.toFixed(1)}%</span>
        </div>
      </td>
      <td class="count">${cat.count}</td>
      <td class="amount">${formatCurrency(cat.average)}</td>
      <td class="amount">${formatCurrency(cat.paidByYou)}</td>
      <td class="amount">${formatCurrency(cat.paidByPartner)}</td>
      <td class="amount">${formatCurrency(cat.fixedTotal)}</td>
      <td class="amount">${formatCurrency(cat.variableTotal)}</td>
    `;

    tbody.appendChild(row);
  });

  // Ligne de total
  const grandTotal = sortedCategories.reduce((sum, cat) => sum + cat.total, 0);
  const totalCount = sortedCategories.reduce((sum, cat) => sum + cat.count, 0);
  const totalYou = sortedCategories.reduce((sum, cat) => sum + cat.paidByYou, 0);
  const totalPartner = sortedCategories.reduce((sum, cat) => sum + cat.paidByPartner, 0);
  const totalFixed = sortedCategories.reduce((sum, cat) => sum + cat.fixedTotal, 0);
  const totalVariable = sortedCategories.reduce((sum, cat) => sum + cat.variableTotal, 0);

  const totalRow = document.createElement('tr');
  totalRow.className = 'total-row';
  totalRow.innerHTML = `
    <td class="category-name"><strong>TOTAL</strong></td>
    <td class="amount-total"><strong>${formatCurrency(grandTotal)}</strong></td>
    <td class="percentage"><strong>100%</strong></td>
    <td class="count"><strong>${totalCount}</strong></td>
    <td class="amount"><strong>${formatCurrency(grandTotal / totalCount)}</strong></td>
    <td class="amount"><strong>${formatCurrency(totalYou)}</strong></td>
    <td class="amount"><strong>${formatCurrency(totalPartner)}</strong></td>
    <td class="amount"><strong>${formatCurrency(totalFixed)}</strong></td>
    <td class="amount"><strong>${formatCurrency(totalVariable)}</strong></td>
  `;

  tbody.appendChild(totalRow);

  container.appendChild(table);

  // Ajouter insights
  renderCategoryInsights(sortedCategories);
}

/**
 * Affiche des insights sur les catégories
 * @param {Array} categories - Catégories triées
 */
function renderCategoryInsights(categories) {
  const insightsContainer = document.getElementById('categoryInsights');

  if (!insightsContainer || categories.length === 0) {
    return;
  }

  const insights = [];

  // Top 3 catégories
  const top3 = categories.slice(0, 3);
  const topCategoriesText = top3.map(cat =>
    `${cat.category} (${formatCurrency(cat.total)})`
  ).join(', ');

  insights.push(`📊 <strong>Top 3 catégories :</strong> ${topCategoriesText}`);

  // Catégorie la plus fréquente
  const mostFrequent = categories.reduce((max, cat) => cat.count > max.count ? cat : max, categories[0]);
  insights.push(`🔢 <strong>Plus fréquente :</strong> ${mostFrequent.category} (${mostFrequent.count} charges)`);

  // Catégorie avec la moyenne la plus élevée
  const highestAverage = categories.reduce((max, cat) => cat.average > max.average ? cat : max, categories[0]);
  insights.push(`💰 <strong>Moyenne la plus élevée :</strong> ${highestAverage.category} (${formatCurrency(highestAverage.average)})`);

  // Répartition Vous vs Conjointe
  const totalYou = categories.reduce((sum, cat) => sum + cat.paidByYou, 0);
  const totalPartner = categories.reduce((sum, cat) => sum + cat.paidByPartner, 0);
  const total = totalYou + totalPartner;

  if (total > 0) {
    const youPercentage = (totalYou / total * 100).toFixed(1);
    const partnerPercentage = (totalPartner / total * 100).toFixed(1);
    insights.push(`👥 <strong>Répartition paiements :</strong> Vous ${youPercentage}% - Conjointe ${partnerPercentage}%`);
  }

  // Afficher
  insightsContainer.innerHTML = `
    <div class="insights-box">
      <h3>💡 Insights</h3>
      <ul>
        ${insights.map(insight => `<li>${insight}</li>`).join('')}
      </ul>
    </div>
  `;
}

/**
 * Retourne l'icône pour une catégorie
 * @param {string} category - Nom de la catégorie
 * @returns {string} HTML de l'icône
 */
function getCategoryIcon(category) {
  const icons = {
    // Charges fixes
    'Loyer': '🏠',
    'Énergie': '⚡',
    'Internet': '📡',
    'Assurances': '🛡️',
    'Abonnements': '📅',
    // Charges variables
    'Alimentation': '🍽️',
    'Transport': '🚗',
    'Loisirs': '🎮',
    'Santé': '❤️',
    'Autre': '📦'
  };

  return icons[category] || '📦';
}

/**
 * Obtient les statistiques pour une catégorie spécifique
 * @param {string} categoryName - Nom de la catégorie
 * @returns {Object|null} Statistiques de la catégorie
 */
export function getCategoryStats(categoryName) {
  const analysis = analyzeCategoriesData();
  return analysis.total[categoryName] || null;
}

/**
 * Compare deux catégories
 * @param {string} category1 - Première catégorie
 * @param {string} category2 - Deuxième catégorie
 * @returns {Object} Comparaison
 */
export function compareCategories(category1, category2) {
  const stats1 = getCategoryStats(category1);
  const stats2 = getCategoryStats(category2);

  if (!stats1 || !stats2) {
    return null;
  }

  return {
    categories: [category1, category2],
    totalDifference: stats1.total - stats2.total,
    countDifference: stats1.count - stats2.count,
    averageDifference: stats1.average - stats2.average,
    percentageDifference: stats1.percentage - stats2.percentage
  };
}

// Exposer globalement pour compatibilité
window.analyzeCategoriesData = analyzeCategoriesData;
window.renderCategoryAnalysis = renderCategoryAnalysis;
window.getCategoryStats = getCategoryStats;
window.compareCategories = compareCategories;

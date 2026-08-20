// ===== MODULE : ANALYSE PAR CATÉGORIE =====
//
// Ce module ne calculait que pour lui-même. Ses fonctions d'affichage
// visaient #categoryAnalysisContainer, absent du HTML, et personne ne les
// appelait ; son bouton d'analyse n'existait pas davantage. Le panneau
// « Analyse par Catégorie » n'a donc jamais rien montré.
//
// Il ne reste ici que le calcul, désormais consommé par les budgets par
// catégorie (modules/category-budgets.js).

import { getState } from '../state.js';

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

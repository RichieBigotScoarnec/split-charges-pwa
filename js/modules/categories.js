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
import { chargesCommunes } from '../utils/perimetre.js';

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

  // Trois gardes que le bilan porte depuis longtemps, et qui manquaient ici.
  //
  // 1. La suppression. Aucun filtre sur `deleted` : une charge mise à la
  //    corbeille continuait de consommer son budget de catégorie. Mesuré :
  //    100 € + 400 € supprimés donnaient « 500 € sur 2 charges ».
  // 2. Le montant. `total += charge.amount` sans garde, alors que les règles
  //    acceptent une charge sans `amount` (vérifié contre le moteur réel) :
  //    une seule suffisait à rendre toute la catégorie `NaN`, donc le panneau
  //    entier. C'est le défaut consigné « ✅ RÉSOLU 2026-08-24 » — la
  //    correction avait été posée dans `calculations.js`, et là seulement.
  // 3. Le payeur. `else` attribuait à la conjointe tout ce qui n'était pas
  //    `vous`, « partage » compris : 300 € partagés lui étaient comptés en
  //    entier.
  // 4. Le périmètre. Une dépense solo consommerait un budget commun sans que
  //    l'autre puisse l'expliquer, et déclencherait une alerte de dépassement
  //    pour un achat qui n'en relève pas.
  //
  // Ces totaux alimentent `category-budgets.js`, donc le panneau « X dépensés
  // sur Y budgétés » et la détection de dépassement.
  chargesCommunes(charges).filter(charge => charge && !charge.deleted).forEach(charge => {
    const category = charge.category || 'Autre';
    const montant = Number.isFinite(charge.amount) ? charge.amount : 0;

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
    categoryData[category].total += montant;
    categoryData[category].count++;

    if (charge.paidBy === 'vous') {
      categoryData[category].paidByYou += montant;
    } else if (charge.paidBy === 'conjointe') {
      categoryData[category].paidByPartner += montant;
    } else {
      // Une charge partagée n'a pas été payée par une seule personne : la
      // moitié à chacun est une approximation, mais elle ne ment pas de tout
      // le montant.
      categoryData[category].paidByYou += montant / 2;
      categoryData[category].paidByPartner += montant / 2;
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


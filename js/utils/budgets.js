/**
 * FairSplit — Budgets par catégorie
 *
 * Le budget mensuel existant est global : il dit qu'on a trop dépensé, jamais
 * en quoi. Un dépassement de 200 € appelle une décision différente selon qu'il
 * vient des courses ou des loisirs, et l'information manquait.
 *
 * Un budget est une intention durable, pas une donnée du mois : il vaut pour
 * tous les mois tant qu'on ne le change pas, et se compare aux dépenses de la
 * période affichée.
 */

import { parseMontant } from './montant.js';

/** Part du budget à partir de laquelle on alerte sans qu'il soit dépassé */
const SEUIL_ALERTE = 80;

/**
 * Établit l'état de chaque catégorie face à son budget
 *
 * Les catégories budgétées passent devant, les plus tendues en tête : c'est là
 * qu'une décision se prend. Les catégories dépensées sans budget suivent, par
 * montant décroissant — elles suggèrent les budgets qui manquent.
 *
 * @param {Object} analysisTotal - Totaux par catégorie, tels que produits par analyzeCategoriesData().total
 * @param {Object} budgets - Budgets définis, par nom de catégorie
 * @returns {Array<{category: string, spent: number, budget: number, percentage: number, remaining: number, status: string}>}
 */
export function computeCategoryBudgets(analysisTotal, budgets) {
  const depenses = analysisTotal && typeof analysisTotal === 'object' ? analysisTotal : {};
  const limites = budgets && typeof budgets === 'object' ? budgets : {};

  // Une catégorie budgétée mais sans dépense ce mois-ci doit apparaître : son
  // budget intact est une information, pas une absence.
  const noms = new Set([...Object.keys(depenses), ...Object.keys(limites)]);

  const lignes = [];

  for (const nom of noms) {
    const spent = toPositiveNumber(depenses[nom]?.total);
    const budget = toPositiveNumber(limites[nom]);

    if (budget === 0 && spent === 0) continue;

    lignes.push({
      category: nom,
      spent,
      budget,
      percentage: budget > 0 ? (spent / budget) * 100 : 0,
      remaining: budget > 0 ? budget - spent : 0,
      status: resolveStatus(spent, budget)
    });
  }

  return lignes.sort(compareLignes);
}

/**
 * Ordre d'affichage : budgétées d'abord, les plus tendues en tête
 * @param {Object} a - Première ligne
 * @param {Object} b - Seconde ligne
 * @returns {number} Ordre relatif
 */
function compareLignes(a, b) {
  const aBudgetee = a.budget > 0;
  const bBudgetee = b.budget > 0;

  if (aBudgetee !== bBudgetee) return aBudgetee ? -1 : 1;
  if (aBudgetee) return b.percentage - a.percentage;
  return b.spent - a.spent;
}

/**
 * Qualifie l'état d'une catégorie
 * @param {number} spent - Dépensé ce mois-ci
 * @param {number} budget - Budget défini, 0 si absent
 * @returns {string} 'unset' | 'ok' | 'warning' | 'over'
 */
function resolveStatus(spent, budget) {
  if (budget <= 0) return 'unset';

  const part = (spent / budget) * 100;
  if (part > 100) return 'over';
  if (part >= SEUIL_ALERTE) return 'warning';
  return 'ok';
}

/**
 * Ramène une valeur venant de la base à un nombre positif exploitable
 * @param {*} valeur - Valeur brute
 * @returns {number} Nombre fini positif, 0 à défaut
 */
function toPositiveNumber(valeur) {
  const n = parseMontant(valeur);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Résume l'ensemble des catégories budgétées
 *
 * @param {Array<Object>} lignes - Sortie de computeCategoryBudgets
 * @returns {{budgeted: number, spent: number, over: number, warning: number}} Compteurs et totaux
 */
export function summarizeBudgets(lignes) {
  const budgetees = (lignes || []).filter(l => l.budget > 0);

  return {
    budgeted: budgetees.reduce((somme, l) => somme + l.budget, 0),
    spent: budgetees.reduce((somme, l) => somme + l.spent, 0),
    over: budgetees.filter(l => l.status === 'over').length,
    warning: budgetees.filter(l => l.status === 'warning').length
  };
}

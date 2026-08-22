/**
 * FairSplit — Validation des saisies
 *
 * Ce module existait, testé, et n'était importé par personne : chaque
 * formulaire réécrivait ses contrôles à la main. Les règles avaient donc
 * divergé — une charge de 80 000 € passait par un formulaire et était refusée
 * par un autre.
 *
 * Une règle énoncée une fois ne peut plus diverger d'elle-même.
 */

import { LIMITS } from '../config.js';

/**
 * Validate amount
 * @param {number} value - Amount to validate
 * @param {string} fieldName - Field name for error message
 * @param {number} max - Maximum allowed value
 * @returns {{valid: boolean, error?: string}}
 */
export function validateAmount(value, fieldName = 'Montant', max = LIMITS.MAX_CHARGE) {
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: `${fieldName} est requis` };
  }

  const num = parseFloat(value);

  if (isNaN(num)) {
    return { valid: false, error: `${fieldName} doit être un nombre` };
  }

  if (num < 0) {
    return { valid: false, error: `${fieldName} ne peut pas être négatif` };
  }

  if (num > max) {
    return { valid: false, error: `${fieldName} ne peut pas dépasser ${max}€` };
  }

  return { valid: true };
}

/**
 * Valide le montant d'une charge ou d'un remboursement
 *
 * Zero est refuse ici alors que validateAmount l'accepte : un salaire nul est
 * une situation reelle, une charge de zero euro n'apprend rien. Tous les
 * formulaires appliquaient deja cette regle a la main.
 *
 * @param {number|string} value - Montant saisi
 * @returns {{valid: boolean, error?: string}} Validite et motif du refus
 */
export function validateChargeAmount(value) {
  const base = validateAmount(value, 'Montant', LIMITS.MAX_CHARGE);
  if (!base.valid) return base;

  if (parseFloat(value) === 0) {
    return { valid: false, error: 'Montant doit être supérieur à zéro' };
  }

  return { valid: true };
}

/**
 * Validate required string
 * @param {string} value
 * @param {string} fieldName
 * @param {number} maxLength
 * @returns {{valid: boolean, error?: string}}
 */
export function validateRequired(value, fieldName = 'Champ', maxLength = LIMITS.MAX_NAME_LENGTH) {
  if (!value || !value.trim()) {
    return { valid: false, error: `${fieldName} est requis` };
  }

  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} ne peut pas dépasser ${maxLength} caractères` };
  }

  return { valid: true };
}

/**
 * Validate charge name
 * @param {string} value
 * @returns {{valid: boolean, error?: string}}
 */
export function validateChargeName(value) {
  return validateRequired(value, 'Nom de la charge', LIMITS.MAX_NAME_LENGTH);
}


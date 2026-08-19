/**
 * FairSplit - Validation Utilities
 * @description Fonctions de validation des entrées
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
 * Validate salary
 * @param {number} value
 * @returns {{valid: boolean, error?: string}}
 */
export function validateSalary(value) {
  return validateAmount(value, 'Salaire', LIMITS.MAX_SALARY);
}

/**
 * Validate charge amount
 * @param {number} value
 * @returns {{valid: boolean, error?: string}}
 */
export function validateChargeAmount(value) {
  return validateAmount(value, 'Montant', LIMITS.MAX_CHARGE);
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

/**
 * Validate note (optional)
 * @param {string} value
 * @returns {{valid: boolean, error?: string}}
 */
export function validateNote(value) {
  if (!value) return { valid: true };

  if (value.length > LIMITS.MAX_NOTE_LENGTH) {
    return { valid: false, error: `La note ne peut pas dépasser ${LIMITS.MAX_NOTE_LENGTH} caractères` };
  }

  return { valid: true };
}

/**
 * Validate percentage (0-100)
 * @param {number} value
 * @returns {{valid: boolean, error?: string}}
 */
export function validatePercentage(value) {
  const num = parseFloat(value);

  if (isNaN(num)) {
    return { valid: false, error: 'Pourcentage invalide' };
  }

  if (num < 0 || num > 100) {
    return { valid: false, error: 'Le pourcentage doit être entre 0 et 100' };
  }

  return { valid: true };
}

/**
 * Validate custom split (both percentages must sum to 100)
 * @param {number} percentVous
 * @param {number} percentConjointe
 * @returns {{valid: boolean, error?: string}}
 */
export function validateCustomSplit(percentVous, percentConjointe) {
  const v1 = validatePercentage(percentVous);
  if (!v1.valid) return v1;

  const v2 = validatePercentage(percentConjointe);
  if (!v2.valid) return v2;

  const sum = parseFloat(percentVous) + parseFloat(percentConjointe);
  if (Math.abs(sum - 100) > 0.01) {
    return { valid: false, error: 'Les pourcentages doivent totaliser 100%' };
  }

  return { valid: true };
}

/**
 * Validate period string (YYYY-MM)
 * @param {string} period
 * @returns {{valid: boolean, error?: string}}
 */
export function validatePeriod(period) {
  if (!period) {
    return { valid: false, error: 'Période requise' };
  }

  const regex = /^\d{4}-(?:0[1-9]|1[0-2])$/;
  if (!regex.test(period)) {
    return { valid: false, error: 'Format de période invalide (YYYY-MM)' };
  }

  return { valid: true };
}

/**
 * Validate charge object
 * @param {Object} charge
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateCharge(charge) {
  const errors = [];

  const nameResult = validateChargeName(charge.name);
  if (!nameResult.valid) errors.push(nameResult.error);

  const amountResult = validateChargeAmount(charge.amount);
  if (!amountResult.valid) errors.push(amountResult.error);

  if (charge.note) {
    const noteResult = validateNote(charge.note);
    if (!noteResult.valid) errors.push(noteResult.error);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

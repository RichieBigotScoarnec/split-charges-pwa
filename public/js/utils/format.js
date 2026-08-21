/**
 * FairSplit - Format Utilities
 * @description Fonctions de formatage (devise, nombres)
 */

import { getState } from '../state.js';
import { memberLabel } from './members.js';

/**
 * Format amount as currency (EUR)
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount || 0);
}

/**
 * Format amount as short currency (no decimals for large amounts)
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrencyShort(amount) {
  if (Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(amount);
  }
  return formatCurrency(amount);
}

/**
 * Format percentage
 * @param {number} value - Value (0-100 or 0-1)
 * @param {boolean} isDecimal - If true, value is 0-1
 * @returns {string}
 */
export function formatPercentage(value, isDecimal = false) {
  const percent = isDecimal ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

/**
 * Format number with French locale
 * @param {number} value
 * @param {number} decimals
 * @returns {string}
 */
export function formatNumber(value, decimals = 2) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value || 0);
}

/**
 * Parse currency string to number
 * @param {string} value - Currency string
 * @returns {number}
 */
export function parseCurrency(value) {
  if (typeof value === 'number') return value;
  if (!value) return 0;

  // Remove currency symbol, spaces, and replace comma with dot
  const cleaned = value
    .replace(/[€\s]/g, '')
    .replace(',', '.');

  return parseFloat(cleaned) || 0;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} unsafe - Unsafe string
 * @returns {string} Escaped string
 */
export function escapeHtml(unsafe) {
  if (!unsafe) return '';
  const div = document.createElement('div');
  div.textContent = unsafe;
  return div.innerHTML;
}

/**
 * Formate le nom du payeur pour affichage
 * @param {string} paidBy - Valeur du payeur ('vous', 'conjointe', 'joint')
 * @returns {string} Nom lisible
 */
export function formatPaidBy(paidBy) {
  // Sept appelants passent par ici : c'est le seul endroit ou une cle de
  // stockage devient un libelle. Les prenoms y sont donc resolus une fois.
  return memberLabel(paidBy, getState('members'));
}

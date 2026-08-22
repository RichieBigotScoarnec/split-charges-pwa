/**
 * FairSplit - Date Utilities
 * @description Fonctions de manipulation de dates et périodes
 */

/**
 * Get current period string (YYYY-MM)
 * @returns {string}
 */
export function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Parse period string to Date
 * @param {string} period - Period string (YYYY-MM)
 * @returns {Date}
 */
export function parsePeriod(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * Format period for display
 * @param {string} period - Period string (YYYY-MM)
 * @returns {string} Formatted string (e.g., "janvier 2026")
 */
export function formatPeriod(period) {
  const date = parsePeriod(period);
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'long'
  }).format(date);
}

/**
 * Format date for display
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  // `Intl.format(undefined)` affiche la date du jour : une charge sans date
  // s'affichait donc comme datée d'aujourd'hui, ce qui est pire qu'un vide —
  // l'absence devenait une affirmation fausse.
  if (date === null || date === undefined || date === '') return '';

  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(d);
}


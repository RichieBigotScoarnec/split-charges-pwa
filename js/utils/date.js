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
 * Format period short
 * @param {string} period
 * @returns {string} (e.g., "jan. 2026")
 */
export function formatPeriodShort(period) {
  const date = parsePeriod(period);
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'short'
  }).format(date);
}

/**
 * Get previous period
 * @param {string} period
 * @returns {string}
 */
export function getPreviousPeriod(period) {
  const date = parsePeriod(period);
  date.setMonth(date.getMonth() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get next period
 * @param {string} period
 * @returns {string}
 */
export function getNextPeriod(period) {
  const date = parsePeriod(period);
  date.setMonth(date.getMonth() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Generate list of periods (for dropdown)
 * @param {number} monthsBefore - Number of months before current
 * @param {number} monthsAfter - Number of months after current
 * @returns {Array<{value: string, label: string}>}
 */
export function generatePeriodList(monthsBefore = 12, monthsAfter = 1) {
  const periods = [];
  const now = new Date();

  for (let i = -monthsAfter; i <= monthsBefore; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const value = `${year}-${month}`;

    periods.push({
      value,
      label: formatPeriod(value),
      isCurrent: i === 0
    });
  }

  return periods;
}

/**
 * Check if period is current month
 * @param {string} period
 * @returns {boolean}
 */
export function isCurrentPeriod(period) {
  return period === getCurrentPeriod();
}

/**
 * Format date for display
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(d);
}

/**
 * Format date with time
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

/**
 * Get relative time (e.g., "il y a 2 heures")
 * @param {string|Date} date
 * @returns {string}
 */
export function getRelativeTime(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now - d;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (hours < 24) return `il y a ${hours}h`;
  if (days < 7) return `il y a ${days}j`;

  return formatDate(d);
}

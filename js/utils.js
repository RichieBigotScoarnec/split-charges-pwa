/**
 * FairSplit - Utility Functions
 * @description Fonctions utilitaires réutilisables
 */

/**
 * ✅ FIX CRITIQUE 3: Escape HTML to prevent XSS attacks
 * Converts special characters to HTML entities
 * @param {string} unsafe - Untrusted string that may contain HTML/JS
 * @returns {string} Safe string with HTML entities escaped
 *
 * @example
 * const userInput = '<script>alert("XSS")</script>';
 * element.innerHTML = escapeHtml(userInput);
 * // Result: &lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;
 */
export function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') {
    return '';
  }

  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format a number as currency (EUR)
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '0,00 €';
  }

  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
}

/**
 * Format a date as DD/MM/YYYY
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date) return '';

  const d = date instanceof Date ? date : new Date(date);

  if (isNaN(d.getTime())) {
    return '';
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Debounce a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ===== MODULE : RECHERCHE =====
// Fonctionnalités : recherche dans les charges avec debounce et highlighting

import { getState } from '../state.js';
import { formatCurrency } from '../utils/format.js';
import { formatDate } from '../utils/date.js';
import { escapeHtml } from '../utils.js';  // ✅ FIX CRITIQUE 3: Import escapeHtml for XSS protection

let searchTimeout = null;

/**
 * Initialise le module de recherche
 */
export function initSearch() {
  console.log('📦 Initialisation module recherche');

  setupSearchUI();

  console.log('✅ Module recherche initialisé');
}

/**
 * Configure les listeners UI de recherche
 */
function setupSearchUI() {
  const searchInput = document.getElementById('searchInput');
  const searchClearBtn = document.getElementById('searchClearBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      handleSearchInput(e.target.value);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearSearch();
      }
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', clearSearch);
  }
}

/**
 * Gère l'input de recherche avec debounce
 * @param {string} query - Texte recherché
 */
function handleSearchInput(query) {
  const trimmedQuery = query.trim();

  // Debounce: attendre 300ms après la dernière frappe
  clearTimeout(searchTimeout);

  if (!trimmedQuery) {
    hideSearchResults();
    return;
  }

  searchTimeout = setTimeout(() => {
    performSearch(trimmedQuery);
  }, 300);
}

/**
 * Effectue la recherche
 * @param {string} query - Texte recherché
 */
export function performSearch(query) {
  const results = searchInCharges(query.toLowerCase());
  displaySearchResults(results, query);
}

/**
 * Recherche dans toutes les charges
 * @param {string} query - Texte recherché (lowercase)
 * @returns {Array} Résultats de recherche
 */
function searchInCharges(query) {
  const fixedCharges = (getState('fixedCharges') || []).filter(c => !c.deleted);
  const variableCharges = (getState('variableCharges') || []).filter(c => !c.deleted);

  const results = [];

  // Recherche dans charges fixes
  fixedCharges.forEach(charge => {
    if (matchesQuery(charge, query)) {
      results.push({
        ...charge,
        type: 'fixed',
        typeLabel: 'Charge fixe'
      });
    }
  });

  // Recherche dans charges variables
  variableCharges.forEach(charge => {
    if (matchesQuery(charge, query)) {
      results.push({
        ...charge,
        type: 'variable',
        typeLabel: 'Charge variable'
      });
    }
  });

  return results;
}

/**
 * Vérifie si une charge correspond à la requête
 * @param {Object} charge - Charge à vérifier
 * @param {string} query - Requête (lowercase)
 * @returns {boolean}
 */
function matchesQuery(charge, query) {
  const description = (charge.description || '').toLowerCase();
  const category = (charge.category || '').toLowerCase();
  const note = (charge.note || '').toLowerCase();
  const amount = charge.amount.toString();

  return description.includes(query) ||
         category.includes(query) ||
         note.includes(query) ||
         amount.includes(query);
}

/**
 * Affiche les résultats de recherche
 * @param {Array} results - Résultats
 * @param {string} query - Requête originale
 */
function displaySearchResults(results, query) {
  const searchResultsInfo = document.getElementById('searchResultsInfo');
  const searchClearBtn = document.getElementById('searchClearBtn');

  if (!searchResultsInfo) return;

  // Afficher le nombre de résultats
  if (results.length === 0) {
    searchResultsInfo.innerHTML = `Aucun résultat pour "${escapeHtml(query)}"`;
    searchResultsInfo.classList.add('visible');
  } else {
    searchResultsInfo.innerHTML = `${results.length} résultat${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''}`;
    searchResultsInfo.classList.add('visible');
  }

  // Afficher le bouton clear
  if (searchClearBtn) {
    searchClearBtn.classList.add('visible');
  }

  // Filtrer l'affichage des charges
  filterChargesDisplay(results);
}

/**
 * Filtre l'affichage des charges selon les résultats
 * @param {Array} results - Résultats de recherche
 */
function filterChargesDisplay(results) {
  const resultIds = results.map(r => r.id);

  // Filtrer charges fixes
  const fixedChargesList = document.getElementById('fixedChargesList');
  if (fixedChargesList) {
    const fixedItems = fixedChargesList.querySelectorAll('.charge-item');
    fixedItems.forEach(item => {
      const chargeId = item.dataset.id;
      if (resultIds.includes(chargeId)) {
        item.style.display = '';
        item.classList.add('search-match');
      } else {
        item.style.display = 'none';
      }
    });
  }

  // Filtrer charges variables
  const variableChargesList = document.getElementById('variableChargesList');
  if (variableChargesList) {
    const variableItems = variableChargesList.querySelectorAll('.charge-item');
    variableItems.forEach(item => {
      const chargeId = item.dataset.id;
      if (resultIds.includes(chargeId)) {
        item.style.display = '';
        item.classList.add('search-match');
      } else {
        item.style.display = 'none';
      }
    });
  }

  // Masquer catégories vides
  hideEmptyCategories();
}

/**
 * Masque les catégories sans résultats visibles
 */
function hideEmptyCategories() {
  const categories = document.querySelectorAll('.charge-category');
  categories.forEach(category => {
    const visibleItems = category.querySelectorAll('.charge-item:not([style*="display: none"])');
    if (visibleItems.length === 0) {
      category.style.display = 'none';
    } else {
      category.style.display = '';
    }
  });
}

/**
 * Efface la recherche
 */
export function clearSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchResultsInfo = document.getElementById('searchResultsInfo');
  const searchClearBtn = document.getElementById('searchClearBtn');

  // Effacer l'input
  if (searchInput) {
    searchInput.value = '';
  }

  // Masquer les indicateurs
  if (searchResultsInfo) {
    searchResultsInfo.classList.remove('visible');
  }

  if (searchClearBtn) {
    searchClearBtn.classList.remove('visible');
  }

  // Réafficher toutes les charges
  showAllCharges();
}

/**
 * Masque les résultats de recherche
 */
function hideSearchResults() {
  clearSearch();
}

/**
 * Réaffiche toutes les charges
 */
function showAllCharges() {
  // Réafficher tous les items
  const allItems = document.querySelectorAll('.charge-item');
  allItems.forEach(item => {
    item.style.display = '';
    item.classList.remove('search-match');
  });

  // Réafficher toutes les catégories
  const categories = document.querySelectorAll('.charge-category');
  categories.forEach(category => {
    category.style.display = '';
  });
}

// ✅ FIX CRITIQUE 3: Function escapeHtml removed - now imported from utils.js

// Exposer globalement pour compatibilité
window.clearSearch = clearSearch;

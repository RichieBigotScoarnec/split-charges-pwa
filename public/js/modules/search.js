// ===== MODULE : RECHERCHE =====
// Fonctionnalités : recherche dans les charges avec debounce et highlighting

import { getState } from '../state.js';
import { escapeHtml, formatPaidBy } from '../utils/format.js';
import { formatDate, dateDeLaCharge } from '../utils/date.js';
import { jourDeTri } from '../utils/tri.js';
import { contient } from '../utils/recherche-texte.js';
import { log } from '../utils/debug.js';

let searchTimeout = null;

/**
 * Initialise le module de recherche
 */
export function initSearch() {
  log('📦 Initialisation module recherche');

  setupSearchUI();
  refreshSearchVisibility();

  log('✅ Module recherche initialisé');
}

/**
 * N'affiche la recherche que s'il y a quelque chose à chercher
 *
 * Un champ de filtre proposé sur un ensemble vide occupe de la place et
 * suggère une action sans objet. Appelée à l'initialisation et après chaque
 * modification des listes.
 */
export function refreshSearchVisibility() {
  const container = document.getElementById('searchBarContainer');
  if (!container) return;

  const total = ['fixedCharges', 'variableCharges']
    .flatMap(k => getState(k) || [])
    .filter(c => !c.deleted).length;

  container.hidden = total === 0;
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
  // Le pliage — minuscules et accents — appartient à la comparaison, qui le
  // fait des deux côtés. Abaisser la casse ici ne servait qu'à moitié.
  const results = searchInCharges(query);
  displaySearchResults(results, query);
}

/**
 * Recherche dans toutes les charges
 * @param {string} query - Texte recherché, tel que saisi
 * @returns {Array} Résultats de recherche
 */
export function searchInCharges(query) {
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

  // Recherche dans les remboursements
  //
  // Ils en étaient absents : chercher « courses » ne trouvait pas le
  // remboursement dont la note dit « Remboursement courses ». La recherche
  // affirmait donc balayer le mois alors qu'elle en ignorait un tiers.
  const reimbursements = (getState('reimbursements') || []).filter(r => !r.deleted);
  reimbursements.forEach(reimb => {
    if (matchesQuery(reimb, query)) {
      results.push({
        ...reimb,
        type: 'reimbursement',
        typeLabel: 'Remboursement'
      });
    }
  });

  return results;
}

/**
 * Vérifie si une charge correspond à la requête
 * @param {Object} charge - Charge à vérifier
 * @param {string} query - Requête, telle que saisie
 * @returns {boolean}
 */
function matchesQuery(charge, query) {
  // Chaque champ que l'écran affiche doit être atteignable par la recherche :
  // ce qu'on lit, on le cherche. Il en manquait quatre — le payeur,
  // l'enveloppe, la date et le lieu — de sorte que « Cindy », « vacances » ou
  // « 15 août » ne trouvaient rien alors que l'écran les affiche.
  //
  // `note` ne concerne que les remboursements ; les charges n'ont jamais porté
  // ce champ. Il reste ici parce que la recherche couvre désormais les deux.
  const champs = [
    charge.description,
    charge.category,
    charge.note,
    formatPaidBy(charge.paidBy),
    libelleEnveloppe(charge),
    // La date sous les deux formes : « 2026-08-15 » pour qui tape le mois, et
    // « 15 août 2026 » pour qui tape ce qu'il voit à l'écran.
    jourDeTri(charge),
    formatDate(dateDeLaCharge(charge)),
    // Les deux séparément, et non l'un ou l'autre : une charge nommée « Le
    // Bistrot » à Rennes doit se retrouver par l'enseigne comme par la ville.
    charge.location && charge.location.name,
    charge.location && charge.location.commune,
    charge.location && charge.location.codePostal
  ];

  // Une charge héritée peut ne pas porter de montant exploitable : appeler
  // toString() dessus interrompait la recherche entière sur une seule entrée.
  champs.push(String(charge.amount ?? ''));

  // La comparaison ignore désormais les accents : sur un clavier de téléphone
  // ils demandent un appui long, que personne ne fait pour chercher. Sans cela,
  // « intermarche » ne trouvait pas « Intermarché » et l'application répondait
  // « 0 résultat » sur une charge bien présente.
  return champs.some(champ => contient(champ, query));
}

/**
 * Libellé de l'enveloppe portée par une charge, s'il y en a une
 * @param {Object} charge
 * @returns {string}
 */
function libelleEnveloppe(charge) {
  if (!charge || !charge.envelope) return '';
  const enveloppe = (getState('envelopes') || []).find(e => e && e.id === charge.envelope);
  return enveloppe ? enveloppe.label : '';
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

// Exposer globalement pour compatibilité
window.clearSearch = clearSearch;

// ===== MODULE : RECHERCHE =====
// Fonctionnalités : recherche dans les charges avec debounce et highlighting

import { getState } from '../state.js';
import { escapeHtml, formatPaidBy } from '../utils/format.js';
import { formatDateEtHeure, heureDeLaCharge } from '../utils/date.js';
import { jourDeTri } from '../utils/tri.js';
import { contient, plier } from '../utils/recherche-texte.js';
import { montantCorrespond } from '../utils/recherche-montant.js';
import { log, error as logError } from '../utils/debug.js';
import { ecouterUneFois } from '../utils/ecouteur.js';
import { formatCurrency } from '../utils/format.js';
import { moisLisible } from './envelopes.js';
import { chargesDeTousLesMois, grouperParMois, moisRepresentes } from '../utils/recherche-historique.js';

let searchTimeout = null;

/**
 * La recherche porte-t-elle sur tout l'historique ?
 *
 * Faux par défaut : le mois affiché reste le cas ordinaire, et une lecture de
 * tout l'historique ne doit pas se déclencher à chaque frappe sans qu'on l'ait
 * demandée.
 */
let porteeHistorique = false;

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

  ecouterUneFois(searchInput, 'input', (e) => {
    handleSearchInput(e.target.value);
  });

  ecouterUneFois(searchInput, 'keydown', (e) => {
    if (e.key === 'Escape') {
      clearSearch();
    }
  });

  if (searchClearBtn) {
    ecouterUneFois(searchClearBtn, 'click', clearSearch);
  }

  // La portée. Changer d'avis relance la recherche en cours plutôt que
  // d'obliger à retaper : c'est le même texte, posé ailleurs.
  const portee = document.getElementById('searchTousMois');
  ecouterUneFois(portee, 'change', () => {
    porteeHistorique = portee.checked === true;
    const saisi = (searchInput && searchInput.value.trim()) || '';
    if (saisi) performSearch(saisi);
    else clearSearch();
  });
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
  if (porteeHistorique) {
    chercherDansToutLHistorique(query);
    return;
  }

  masquerLHistorique();
  const results = searchInCharges(query);
  displaySearchResults(results, query);
}

/**
 * Cherche dans tous les mois, et rend les résultats dans leur propre panneau
 *
 * Le filtrage des listes ne peut pas servir ici : les autres mois ne sont pas
 * dans la page. Les listes du mois sont donc rendues intactes, et la réponse
 * s'affiche à part — groupée par mois, parce que la question posée est presque
 * toujours « c'était quand ? ».
 *
 * La lecture n'a lieu qu'à la frappe, une fois la portée cochée : c'est le même
 * coût que l'ouverture de la corbeille, et il ne pèse pas sur le chargement.
 *
 * @param {string} query
 * @returns {Promise<void>}
 */
async function chercherDansToutLHistorique(query) {
  const panneau = document.getElementById('searchHistorique');
  const info = document.getElementById('searchResultsInfo');
  if (!panneau) return;

  // Les listes du mois reprennent leur état normal : en portée historique,
  // elles ne sont plus le support de la réponse.
  showAllCharges();

  panneau.hidden = false;
  panneau.innerHTML = '<p class="search-historique-attente">Recherche dans tous les mois…</p>';

  let tout;
  try {
    const { dbGet } = await import('../db.js');
    tout = chargesDeTousLesMois(await dbGet('periods'));
  } catch (erreur) {
    logError('❌ Lecture de l\'historique impossible :', erreur);
    panneau.innerHTML = '<p class="search-historique-attente">Historique illisible — réessayez.</p>';
    return;
  }

  // La saisie a pu changer pendant la lecture : ne rendre que si la requête
  // affichée est encore celle qu'on vient de traiter.
  const champ = document.getElementById('searchInput');
  if (champ && champ.value.trim() !== query) return;

  const resultats = tout.filter(entree => matchesQuery(entree, query));

  if (info) {
    const mois = moisRepresentes(resultats);
    info.textContent = resultats.length === 0
      ? `Aucun résultat pour « ${query} » dans l'historique`
      : `${resultats.length} résultat${resultats.length > 1 ? 's' : ''} dans ${mois} mois`;
    info.classList.add('visible');
  }

  const bouton = document.getElementById('searchClearBtn');
  if (bouton) bouton.classList.add('visible');

  panneau.innerHTML = resultats.length === 0
    ? '<p class="search-historique-attente">Rien trouvé, tous mois confondus.</p>'
    : grouperParMois(resultats).map(rendreUnMois).join('');

  brancherLesMois(panneau);
}

/**
 * Un mois de résultats, avec son en-tête et ses lignes
 *
 * @param {{periode: string, lignes: Array<Object>}} groupe
 * @returns {string} Fragment échappé
 */
function rendreUnMois(groupe) {
  const total = groupe.lignes.reduce((somme, ligne) => {
    const montant = Number(ligne.amount);
    return somme + (Number.isFinite(montant) ? montant : 0);
  }, 0);

  return `
    <div class="search-mois">
      <button type="button" class="search-mois-entete" data-periode="${escapeHtml(groupe.periode)}">
        <span class="search-mois-nom">${escapeHtml(moisLisible(groupe.periode))}</span>
        <span class="search-mois-compte">${groupe.lignes.length} · ${formatCurrency(total)}</span>
      </button>
      ${groupe.lignes.map(rendreUneLigne).join('')}
    </div>
  `;
}

/**
 * Une ligne de résultat
 *
 * @param {Object} ligne
 * @returns {string} Fragment échappé
 */
function rendreUneLigne(ligne) {
  const quand = jourDeTri(ligne);
  const montant = Number(ligne.amount);

  return `
    <div class="search-ligne">
      <div class="search-ligne-info">
        <span class="search-ligne-titre">${escapeHtml(ligne.description || ligne.note || 'Sans libellé')}</span>
        <span class="search-ligne-detail">
          ${escapeHtml(ligne.typeLabel)}${quand ? ` · ${escapeHtml(formatDateEtHeure(ligne))}` : ''}
        </span>
      </div>
      <span class="search-ligne-montant">${Number.isFinite(montant) ? formatCurrency(montant) : '—'}</span>
    </div>
  `;
}

/**
 * Un en-tête de mois emmène au mois en question
 *
 * Trouver « Machine à laver, juin 2026 » sans pouvoir s'y rendre laisserait le
 * travail à moitié fait.
 *
 * @param {HTMLElement} panneau
 * @returns {void}
 */
function brancherLesMois(panneau) {
  panneau.querySelectorAll('.search-mois-entete').forEach(entete => {
    entete.addEventListener('click', () => allerAuMois(entete.dataset.periode));
  });
}

/**
 * Amène l'application sur un mois
 *
 * `changePeriod()` ne prend **aucun argument** : elle lit le sélecteur. Lui
 * passer une période ne faisait donc rien du tout — le clic restait sans effet,
 * et l'écran donnait raison au défaut. On pose la valeur là où elle se lit,
 * puis on emprunte le même chemin que le sélecteur lui-même.
 *
 * @param {string} periode - Clé AAAA-MM
 * @returns {void}
 */
function allerAuMois(periode) {
  const select = document.getElementById('periodSelect');
  if (!select || !periode) return;

  // L'option peut manquer : le sélecteur se remplit au chargement, et un mois
  // écrit depuis l'autre téléphone après coup n'y figure pas. La créer plutôt
  // que de laisser le clic sans effet — et la ranger à sa place, la liste étant
  // ordonnée du plus récent au plus ancien.
  if (![...select.options].some(option => option.value === periode)) {
    const option = document.createElement('option');
    option.value = periode;
    option.textContent = moisLisible(periode);
    const suivante = [...select.options].find(autre => autre.value < periode);
    select.insertBefore(option, suivante || null);
  }

  select.value = periode;
  if (typeof window.changePeriod === 'function') window.changePeriod();
}

/**
 * Referme le panneau d'historique
 * @returns {void}
 */
function masquerLHistorique() {
  const panneau = document.getElementById('searchHistorique');
  if (!panneau) return;
  panneau.hidden = true;
  panneau.innerHTML = '';
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
    formatDateEtHeure(charge),
    // L'heure seule aussi : « 08:30 » se cherche sans avoir à retrouver le jour
    // qui va avec.
    heureDeLaCharge(charge),
    // Les deux séparément, et non l'un ou l'autre : une charge nommée « Le
    // Bistrot » à Rennes doit se retrouver par l'enseigne comme par la ville.
    charge.location && charge.location.name,
    charge.location && charge.location.commune,
    charge.location && charge.location.codePostal
  ];

  // Une requête vide ne filtre rien : c'est l'état d'un champ effacé, et
  // masquer toutes les charges y ferait croire à une perte de données.
  // `contient` répond faux à une requête vide — sans quoi n'importe quel champ
  // « correspondrait » —, la question se tranche donc ici.
  if (!plier(query)) return true;

  // La comparaison ignore désormais les accents : sur un clavier de téléphone
  // ils demandent un appui long, que personne ne fait pour chercher. Sans cela,
  // « intermarche » ne trouvait pas « Intermarché » et l'application répondait
  // « 0 résultat » sur une charge bien présente.
  // Le montant se compare comme un NOMBRE, jamais comme une sous-chaîne. Versé
  // parmi les textes, « 12.5 » ne répondait ni à « 12,50 » ni à « 12.50 » — ce
  // que l'écran affiche et ce qu'on tape — pendant que « 17 » trouvait 1171,01,
  // parce que ces deux chiffres s'y suivent.
  if (montantCorrespond(charge.amount, query)) return true;

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
  //
  // `textContent` et non `innerHTML` : cette ligne est du texte, elle ne porte
  // aucun balisage. L'écrire en HTML obligeait à échapper la requête — un
  // échappement de plus à ne pas oublier, pour un gain nul — et ouvrait un site
  // d'injection que le plafond d'avertissements du dépôt compte à raison.
  if (results.length === 0) {
    searchResultsInfo.textContent = `Aucun résultat pour "${query}"`;
    searchResultsInfo.classList.add('visible');
  } else {
    searchResultsInfo.textContent = `${results.length} résultat${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''}`;
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
  masquerLHistorique();
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

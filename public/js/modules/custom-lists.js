// ===== MODULE : GESTION DES LISTES PERSONNALISABLES =====
// Catégories de dépenses et destinations de virement dynamiques
// Stockées dans Firebase par utilisateur, avec defaults depuis config.js

import { getState, setState } from '../state.js';
import { CATEGORIES, DESTINATIONS } from '../config.js';
import { toast } from '../components/toast.js';
import { escapeHtml } from '../utils/format.js';
import { log, error as logError } from '../utils/debug.js';

// Emojis curatés pour sélection rapide (budget/finance)
const EMOJI_PICKER = [
  '🛒', '🏠', '🚗', '💊', '🎮', '🍕', '⚡', '📱',
  '🏦', '🤝', '👤', '🗑️', '🏡', '📋', '💳', '🎓',
  '✈️', '🐾', '👶', '🎁', '🏋️', '🧹', '🔧', '📦'
];

/**
 * Initialise le module custom-lists
 */
export async function initCustomLists() {
  log('📦 Initialisation module listes personnalisables');
  await loadCustomLists();
  log('✅ Module listes personnalisables initialisé');
}

/**
 * Charge les listes personnalisées depuis Firebase
 * Fallback sur les defaults de config.js si aucune donnée
 */
async function loadCustomLists() {
  try {
    const { dbGet } = await import('../db.js');

    // Charger catégories custom
    const customCategories = await dbGet('customCategories');
    if (customCategories && Array.isArray(customCategories) && customCategories.length > 0) {
      setState('categories', customCategories);
    } else {
      // Premier usage : copier defaults
      setState('categories', [...CATEGORIES]);
    }

    // Charger destinations custom
    const customDestinations = await dbGet('customDestinations');
    if (customDestinations && Array.isArray(customDestinations) && customDestinations.length > 0) {
      setState('destinations', customDestinations);
    } else {
      setState('destinations', [...DESTINATIONS]);
    }

    log(`📊 ${getCategories().length} catégories, ${getDestinations().length} destinations chargées`);
  } catch (error) {
    logError('❌ Erreur chargement listes custom :', error);
    // Fallback sur defaults
    setState('categories', [...CATEGORIES]);
    setState('destinations', [...DESTINATIONS]);
  }
}

/**
 * Écrit une liste en préservant ce que l'autre personne a pu y ajouter
 *
 * Ces listes étaient réécrites en entier. Deux ajouts simultanés — chacun sur
 * son téléphone — et le second effaçait le premier, sans le moindre signe.
 *
 * La transaction lit la valeur au moment de l'écriture, côté serveur, et
 * fusionne : une entrée ajoutée entre-temps survit. Une suppression est en
 * revanche respectée, sans quoi rien ne pourrait jamais être retiré.
 *
 * La comparaison porte sur `id`, jamais sur l'objet : les entrées relues en
 * base sont des instances neuves, et `includes` les aurait toutes prises pour
 * des ajouts distants — recopiant la liste entière à chaque enregistrement.
 *
 * `base` est la liste que la session avait sous les yeux au moment de la
 * modification, pas une relecture. Relire juste avant d'écrire ne protégeait
 * rien : l'ajout de l'autre y figurait déjà et passait pour une entrée que
 * cette session venait de retirer volontairement.
 *
 * @param {string} chemin - Nœud à écrire
 * @param {Array<Object>} voulue - Liste telle que cette session la veut
 * @param {Array<Object>} base - Liste d'origine, avant la modification locale
 * @returns {Promise<Array<Object>>} La liste effectivement enregistrée
 */
async function fusionnerListe(chemin, voulue, base) {
  const { getFirebaseDatabase } = await import('../firebase-init.js');
  const { getDataPath } = await import('../db.js');

  const reference = getFirebaseDatabase().ref(getDataPath(chemin));
  const connus = new Set((Array.isArray(base) ? base : []).map(identite));
  const gardees = new Set(voulue.map(identite));

  const resultat = await reference.transaction(actuelle => {
    const distante = Array.isArray(actuelle) ? actuelle : [];
    // Ce que l'autre a ajouté depuis notre dernière lecture, et que nous
    // n'avons donc pas pu supprimer intentionnellement.
    const ajoutsDistants = distante.filter(
      entree => !connus.has(identite(entree)) && !gardees.has(identite(entree))
    );
    return [...voulue, ...ajoutsDistants];
  });

  return resultat.committed ? resultat.snapshot.val() : voulue;
}

/**
 * Identité stable d'une entrée de liste
 *
 * @param {Object|string} entree - Entrée de catégorie ou de destination
 * @returns {string} Clé de comparaison
 */
function identite(entree) {
  if (entree && typeof entree === 'object') return String(entree.id ?? entree.label ?? '');
  return String(entree ?? '');
}

/**
 * Sauvegarde les catégories dans Firebase
 */
async function saveCategories(categories, base) {
  try {
    const fusionnees = await fusionnerListe('customCategories', categories, base);
    setState('categories', fusionnees);
  } catch (error) {
    logError('❌ Erreur sauvegarde catégories :', error);
    toast.error('Erreur de sauvegarde');
  }
}

/**
 * Sauvegarde les destinations dans Firebase
 */
async function saveDestinations(destinations, base) {
  try {
    const fusionnees = await fusionnerListe('customDestinations', destinations, base);
    setState('destinations', fusionnees);
  } catch (error) {
    logError('❌ Erreur sauvegarde destinations :', error);
    toast.error('Erreur de sauvegarde');
  }
}

// ===== GETTERS =====

/**
 * Fabrique l'identifiant d'une entrée à partir de son libellé
 *
 * L'ancienne formule retirait tout ce qui n'était pas `[a-z0-9-]` après un
 * simple `toLowerCase()`. Les accents ne survivaient donc pas : « Café »
 * donnait `caf`, « Péage » donnait `page`, « Crèche » donnait `crche`. Ces
 * identifiants sont écrits sur chaque charge et servent à retrouver la
 * catégorie — et la détection par le lieu vise `cafe`, qui n'existait donc
 * jamais.
 *
 * Les accents sont désormais dépliés puis retirés : « Café » donne `cafe`.
 *
 * L'unicité est vérifiée ensuite. Deux libellés distincts pouvaient déjà
 * produire le même identifiant, et la recherche par identifiant renvoie la
 * première trouvée : la grille aurait sélectionné la mauvaise tuile, sans
 * qu'aucune erreur ne le dise.
 *
 * @param {string} libelle - Libellé saisi
 * @param {Array} existantes - Entrées déjà présentes
 * @returns {string} Identifiant unique dans cette liste
 */
export function identifiantDepuisLibelle(libelle, existantes = []) {
  const base = String(libelle || '')
    // NFD sépare la lettre de son accent, le second intervalle retire l'accent.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  // Un libellé entièrement composé de caractères écartés — « ??? », un emoji
  // seul — ne doit pas produire un identifiant vide, qu'aucune recherche ne
  // retrouverait.
  const racine = base || 'categorie';

  const pris = new Set((existantes || []).map(entree => entree && entree.id));
  if (!pris.has(racine)) return racine;

  let rang = 2;
  while (pris.has(`${racine}-${rang}`)) rang += 1;
  return `${racine}-${rang}`;
}

/**
 * @returns {Array} Liste des catégories actives
 */
export function getCategories() {
  return getState('categories') || CATEGORIES;
}

/**
 * @returns {Array} Liste des destinations actives
 */
function getDestinations() {
  return getState('destinations') || DESTINATIONS;
}

/**
 * Retourne l'icône d'une catégorie par son label
 * @param {string} label - Label de la catégorie
 * @returns {string} Emoji icône
 */
export function getCategoryIcon(label) {
  const categories = getCategories();
  const cat = categories.find(c => c.label === label || c.id === label);
  return cat ? cat.icon : '📦';
}

// ===== POPULATION DES SELECTS =====

/**
 * Peuple un <select> avec les catégories
 * @param {string} selectId - ID du select à peupler
 * @param {Object} options - { placeholder, addManageOption }
 */
export function populateCategorySelect(selectId, options = {}) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const { placeholder = '-- Sélectionner --', addManageOption = true } = options;
  const currentValue = select.value;
  const categories = getCategories();

  select.innerHTML = '';

  // Placeholder
  if (placeholder) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    select.appendChild(opt);
  }

  // Options catégories
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.label;
    opt.textContent = `${cat.icon} ${cat.label}`;
    select.appendChild(opt);
  });

  // Option "Gérer..."
  if (addManageOption) {
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.textContent = '───────────';
    select.appendChild(separator);

    const manageOpt = document.createElement('option');
    manageOpt.value = '__manage_categories__';
    manageOpt.textContent = '✏️ Gérer les catégories...';
    select.appendChild(manageOpt);
  }

  // Restaurer la valeur si elle existe toujours
  if (currentValue && categories.some(c => c.label === currentValue)) {
    select.value = currentValue;
  }

  // La valeur à rétablir est mémorisée sur l'élément, pas capturée par la
  // fermeture : l'écouteur n'étant posé qu'une fois, il gardait la valeur du
  // tout premier remplissage. Choisir une catégorie puis ouvrir « Gérer… »
  // ramenait le champ sur une sélection périmée.
  select.dataset.valeurPrecedente = currentValue || '';

  if (addManageOption && !select.dataset.manageListenerAdded) {
    select.addEventListener('change', (e) => {
      if (e.target.value === '__manage_categories__') {
        e.target.value = select.dataset.valeurPrecedente || '';
        showManageModal('categories');
        return;
      }
      select.dataset.valeurPrecedente = e.target.value;
    });
    select.dataset.manageListenerAdded = 'true';
  }
}

/**
 * Peuple un <select> avec les destinations
 * @param {string} selectId - ID du select à peupler
 * @param {Object} options - { placeholder, addManageOption }
 */
export function populateDestinationSelect(selectId, options = {}) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const { placeholder = '-- Aucune --', addManageOption = true } = options;
  const currentValue = select.value;
  const destinations = getDestinations();

  select.innerHTML = '';

  // Placeholder
  if (placeholder) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    select.appendChild(opt);
  }

  // Options destinations
  destinations.forEach(dest => {
    const opt = document.createElement('option');
    opt.value = dest.label;
    opt.textContent = `${dest.icon} ${dest.label}`;
    select.appendChild(opt);
  });

  // Option "Gérer..."
  if (addManageOption) {
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.textContent = '───────────';
    select.appendChild(separator);

    const manageOpt = document.createElement('option');
    manageOpt.value = '__manage_destinations__';
    manageOpt.textContent = '✏️ Gérer les destinations...';
    select.appendChild(manageOpt);
  }

  // Restaurer la valeur
  if (currentValue && destinations.some(d => d.label === currentValue)) {
    select.value = currentValue;
  }

  // Même raison que pour les catégories : la valeur vit sur l'élément.
  select.dataset.valeurPrecedente = currentValue || '';

  if (addManageOption && !select.dataset.manageListenerAdded) {
    select.addEventListener('change', (e) => {
      if (e.target.value === '__manage_destinations__') {
        e.target.value = select.dataset.valeurPrecedente || '';
        showManageModal('destinations');
        return;
      }
      select.dataset.valeurPrecedente = e.target.value;
    });
    select.dataset.manageListenerAdded = 'true';
  }
}

/**
 * Peuple tous les selects de catégories et destinations de l'app
 */
export function populateAllSelects() {
  // Catégories
  populateCategorySelect('variableChargeCategory');
  populateCategorySelect('fixedChargeCategory');

  // Destinations
  populateDestinationSelect('fixedChargeDestination');
}

// ===== MODAL DE GESTION =====

/**
 * Affiche le modal de gestion (catégories ou destinations)
 * @param {'categories'|'destinations'} listType
 */
function showManageModal(listType) {
  const isCategories = listType === 'categories';
  const title = isCategories ? 'Gérer les catégories' : 'Gérer les destinations';
  const items = isCategories ? getCategories() : getDestinations();

  // Créer ou récupérer le modal
  let modal = document.getElementById('modalManageLists');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalManageLists';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'manageListsTitle');
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal manage-lists-modal">
      <h2 class="modal-header" id="manageListsTitle">${title}</h2>
      <div class="manage-lists-content">
        <div id="manageListItems" class="manage-list-items">
          ${items.map((item, index) => `
            <div class="manage-list-item" data-index="${index}">
              <span class="manage-item-icon">${escapeHtml(item.icon)}</span>
              <span class="manage-item-label">${escapeHtml(item.label)}</span>
              <button type="button" class="btn-icon btn-delete manage-item-delete" data-index="${index}" aria-label="Supprimer ${escapeHtml(item.label || '')}">
                ✕
              </button>
            </div>
          `).join('')}
        </div>

        <div class="manage-list-add">
          <div class="manage-add-row">
            <button type="button" id="manageEmojiBtn" class="manage-emoji-btn" title="Choisir icône">📦</button>
            <input type="text" id="manageNewLabel" placeholder="${isCategories ? 'Nouvelle catégorie...' : 'Nouvelle destination...'}" maxlength="30" />
            <button type="button" id="manageAddBtn" class="btn btn-primary btn-sm">Ajouter</button>
          </div>
          <div id="manageEmojiPicker" class="manage-emoji-picker" style="display:none;">
            ${EMOJI_PICKER.map(emoji => `
              <button type="button" class="emoji-pick" data-emoji="${emoji}">${emoji}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="manageListClose">Fermer</button>
      </div>
    </div>
  `;

  // State local du modal
  let selectedEmoji = '📦';
  const emojiBtn = modal.querySelector('#manageEmojiBtn');
  const emojiPicker = modal.querySelector('#manageEmojiPicker');
  const newLabelInput = modal.querySelector('#manageNewLabel');
  const addBtn = modal.querySelector('#manageAddBtn');
  const closeBtn = modal.querySelector('#manageListClose');

  // Toggle emoji picker
  emojiBtn.addEventListener('click', () => {
    emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'flex' : 'none';
  });

  // Select emoji
  modal.querySelectorAll('.emoji-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedEmoji = btn.dataset.emoji;
      emojiBtn.textContent = selectedEmoji;
      emojiPicker.style.display = 'none';
    });
  });

  // Add item
  const addItem = async () => {
    const label = newLabelInput.value.trim();
    if (!label) {
      toast.error('Nom requis');
      return;
    }

    const currentItems = isCategories ? getCategories() : getDestinations();

    // Check doublon
    if (currentItems.some(item => item.label.toLowerCase() === label.toLowerCase())) {
      toast.error('Ce nom existe déjà');
      return;
    }

    const newItem = {
      id: identifiantDepuisLibelle(label, currentItems),
      icon: selectedEmoji,
      label: label
    };

    // Ajouter couleur pour catégories
    if (isCategories) {
      const colors = ['#4caf50', '#2196f3', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4', '#795548', '#607d8b'];
      newItem.color = colors[currentItems.length % colors.length];
    }

    const updatedItems = [...currentItems, newItem];

    // `currentItems` est la liste d'avant l'ajout : elle sert de référence
    // pour distinguer ce que l'autre personne a ajouté entre-temps.
    if (isCategories) {
      await saveCategories(updatedItems, currentItems);
    } else {
      await saveDestinations(updatedItems, currentItems);
    }

    toast.success(`"${label}" ajouté`);
    populateAllSelects();
    showManageModal(listType); // Re-render
  };

  addBtn.addEventListener('click', addItem);
  newLabelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem();
    }
  });

  // Delete items
  modal.querySelectorAll('.manage-item-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = parseInt(btn.dataset.index);
      const avant = isCategories ? [...getCategories()] : [...getDestinations()];
      const currentItems = [...avant];
      const removed = currentItems.splice(index, 1)[0];

      if (isCategories) {
        await saveCategories(currentItems, avant);
      } else {
        await saveDestinations(currentItems, avant);
      }

      toast.success(`"${removed.label}" supprimé`);
      populateAllSelects();
      showManageModal(listType); // Re-render
    });
  });

  // Close
  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  });

  // Show modal
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('active'));
}

// Expose globally for compatibility
window.showManageCategoriesModal = () => showManageModal('categories');

// ===== MODULE : AJOUT RAPIDE (SAISIE EXPRESS) =====
// Modale quick-add avec grille catégories, GPS, géocodage inversé
// Toute la logique est centralisée ici (plus de JS inline dans FairSplit.html)

import { getState, setState } from '../state.js';
import { validateChargeAmount } from '../utils/validation.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { loadVariableCharges } from './variable-charges.js';
import { calculateSummary } from './summary.js';
import { getCategories } from './custom-lists.js';
import { escapeHtml } from '../utils/format.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { parseMontant } from '../utils/montant.js';
import { dateDuJour } from '../utils/date.js';
import { segmentsDeLaPhrase } from '../utils/phrase-saisie.js';
import { decrireLieu } from '../utils/lieu.js';
import { normaliserEmplacement } from '../utils/members.js';
import { categoriePourLieu } from '../utils/categorie-lieu.js';
import {
  categoriesFrequentes,
  ligneFrequentesUtile,
  periodePrecedente
} from '../utils/categories-frequentes.js';

// ===== STATE INTERNE =====
let _keydownHandler = null;
let _gpsWatchId = null;       // watchPosition ID for background GPS
let _gpsPermissionGranted = false; // tracks if user already granted GPS permission

/**
 * Une soumission est-elle déjà partie ?
 *
 * Rien n'empêchait d'entrer deux fois dans l'écriture. Sur une connexion lente,
 * `dbPush` met le temps qu'il met : la modale reste ouverte, rien ne bouge, et
 * le second appui est le réflexe naturel. Deux charges identiques partaient
 * alors en base — et le bilan comptait la dépense deux fois.
 *
 * Mesuré plutôt que supposé : le second appel franchissait toute la validation
 * et atteignait l'écriture.
 *
 * `dbPush` passe par `borner()`, qui rejette au bout du délai : le verrou est
 * donc toujours relâché, et une écriture qui n'aboutit pas ne bloque pas les
 * suivantes.
 */
let _soumissionEnCours = false;

const quickAddState = {
  selectedCategory: null,  // { id, icon, label, color }
  splitMode: 'prorata',    // 'prorata' | '50-50'
  paidBy: 'vous',          // 'vous' | 'conjointe' | 'partage'
  envelope: '',            // identifiant d'enveloppe, ou '' pour aucune
  gpsLocation: null        // { lat, lng, accuracy, timestamp, name? }
};

// ===== INITIALISATION =====

/**
 * Initialise le module d'ajout rapide
 */
export function initQuickAdd() {
  log('📦 Initialisation module ajout rapide');
  setupEventListeners();
  initBackgroundGPS();
  log('✅ Module ajout rapide initialisé');
}

/**
 * Vérifie si la permission GPS est déjà accordée et lance le watch en arrière-plan.
 * Utilise l'API Permissions pour éviter de déclencher le prompt au chargement.
 */
async function initBackgroundGPS() {
  if (!navigator.geolocation || !navigator.permissions) return;

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status.state === 'granted') {
      _gpsPermissionGranted = true;
      startBackgroundGPS();
      log('📡 [GPS] Permission déjà accordée → watch démarré au chargement');
    }

    // Écouter les changements de permission (accordée/révoquée en cours de session)
    status.addEventListener('change', () => {
      if (status.state === 'granted' && !_gpsPermissionGranted) {
        _gpsPermissionGranted = true;
        startBackgroundGPS();
      } else if (status.state === 'denied') {
        _gpsPermissionGranted = false;
        stopBackgroundGPS();
      }
    });
  } catch {
    // API Permissions non supportée — fallback : le watch démarre au premier clic
    log('📡 [GPS] API Permissions non supportée, watch au premier usage');
  }
}

/**
 * Pose un écouteur en garantissant qu'il n'y en a qu'un seul
 *
 * `initQuickAdd` est rappelé à chaque connexion, tandis que les éléments de la
 * modale, eux, vivent aussi longtemps que la page. Les écouteurs s'empilaient
 * donc : après trois connexions successives, une pression sur Entrée entrait
 * trois fois dans la soumission. Mesuré, et non supposé.
 *
 * Retirer avant de poser suppose une référence stable : c'est pourquoi les
 * gestionnaires ci-dessous sont des fonctions de module et non des fermetures
 * créées à chaque appel. Sur un élément neuf, le retrait ne fait rien — le
 * procédé vaut donc dans les deux cas.
 *
 * @param {Element|null} cible
 * @param {string} type
 * @param {Function} gestionnaire
 * @returns {void}
 */
function poserUnique(cible, type, gestionnaire) {
  if (!cible) return;
  cible.removeEventListener(type, gestionnaire);
  cible.addEventListener(type, gestionnaire);
}

/** Entrée soumet, depuis le montant comme depuis la description */
function surEntree(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  handleQuickAddSubmit();
}

/** Bascule vers le prorata */
function surProrata() {
  updateSplitMode('prorata');
}

/** Bascule vers le 50-50 */
function surCinquanteCinquante() {
  updateSplitMode('50-50');
}

/** Délégation : les libellés des payeurs changent avec les prénoms du foyer */
function surPayeur(e) {
  const bouton = e.target.closest('button[data-payer]');
  if (bouton) updatePayer(bouton.dataset.payer);
}

/** Choix d'une enveloppe : referme le panneau et redessine la phrase */
function surEnveloppe(e) {
  quickAddState.envelope = e.target.value || '';
  ouvrirLePanneau(null);
  dessinerLaPhrase();
}

/** Clic hors de la carte : ferme et réinitialise */
function surFondDeModale(e) {
  const overlay = document.getElementById('modalQuickAdd');
  if (e.target !== overlay) return;
  e.stopImmediatePropagation(); // Empêcher le handler générique
  closeQuickAddModal();
}

/**
 * Configure les event listeners
 */
function setupEventListeners() {
  // Raccourci clavier Ctrl+Q — posé sur `document`, il survit au balisage et
  // doit donc être retiré explicitement à la déconnexion.
  if (_keydownHandler) {
    document.removeEventListener('keydown', _keydownHandler);
  }
  _keydownHandler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
      e.preventDefault();
      showQuickAddModal();
    }
  };
  document.addEventListener('keydown', _keydownHandler);

  poserUnique(document.getElementById('quickAddAmount'), 'keypress', surEntree);
  poserUnique(document.getElementById('quickAddDescription'), 'keypress', surEntree);
  poserUnique(document.getElementById('quickSplitProrata'), 'click', surProrata);
  poserUnique(document.getElementById('quickSplit5050'), 'click', surCinquanteCinquante);
  poserUnique(document.getElementById('quickAddPayer'), 'click', surPayeur);
  poserUnique(document.getElementById('quickAddLocationDetach'), 'click', detachLocation);
  poserUnique(document.getElementById('quickAddPhrase'), 'click', surSegment);
  poserUnique(document.getElementById('quickAddDate'), 'change', surDate);
  poserUnique(document.getElementById('quickAddEnvelope'), 'change', surEnveloppe);
  poserUnique(document.getElementById('modalQuickAdd'), 'click', surFondDeModale);
}

/**
 * Nettoie les listeners (appelé au logout)
 */
export function cleanupQuickAdd() {
  if (_keydownHandler) {
    document.removeEventListener('keydown', _keydownHandler);
    _keydownHandler = null;
  }
  stopBackgroundGPS();
  resetState();
  oublierHistoriqueFrequentes();
  // Une écriture interrompue par une déconnexion ne doit pas laisser le verrou
  // fermé pour la session suivante.
  _soumissionEnCours = false;
  log('🧹 Listeners quick-add nettoyés');
}

// ===== MODALE : OUVERTURE / FERMETURE =====

/**
 * Les enveloppes qu'on peut rattacher à une saisie
 *
 * Les closes sont écartées : elles restent consultables — les vacances de l'an
 * dernier ont eu lieu — mais n'ont plus à encombrer une saisie expresse.
 *
 * @returns {Array<Object>}
 */
function enveloppesProposables() {
  return (getState('envelopes') || []).filter(e => e && !e.cloturee);
}

/**
 * Remplit le sélecteur d'enveloppe de la saisie rapide
 * @returns {void}
 */
function remplirLesEnveloppes() {
  const select = document.getElementById('quickAddEnvelope');
  if (!select) return;

  select.textContent = '';

  const aucune = document.createElement('option');
  aucune.value = '';
  aucune.textContent = 'Sans enveloppe';
  select.appendChild(aucune);

  for (const enveloppe of enveloppesProposables()) {
    const option = document.createElement('option');
    option.value = enveloppe.id;
    option.textContent = `${enveloppe.icon} ${enveloppe.label}`;
    select.appendChild(option);
  }

  select.value = quickAddState.envelope || '';
}

/**
 * Ouvre la modale quick-add
 */
function showQuickAddModal() {
  // Reset state
  resetState();

  // Repeuplé à l'ouverture : une enveloppe créée depuis le début de la session
  // doit être proposée sans avoir à recharger l'application.
  remplirLesEnveloppes();

  // Reset UI
  const amountInput = document.getElementById('quickAddAmount');
  if (amountInput) amountInput.value = '';

  const descriptionInput = document.getElementById('quickAddDescription');
  if (descriptionInput) descriptionInput.value = '';

  // Le jour courant, corrigeable : une dépense d'hier régularisée le lendemain
  // ne doit plus obliger à rouvrir le formulaire complet.
  const dateInput = document.getElementById('quickAddDate');
  if (dateInput) dateInput.value = dateDuJour();

  updateSplitMode('prorata');
  updatePayer('vous');
  hideLocationDetach();

  // La phrase se dessine avant tout : elle est le seul repère de ce qui sera
  // enregistré, et une modale qui s'ouvre sur une ligne vide donnerait à croire
  // qu'aucun défaut n'est posé.
  dessinerLaPhrase();

  // Peupler la grille catégories avec les catégories dynamiques
  populateCategoryGrid();

  // Reset GPS display
  const locationEl = document.getElementById('quickAddLocation');
  if (locationEl) {
    locationEl.textContent = '';
    locationEl.className = 'quick-add-location';
  }

  // Ouvrir la modale
  showModal('modalQuickAdd');

  // Le montant reçoit le focus : c'est par lui qu'on commence.
  //
  // Un second minuteur, à 400 ms, rappelait ensuite la modale en tête de
  // fenêtre. Il datait de l'époque où le montant se trouvait sous huit tuiles
  // et où l'ouverture du clavier faisait glisser la vue. Les deux gestes se
  // contredisaient — l'un désigne un champ, l'autre remonte ailleurs — et le
  // second ne portait même pas sur le bon élément : `.modal` est son propre
  // conteneur défilant, `scrollIntoView` agit sur ses ancêtres, dont le seul
  // qui défile est la page derrière la modale.
  //
  // Le montant étant désormais le premier champ, il n'y a plus rien à
  // rattraper : le focus suffit.
  setTimeout(() => {
    if (amountInput) amountInput.focus();
  }, 100);

  // L'historique des catégories, une fois par session, sans bloquer
  // l'ouverture : la ligne apparaît quand il arrive.
  chargerHistoriqueFrequentes();

  // Lancer détection GPS en arrière-plan
  startGPSDetection();
}

/**
 * Ferme et reset la modale quick-add
 */
function closeQuickAddModal() {
  closeModal('modalQuickAdd');
  resetState();

  // Reset UI spécifique
  const locationEl = document.getElementById('quickAddLocation');
  if (locationEl) {
    locationEl.textContent = '';
    locationEl.className = 'quick-add-location';
  }
  const descriptionInput = document.getElementById('quickAddDescription');
  if (descriptionInput) descriptionInput.value = '';

  document.querySelectorAll('.category-btn, .category-frequente-btn')
    .forEach(btn => btn.classList.remove('selected'));
  updateSplitMode('prorata');
  updatePayer('vous');
  hideLocationDetach();
}

/**
 * Le payeur que propose la saisie rapide à l'ouverture
 *
 * Celui qui tient le téléphone, et non `vous` en dur. Sur le second appareil,
 * l'ancien défaut attribuait à l'autre chaque dépense expédiée sans y penser —
 * et le solde, la seule chose que cette application calcule, s'en trouvait
 * faussé sans aucun signal.
 *
 * @returns {string} 'vous' ou 'conjointe'
 */
function payeurParDefaut() {
  return normaliserEmplacement(getState('emplacementCourant'));
}

/**
 * Reset le state interne
 */
function resetState() {
  quickAddState.selectedCategory = null;
  quickAddState.splitMode = 'prorata';
  quickAddState.paidBy = payeurParDefaut();
  quickAddState.envelope = '';
  quickAddState.gpsLocation = null;

  // Les panneaux se referment avec l'état qu'ils servaient à choisir : rouvrir
  // la modale sur la grille de catégories dépliée annulerait tout le gain.
  ouvrirLePanneau(null);
}

// ===== GRILLE CATÉGORIES =====

/**
 * Peuple la grille de catégories depuis custom-lists (dynamique)
 */
function populateCategoryGrid() {
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;

  const categories = getCategories();

  grid.innerHTML = categories.map(cat => `
    <button type="button" class="category-btn" data-category-id="${escapeHtml(cat.id)}">
      <div class="category-icon">${escapeHtml(cat.icon)}</div>
      <div>${escapeHtml(cat.label)}</div>
    </button>
  `).join('');

  // Bind click events (pas de onclick inline)
  grid.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const catId = btn.dataset.categoryId;
      selectCategory(catId);
    });
  });

  peuplerFrequentes(categories);
}

/**
 * Charges du mois précédent, lues une fois par mois consulté
 *
 * Sans elles, la ligne des fréquentes resterait vide les premiers jours du
 * mois — précisément quand la grille est la plus longue à parcourir, puisque
 * rien n'a encore été saisi. Une lecture, mise de côté ensuite : la rouvrir à
 * chaque ouverture de la modale coûterait un aller-retour pour un confort.
 *
 * La période lue est retenue avec les charges. Un cache anonyme aurait servi
 * les charges de juin en naviguant vers septembre, et celles du foyer à un
 * compte du bac à sable — sans que rien ne le signale, puisque la ligne aurait
 * l'air aussi crédible dans un cas que dans l'autre.
 */
let _historiqueFrequentes = { periode: null, charges: null };

/**
 * Dépouille les charges connues et remplit la ligne des fréquentes
 *
 * @param {Array} categories - Catégories du foyer
 * @returns {void}
 */
function peuplerFrequentes(categories) {
  const ligne = document.getElementById('categoryFrequentes');
  const liste = document.getElementById('categoryFrequentesListe');
  if (!ligne || !liste) return;

  const frequentes = categoriesFrequentes(chargesConnues(), categories);

  if (!ligneFrequentesUtile(frequentes, categories)) {
    ligne.hidden = true;
    liste.innerHTML = '';
    return;
  }

  liste.innerHTML = frequentes.map(cat => `
    <button type="button" class="category-frequente-btn" data-category-id="${escapeHtml(cat.id)}">
      <span aria-hidden="true">${escapeHtml(cat.icon)}</span>
      <span>${escapeHtml(cat.label)}</span>
    </button>
  `).join('');

  liste.querySelectorAll('.category-frequente-btn').forEach(bouton => {
    bouton.addEventListener('click', () => selectCategory(bouton.dataset.categoryId));
  });

  ligne.hidden = false;
}

/**
 * Les catégories du foyer, de la plus employée à la moins
 *
 * La ligne des fréquentes n'en montre que les premières ; l'arbitrage du GPS a
 * besoin du classement entier, jusqu'aux catégories rarement employées — c'est
 * précisément entre celles-là qu'il faut trancher quand la catégorie exacte
 * n'existe pas.
 *
 * @returns {Array} Catégories ordonnées par usage décroissant
 */
function habitudesDuFoyer() {
  return categoriesFrequentes(chargesConnues(), getCategories(), {
    maximum: Number.MAX_SAFE_INTEGER
  });
}

/**
 * Charges sur lesquelles se fondent les habitudes
 *
 * Le mois en cours, et le précédent s'il a été lu pour cette période-là. La
 * vérification n'est pas une précaution de style : l'historique reste en
 * mémoire quand on change de mois, et le servir sans le vérifier reviendrait à
 * décrire les habitudes d'un mois par celles d'un autre.
 *
 * @returns {Array} Charges connues, tous mois confondus
 */
function chargesConnues() {
  const attendue = periodePrecedente(getState('currentPeriod'));
  const historique = _historiqueFrequentes.periode === attendue
    ? (_historiqueFrequentes.charges || [])
    : [];

  return [...(getState('variableCharges') || []), ...historique];
}

/**
 * Va chercher les charges du mois précédent, une seule fois
 *
 * Son échec est sans conséquence visible : la ligne se contentera du mois en
 * cours. C'est un confort, pas une donnée — un bandeau d'erreur pour cela
 * apprendrait à ignorer les bandeaux d'erreur.
 *
 * @returns {Promise<void>}
 */
async function chargerHistoriqueFrequentes() {
  const precedente = periodePrecedente(getState('currentPeriod'));
  if (!precedente) return;
  if (_historiqueFrequentes.periode === precedente) return;

  try {
    const { dbGet } = await import('../db.js');
    const noeud = await dbGet(`periods/${precedente}/variableCharges`);
    _historiqueFrequentes = {
      periode: precedente,
      charges: noeud && typeof noeud === 'object' ? Object.values(noeud) : []
    };
  } catch (error) {
    warn('[Fréquentes] Historique indisponible, mois en cours seul :', error?.message || error);
    _historiqueFrequentes = { periode: precedente, charges: [] };
  }

  peuplerFrequentes(getCategories());
}

/**
 * Oublie l'historique retenu
 *
 * Appelé à la déconnexion : le compte suivant n'a rien à voir avec le
 * précédent, et le compte de test vit dans un autre espace de données. Servir
 * l'un à l'autre ne produirait aucune erreur — juste une ligne parfaitement
 * crédible, et fausse.
 *
 * @returns {void}
 */
function oublierHistoriqueFrequentes() {
  _historiqueFrequentes = { periode: null, charges: null };
}

/**
 * Sélectionne une catégorie
 */
function selectCategory(categoryId) {
  const categories = getCategories();
  const category = categories.find(c => c.id === categoryId);
  if (!category) return;

  quickAddState.selectedCategory = category;

  // Les deux surfaces désignent les mêmes catégories : n'en marquer qu'une
  // laisserait croire à deux choix distincts, dont l'un serait resté vide.
  document.querySelectorAll('.category-btn, .category-frequente-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.categoryId === categoryId);
  });

  // Le choix fait, le panneau n'a plus rien à montrer : le refermer ramène le
  // bouton d'enregistrement sous le pouce, qui est là où va le geste suivant.
  if (panneauOuvert === 'quickAddPanneauCategorie') ouvrirLePanneau(null);
  else dessinerLaPhrase();
}

// ===== LA PHRASE =====

/**
 * Redessine la ligne qui dit ce qui sera enregistré
 *
 * Elle remplace quatre blocs empilés — catégories, payeur, répartition, date —
 * qui obligeaient à reconstituer de tête l'état de quatre contrôles, et
 * reléguaient le payeur sous neuf tuiles. C'est lui qui décide qui doit combien :
 * atteint par défilement, il n'était pas vérifié.
 *
 * `textContent`, jamais `innerHTML` : les prénoms du foyer sont saisis par les
 * personnes qui l'habitent, et ils passent par ici.
 *
 * @returns {void}
 */
function dessinerLaPhrase() {
  const zone = document.getElementById('quickAddPhrase');
  if (!zone) return;

  const champDate = document.getElementById('quickAddDate');
  const segments = segmentsDeLaPhrase(quickAddState, {
    members: getState('members'),
    date: champDate ? champDate.value : null,
    // Le segment ne paraît que si le foyer a des enveloppes ouvertes : un
    // cinquième bouton permanent encombrerait la phrase de tous ceux qui ne
    // s'en servent pas, et n'en avoir aucune est l'état de départ.
    enveloppes: enveloppesProposables()
  });

  zone.textContent = '';

  for (const segment of segments) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'quick-add-segment';
    bouton.dataset.panneau = segment.panneau;
    bouton.textContent = segment.texte;
    bouton.setAttribute('aria-controls', segment.panneau);
    bouton.setAttribute('aria-expanded', String(panneauOuvert === segment.panneau));

    // La catégorie manquante est le seul obstacle à l'enregistrement : le
    // segment le dit plutôt que de laisser chercher.
    if (segment.cle === 'categorie' && !quickAddState.selectedCategory) {
      bouton.classList.add('quick-add-segment--manquant');
    }

    zone.appendChild(bouton);
  }
}

/** Panneau actuellement déplié, ou null */
let panneauOuvert = null;

/**
 * Ouvre un panneau, referme les autres
 *
 * Un seul à la fois : deux dépliés reproduiraient l'empilement qu'on vient de
 * défaire, et repousseraient le bouton d'enregistrement hors de l'écran.
 *
 * @param {string|null} id - Identifiant du panneau, ou null pour tout refermer
 * @returns {void}
 */
function ouvrirLePanneau(id) {
  panneauOuvert = panneauOuvert === id ? null : id;

  for (const panneau of document.querySelectorAll('.quick-add-panneau')) {
    panneau.hidden = panneau.id !== panneauOuvert;
  }

  dessinerLaPhrase();

  // Le champ date s'ouvre pour être rempli : lui donner le focus évite un
  // second geste, et ne coûte rien quand on referme.
  if (panneauOuvert === 'quickAddPanneauDate') {
    const champ = document.getElementById('quickAddDate');
    if (champ) champ.focus();
  }
}

/** Délégation sur la phrase : chaque segment ouvre son panneau */
function surSegment(e) {
  const bouton = e.target.closest('button[data-panneau]');
  if (bouton) ouvrirLePanneau(bouton.dataset.panneau);
}

/** Une date changée se relit dans la phrase, sans refermer le panneau */
function surDate() {
  dessinerLaPhrase();
}

// ===== SPLIT MODE =====

/**
 * Met à jour le mode de répartition
 */
function updateSplitMode(mode) {
  quickAddState.splitMode = mode;

  const prorataBtn = document.getElementById('quickSplitProrata');
  const fiftyBtn = document.getElementById('quickSplit5050');
  if (prorataBtn) prorataBtn.classList.toggle('selected', mode === 'prorata');
  if (fiftyBtn) fiftyBtn.classList.toggle('selected', mode === '50-50');

  if (panneauOuvert === 'quickAddPanneauRepartition') ouvrirLePanneau(null);
  else dessinerLaPhrase();
}

// ===== PAYEUR =====

/**
 * Met à jour le payeur
 *
 * La saisie rapide écrivait « vous » en dur : toute dépense réglée par l'autre
 * personne était attribuée à la mauvaise, donc comptée à l'envers dans le
 * bilan. Il fallait rouvrir la charge dans le formulaire complet pour la
 * corriger — ce qui retire à la saisie rapide sa raison d'être.
 *
 * @param {string} payeur - 'vous' | 'conjointe' | 'partage'
 */
function updatePayer(payeur) {
  quickAddState.paidBy = payeur;

  document.querySelectorAll('#quickAddPayer button').forEach(bouton => {
    bouton.classList.toggle('selected', bouton.dataset.payer === payeur);
  });

  if (panneauOuvert === 'quickAddPanneauPayeur') ouvrirLePanneau(null);
  else dessinerLaPhrase();
}

// ===== LIEU =====

/**
 * Détache la position de la dépense en cours
 *
 * Le lieu détecté est celui du téléphone à l'instant de la saisie. Régulariser
 * une dépense d'hier depuis chez soi épinglait donc le domicile sur la carte,
 * et nommait la charge d'après lui — « Maison » pour un repas pris ailleurs.
 * Détacher vaut mieux que corriger : une charge sans lieu ne raconte rien de
 * faux.
 */
function detachLocation() {
  quickAddState.gpsLocation = null;

  const locationEl = document.getElementById('quickAddLocation');
  if (locationEl) {
    locationEl.textContent = 'Sans lieu';
    locationEl.className = 'quick-add-location';
  }

  hideLocationDetach();
}

/** Affiche le bouton de détachement — seulement s'il y a un lieu à détacher */
function showLocationDetach() {
  const bouton = document.getElementById('quickAddLocationDetach');
  if (bouton) bouton.hidden = false;
}

/** Masque le bouton de détachement */
function hideLocationDetach() {
  const bouton = document.getElementById('quickAddLocationDetach');
  if (bouton) bouton.hidden = true;
}

// ===== SOUMISSION =====

/**
 * Gère la soumission du formulaire quick-add
 */
async function handleQuickAddSubmit() {
  if (_soumissionEnCours) {
    log('[Saisie rapide] ⏳ Écriture déjà en cours, appui ignoré');
    return;
  }
  _soumissionEnCours = true;

  try {
    await soumettre();
  } finally {
    _soumissionEnCours = false;
  }
}

/**
 * Valide la saisie et écrit la charge
 *
 * Séparée de `handleQuickAddSubmit` pour que le verrou tienne sur tous les
 * chemins de sortie, y compris les refus de validation, sans avoir à le
 * relâcher à la main devant chaque `return`.
 *
 * @returns {Promise<void>}
 */
async function soumettre() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  // L'ordre des refus suit l'ordre de lecture du formulaire : le montant
  // d'abord, la catégorie ensuite. Se faire renvoyer vers le bas de l'écran
  // alors qu'un champ plus haut est vide fait chercher au mauvais endroit.
  const amountEl = document.getElementById('quickAddAmount');
  // La chaîne saisie, et non le nombre qu'on en tire : `validateChargeAmount`
  // distingue « vide » de « pas un nombre », et le NaN d'un champ vide effaçait
  // cette distinction — « Montant doit être un nombre » pour un champ auquel on
  // n'avait pas touché.
  const saisieMontant = amountEl ? amountEl.value : '';
  // Ce formulaire plafonnait à 50 000 € quand les trois autres acceptaient
  // 100 000 : la même charge passait ou non selon la porte empruntée.
  const montantValide = validateChargeAmount(saisieMontant);
  if (!montantValide.valid) {
    toast.error(montantValide.error);
    // Le message nomme le champ ; le focus y conduit.
    if (amountEl) amountEl.focus();
    return;
  }
  const amount = parseMontant(saisieMontant);

  const category = quickAddState.selectedCategory;
  if (!category) {
    toast.error('Choisissez une catégorie');
    // Le panneau s'ouvre avant le focus : la grille est repliée par défaut, et
    // le focus sur un élément masqué ne fait rien — on aurait nommé le champ
    // manquant tout en le laissant hors de vue, ce qui est pire que se taire.
    if (panneauOuvert !== 'quickAddPanneauCategorie') ouvrirLePanneau('quickAddPanneauCategorie');
    document.querySelector('.category-btn')?.focus();
    return;
  }

  const gps = quickAddState.gpsLocation;
  const splitMode = quickAddState.splitMode;

  // La saisie prime sur toute déduction : elle seule sait ce qui a été acheté.
  // À défaut, on retombe sur le nom du lieu puis sur la catégorie, comme avant.
  const saisie = document.getElementById('quickAddDescription')?.value.trim();
  const description = saisie || gps?.name || category.label;

  const chargeData = {
    description,
    amount,
    category: category.label,
    categoryId: category.id,
    categoryIcon: category.icon,
    paidBy: quickAddState.paidBy,
    // `splitOverride`, et non `splitMode` : c'est le champ que lit le calcul.
    //
    // La saisie rapide écrivait `splitMode: '50-50'`. Personne ne le lisait :
    // `calculateChargeShares` et `calculateJointPayment` n'interrogent que
    // `splitOverride`, que renseignent les deux formulaires complets. Choisir
    // « 50-50 » ici n'avait donc aucun effet sur le bilan — la charge était
    // répartie selon le mode du foyer — et le toast de confirmation affichait
    // pourtant « (50-50) ». L'application annonçait ce qu'elle n'avait pas fait.
    //
    // `null` pour le prorata : c'est l'absence de dérogation, donc le mode du
    // foyer, exactement comme dans `variable-charges.js`.
    splitOverride: splitMode === '50-50' ? { mode: '50-50' } : null,
    // `null` plutôt que la chaîne vide : Firebase refuse `undefined`, et une
    // chaîne vide se lirait comme un identifiant d'enveloppe introuvable.
    envelope: quickAddState.envelope || null,
    // La date saisie si elle a été corrigée, le jour courant sinon.
    //
    // `toISOString()` rendait le jour UTC : en hiver comme en été, les
    // premières heures de la nuit basculaient sur la veille. `dateDuJour` lit
    // le fuseau de l'appareil.
    date: document.getElementById('quickAddDate')?.value || dateDuJour(),
    timestamp: Date.now(),
    deleted: false
  };

  // Ajouter GPS si disponible
  if (gps) {
    chargeData.location = {
      lat: gps.lat,
      lng: gps.lng,
      name: gps.name || 'Position',
      timestamp: gps.timestamp
    };
    // Champs facultatifs : les règles les acceptent déjà sous `location`, et
    // les garder séparés permet de regrouper par ville sans redécouper une
    // étiquette. Absents quand le géocodage n'a rien rendu.
    if (gps.commune) chargeData.location.commune = gps.commune;
    if (gps.codePostal) chargeData.location.codePostal = gps.codePostal;
  }

  try {
    const { dbPush } = await import('../db.js');
    await dbPush(`periods/${currentPeriod}/variableCharges`, chargeData);

    const modeLabel = splitMode === 'prorata' ? 'Prorata' : '50-50';
    toast.success(`${category.icon} ${description} — ${amount.toFixed(2)} € (${modeLabel})`);

    // Refresh données
    await loadVariableCharges();
    calculateSummary();

    // Fermer la modale
    closeQuickAddModal();
  } catch (error) {
    logError('❌ Erreur ajout rapide :', error);
    toast.error('Erreur lors de l\'ajout');
  }
}

// ===== GPS & GÉOCODAGE =====

const GPS_CACHE_MAX_AGE = 60000; // 60s — position considérée fraîche

/**
 * Démarre le suivi GPS en arrière-plan (watchPosition).
 * Appelé après la première autorisation GPS réussie.
 * Met à jour state.cachedGpsPosition en continu.
 */
function startBackgroundGPS() {
  if (_gpsWatchId !== null) return; // déjà actif
  if (!navigator.geolocation) return;

  _gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const cached = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now()
      };
      setState('cachedGpsPosition', cached);
      log('📡 [GPS] Position mise en cache:', cached.lat.toFixed(5), cached.lng.toFixed(5));
    },
    (error) => {
      if (error.code === 1) {
        // Permission révoquée — arrêter le watch
        stopBackgroundGPS();
        _gpsPermissionGranted = false;
        warn('⚠️ [GPS] Permission révoquée, watch arrêté');
      }
    },
    {
      enableHighAccuracy: false,
      maximumAge: GPS_CACHE_MAX_AGE,
      timeout: 15000
    }
  );
  log('📡 [GPS] Watch en arrière-plan démarré');
}

/**
 * Arrête le suivi GPS en arrière-plan
 */
function stopBackgroundGPS() {
  if (_gpsWatchId !== null) {
    navigator.geolocation.clearWatch(_gpsWatchId);
    _gpsWatchId = null;
    log('📡 [GPS] Watch en arrière-plan arrêté');
  }
}

/**
 * Vérifie si une position en cache est disponible et fraîche (< 60s)
 * @returns {Object|null} Position en cache ou null
 */
function getCachedPosition() {
  const cached = getState('cachedGpsPosition');
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > GPS_CACHE_MAX_AGE) return null;

  return cached;
}

/**
 * Lance la détection GPS (non bloquante).
 * Utilise la position en cache si disponible, sinon getCurrentPosition.
 */
function startGPSDetection() {
  const locationEl = document.getElementById('quickAddLocation');
  if (!locationEl) return;

  if (!navigator.geolocation) {
    warn('⚠️ [GPS] Géolocalisation non disponible');
    locationEl.textContent = '';
    locationEl.className = 'quick-add-location';
    return;
  }

  // Tenter d'utiliser la position en cache
  const cached = getCachedPosition();
  if (cached) {
    log('⚡ [GPS] Position en cache utilisée (âge:', Date.now() - cached.timestamp, 'ms)');
    locationEl.textContent = '📍 Géocodage...';
    locationEl.className = 'quick-add-location loading';
    processGPSPosition(cached, locationEl);
    return;
  }

  // Pas de cache — lancer getCurrentPosition classique
  try {
    locationEl.textContent = '📍 Détection position...';
    locationEl.className = 'quick-add-location loading';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const gpsData = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        };

        // Première autorisation réussie → démarrer le watch en arrière-plan
        if (!_gpsPermissionGranted) {
          _gpsPermissionGranted = true;
          startBackgroundGPS();
        }

        processGPSPosition(gpsData, locationEl);
      },
      (error) => {
        locationEl.textContent = '';
        locationEl.className = 'quick-add-location';

        if (error.code === 1) {
          warn('⚠️ [GPS] Permission refusée');
        } else if (error.code === 2) {
          warn('⚠️ [GPS] Position indisponible');
        } else if (error.code === 3) {
          warn('⚠️ [GPS] Timeout');
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: GPS_CACHE_MAX_AGE
      }
    );
  } catch (globalError) {
    logError('❌ [GPS] Erreur critique:', globalError);
    locationEl.textContent = '';
    locationEl.className = 'quick-add-location';
  }
}

/**
 * Traite une position GPS (cache ou fraîche) : reverse geocoding + auto-catégorie
 */
async function processGPSPosition(gpsData, locationEl) {
  try {
    quickAddState.gpsLocation = gpsData;

    // Il y a désormais quelque chose à détacher.
    showLocationDetach();

    // Géocodage inversé pour obtenir le nom du lieu
    try {
      const place = await reverseGeocode(gpsData.lat, gpsData.lng);
      if (place?.etiquette) {
        // « Brioche Dorée » seul ne disait pas laquelle ; « Brioche Dorée,
        // 35000 Rennes » le dit, et reste lisible dans une liste de charges.
        gpsData.name = place.etiquette;
        gpsData.commune = place.commune;
        gpsData.codePostal = place.codePostal;
        quickAddState.gpsLocation = gpsData;

        locationEl.textContent = `✓ ${place.etiquette}`;
        locationEl.className = 'quick-add-location success';

        // Auto-détection catégorie
        const detected = categoriePourLieu(place, getCategories(), habitudesDuFoyer());
        if (detected && !quickAddState.selectedCategory) {
          selectCategory(detected.id);
          toast.info(`📍 ${detected.label} détecté`);
        }
      } else {
        locationEl.textContent = '✓ Position enregistrée';
        locationEl.className = 'quick-add-location success';
      }
    } catch {
      locationEl.textContent = '✓ Position enregistrée';
      locationEl.className = 'quick-add-location success';
    }
  } catch (err) {
    logError('❌ [GPS] Erreur traitement position:', err);
    locationEl.textContent = '✗ Erreur GPS';
    locationEl.className = 'quick-add-location error';
    hideLocationDetach();
  }
}

/**
 * Géocodage inversé via Nominatim (OpenStreetMap, gratuit)
 *
 * `addressdetails=1` réclame l'adresse décomposée — rue, code postal, commune.
 * Sans ce paramètre, la réponse ne portait que le nom de l'enseigne et
 * `display_name`, une seule chaîne allant du bâtiment jusqu'au pays.
 * `zoom=18` vise le bâtiment plutôt que le quartier, et `accept-language=fr`
 * évite qu'une commune revienne dans une autre langue que celle de l'écran.
 */
async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
      '&format=json&addressdetails=1&zoom=18&accept-language=fr',
      { headers: { 'User-Agent': 'FairSplit/1.0' } }
    );
    if (!response.ok) return null;

    return decrireLieu(await response.json());
  } catch (error) {
    logError('Reverse geocoding failed:', error);
    return null;
  }
}

// ===== API PROGRAMMATIQUE =====

/**
 * Ajoute une charge rapide par programmation
 * @param {Object} chargeData - { description, amount, category?, paidBy?, date? }
 * @returns {Promise<Object>} Charge créée
 */
export async function addQuickCharge(chargeData) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    throw new Error('Aucune période sélectionnée');
  }

  const charge = {
    description: chargeData.description,
    amount: parseMontant(chargeData.amount),
    category: chargeData.category || 'Autre',
    paidBy: chargeData.paidBy || 'vous',
    date: chargeData.date || dateDuJour(),
    timestamp: Date.now(),
    deleted: false
  };

  if (!charge.description || !charge.amount || charge.amount <= 0) {
    throw new Error('Données invalides');
  }

  try {
    const { dbPush } = await import('../db.js');
    await dbPush(`periods/${currentPeriod}/variableCharges`, charge);

    await loadVariableCharges();
    calculateSummary();

    toast.success('Charge ajoutée');
    return charge;
  } catch (error) {
    logError('❌ Erreur addQuickCharge :', error);
    toast.error('Erreur lors de l\'ajout de la charge');
    throw error;
  }
}

// ===== EXPORTS GLOBAUX (compatibilité HTML) =====
window.showQuickAddModal = showQuickAddModal;
window.closeQuickAddModal = closeQuickAddModal;
window.handleQuickAddSubmit = handleQuickAddSubmit;

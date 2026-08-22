// ===== JOURNAL DE DIAGNOSTIC =====
//
// Deux pannes signalées sur téléphone — les salaires ne s'enregistraient pas,
// et le bouton « + Ajouter » ne réagissait pas — n'ont jamais pu être
// reproduites : ni en navigateur de bureau, ni sur appareil émulé, ni contre
// le bac à sable. Ce qui manquait n'était pas une hypothèse de plus, c'était
// ce que l'appareil avait réellement vécu.
//
// Le journal enregistre ce que la console aurait montré si on avait pu
// l'ouvrir. Il est muet pour qui utilise l'application : rien ne s'affiche,
// rien ne ralentit. Il se consulte à la demande, par `?diag=1`.
//
// AUCUNE DONNÉE PERSONNELLE. Le journal note des identifiants de champs, des
// noms d'étapes et des messages d'erreur — jamais un montant, une description,
// un prénom ni une adresse. Cette règle prime sur l'utilité : un journal qu'on
// ne peut pas partager sans y réfléchir ne sert à rien.

/** Nombre d'entrées conservées — au-delà, les plus anciennes sont oubliées */
const CAPACITE = 300;

/** Clé de persistance : le journal doit survivre au rechargement qui suit une panne */
const STOCKAGE = 'fairsplit.diagnostic';

/** Journal en mémoire, source de vérité de la session courante */
let entrees = [];

/** Instant de départ, pour horodater en millisecondes écoulées */
const depart = Date.now();

/**
 * Enregistre un événement
 *
 * @param {string} categorie - Famille d'événement ('init', 'clic', 'erreur'…)
 * @param {string} message - Description courte, sans donnée personnelle
 * @param {Object} [details] - Champs supplémentaires, sans donnée personnelle
 * @returns {void}
 */
export function noter(categorie, message, details = undefined) {
  entrees.push({
    ms: Date.now() - depart,
    categorie,
    message,
    ...(details ? { details } : {})
  });

  if (entrees.length > CAPACITE) entrees = entrees.slice(-CAPACITE);
  persister();
}

/**
 * Écrit le journal en stockage local
 *
 * Le stockage peut être indisponible — navigation privée, quota atteint,
 * réglage bloquant. L'échec n'a aucune conséquence : le journal reste en
 * mémoire pour la session courante.
 */
function persister() {
  try {
    localStorage.setItem(STOCKAGE, JSON.stringify(entrees));
  } catch {
    // Le journal ne survivra pas au rechargement. Ce n'est pas une raison
    // d'interrompre quoi que ce soit.
  }
}

/**
 * Relit le journal de la session précédente
 *
 * Une panne suivie d'un rechargement effacerait sinon la seule trace de ce
 * qui s'est passé.
 *
 * @returns {Array<Object>} Entrées de la session précédente, vide si aucune
 */
function relirePrecedent() {
  try {
    const brut = localStorage.getItem(STOCKAGE);
    return brut ? JSON.parse(brut) : [];
  } catch {
    return [];
  }
}

/**
 * Décrit l'appareil et le contexte d'exécution
 *
 * Ce sont les différences entre un vrai téléphone et un navigateur de bureau
 * qui expliquent les pannes qu'on ne reproduit pas.
 *
 * @returns {Object} Contexte technique, sans identifiant personnel
 */
function contexte() {
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  return {
    agent: nav.userAgent || 'inconnu',
    tactile: typeof window !== 'undefined' && 'ontouchstart' in window,
    pointeurGrossier: typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : null,
    ecran: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'inconnu',
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : null,
    enLigne: nav.onLine ?? null,
    // Une application installée depuis l'écran d'accueil ne s'exécute pas dans
    // le même contexte qu'un onglet : c'est une piste à part entière.
    autonome: typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : null,
    serviceWorker: typeof nav.serviceWorker !== 'undefined'
      ? Boolean(nav.serviceWorker.controller)
      : null,
    langue: nav.language || 'inconnu'
  };
}

/**
 * Rassemble le journal sous une forme lisible et collable
 *
 * @returns {string} Rapport en texte brut
 */
export function rapport() {
  const precedent = relirePrecedent();
  const lignes = [];

  lignes.push('=== DIAGNOSTIC FAIRSPLIT ===');
  for (const [cle, valeur] of Object.entries(contexte())) {
    lignes.push(`${cle} : ${valeur}`);
  }

  lignes.push('', `--- session courante (${entrees.length} entrées) ---`);
  for (const e of entrees) lignes.push(formater(e));

  // Le journal persisté contient la session courante dès la première écriture ;
  // ne le répéter que s'il porte réellement autre chose.
  if (precedent.length && precedent.length !== entrees.length) {
    lignes.push('', `--- session précédente (${precedent.length} entrées) ---`);
    for (const e of precedent) lignes.push(formater(e));
  }

  return lignes.join('\n');
}

/**
 * Met une entrée en forme sur une ligne
 * @param {Object} e - Entrée du journal
 * @returns {string} Ligne de rapport
 */
function formater(e) {
  const base = `+${String(e.ms).padStart(6)} ms [${e.categorie}] ${e.message}`;
  return e.details ? `${base} ${JSON.stringify(e.details)}` : base;
}

/**
 * Vérifie la présence d'un élément et note son absence
 *
 * Les modules attachaient leurs écouteurs derrière un `if (element)` : quand
 * l'élément manquait, il ne se passait rien — pas d'écouteur, pas d'erreur,
 * pas la moindre trace. C'est exactement le silence qu'on cherche à percer.
 *
 * @param {string} id - Identifiant de l'élément attendu
 * @param {string} usage - Ce à quoi il sert, pour la lecture du journal
 * @returns {HTMLElement|null} L'élément, ou null s'il est absent
 */
export function exigerElement(id, usage) {
  const element = document.getElementById(id);
  if (!element) noter('dom', `élément absent : #${id}`, { usage });
  return element;
}

/**
 * Installe la capture des erreurs non rattrapées
 *
 * Une exception dans un écouteur d'événement ne remonte à aucun try/catch :
 * elle finit dans la console, hors de portée sur un téléphone.
 *
 * @returns {void}
 */
export function initDiagnostics() {
  noter('demarrage', 'journal ouvert', contexte());

  window.addEventListener('error', (evenement) => {
    noter('erreur', evenement.message || 'erreur sans message', {
      source: `${evenement.filename || '?'}:${evenement.lineno || 0}`
    });
  });

  window.addEventListener('unhandledrejection', (evenement) => {
    const raison = evenement.reason;
    noter('rejet', raison?.message || String(raison || 'rejet sans motif'), {
      code: raison?.code || undefined
    });
  });

  // Tout clic est noté par sa cible, jamais par son contenu : c'est ce qui
  // permet de distinguer « le clic n'arrive pas au bouton » de « le bouton
  // n'a pas d'écouteur ».
  document.addEventListener('click', (evenement) => {
    const cible = evenement.target instanceof Element ? evenement.target : null;
    if (!cible) return;
    const bouton = cible.closest('button, .fab, [data-action]');
    if (!bouton) return;
    noter('clic', decrireCible(bouton), {
      atteint: bouton === cible ? 'direct' : 'par-ascendant'
    });
  }, true);

  exposerPanneau();
}

/**
 * Décrit un élément cliqué sans révéler son contenu
 * @param {Element} element - Élément visé
 * @returns {string} Description technique
 */
function decrireCible(element) {
  const id = element.id ? `#${element.id}` : '';
  const action = element.dataset?.action ? `[${element.dataset.action}]` : '';
  return `${element.tagName.toLowerCase()}${id}${action}` || element.tagName.toLowerCase();
}

/**
 * Rend le journal consultable, sans jamais s'imposer
 *
 * `window.__diag()` en console, et `?diag=1` pour un panneau affiché — la
 * seule voie praticable sur un téléphone, où la console est hors d'atteinte.
 */
function exposerPanneau() {
  window.__diag = rapport;

  const params = new URLSearchParams(window.location.search);
  if (params.get('diag') !== '1') return;

  // Le panneau se peint après le reste : ce qui l'intéresse s'est produit
  // pendant l'initialisation.
  window.setTimeout(peindrePanneau, 4000);
}

/**
 * Affiche le journal à l'écran, avec de quoi le copier
 * @returns {void}
 */
function peindrePanneau() {
  const panneau = document.createElement('div');
  panneau.id = 'diagPanel';
  panneau.setAttribute('role', 'dialog');
  panneau.setAttribute('aria-label', 'Journal de diagnostic');

  const titre = document.createElement('div');
  titre.className = 'diag-titre';
  titre.textContent = 'Journal de diagnostic';

  const zone = document.createElement('textarea');
  zone.id = 'diagText';
  zone.readOnly = true;
  zone.value = rapport();

  const copier = document.createElement('button');
  copier.type = 'button';
  copier.className = 'btn btn-primary';
  copier.textContent = 'Copier';
  copier.addEventListener('click', async () => {
    // `select()` couvre le cas où l'API presse-papiers est refusée : sur
    // iOS elle exige un contexte sécurisé et un geste direct.
    zone.select();
    try {
      await navigator.clipboard.writeText(zone.value);
      copier.textContent = 'Copié';
    } catch {
      copier.textContent = 'Sélectionné — copier à la main';
    }
  });

  const fermer = document.createElement('button');
  fermer.type = 'button';
  fermer.className = 'btn btn-secondary';
  fermer.textContent = 'Fermer';
  fermer.addEventListener('click', () => panneau.remove());

  const actions = document.createElement('div');
  actions.className = 'diag-actions';
  actions.append(copier, fermer);

  panneau.append(titre, zone, actions);
  document.body.appendChild(panneau);
}

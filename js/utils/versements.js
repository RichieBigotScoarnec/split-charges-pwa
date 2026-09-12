/**
 * Alimenter une cagnotte : l'argent qu'on y met, et non celui qu'on en sort
 *
 * Une enveloppe savait dire ce qu'elle avait coûté, puis ce qu'il lui restait
 * de son allocation. Elle ne savait pas dire ce qu'il y avait **dedans** —
 * distinction sans objet pour un budget mensuel, mais qui est tout le sujet
 * d'une cagnotte : « Travaux : 28,63 € » n'est pas un reliquat de budget, c'est
 * de l'argent qui existe.
 *
 * ## Le versement ne touche jamais le solde
 *
 * C'est la règle fondatrice de l'enveloppe, et elle ne bouge pas ici. Mettre
 * 400 € dans « Travaux » n'est pas une dépense partagée : c'est déplacer son
 * propre argent dans une poche étiquetée. Si l'un alimente plus que l'autre,
 * l'écart se règle par un virement ou un remboursement — deux mécanismes qui
 * existent déjà et que le bilan sait lire.
 *
 * Étendre le solde au versement paraîtrait généreux et serait un piège : le
 * même argent serait compté une fois en entrant dans le pot et une seconde en
 * sortant sous forme de charge. `tests/utils/versements-transversal.test.js`
 * verrouille la propriété.
 *
 * ## Les deux lectures d'une cagnotte, et pourquoi elles coexistent
 *
 * Une cagnotte **sans aucun versement** est celle d'avant : un objectif auquel
 * on compare des dépenses, et la jauge descend. Toutes celles déjà en base sont
 * dans ce cas, et doivent le rester au centime près.
 *
 * Dès qu'un versement existe, le pot a un contenu réel — `versé − dépensé` — et
 * c'est lui la vérité. La jauge **monte** alors vers l'objectif : un budget se
 * vide, une cagnotte se remplit. Même widget, sens opposé, et c'est correct.
 *
 * Le basculement n'est pas un caprice : il est forcé par la rétrocompatibilité.
 * Appliquer `versé − dépensé` à une enveloppe sans versement donnerait
 * `0 − dépensé`, c'est-à-dire un pot négatif là où l'écran affichait un budget
 * tenu.
 */

import { parseMontant } from './montant.js';

/** Plafond d'un versement, aligné sur celui d'un budget d'enveloppe */
const VERSEMENT_MAX = 10000000;

/** Format d'une date de versement : AAAA-MM-JJ */
const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Les personnes qui peuvent alimenter une cagnotte */
const PERSONNES = Object.freeze(['vous', 'conjointe']);

/**
 * Remet un versement lu en base dans une forme exploitable
 *
 * Un versement sans montant exploitable ne désigne rien : il est écarté plutôt
 * que rendu à zéro, car un zéro se compte dans le nombre de versements et
 * ferait basculer une cagnotte vers la lecture « contenu réel » alors qu'elle
 * n'a rien reçu.
 *
 * @param {*} brut - Entrée telle que lue en base
 * @param {string} [id] - Clé Firebase, reportée sur l'entrée
 * @returns {{id: string, montant: number, date: string|null, auteur: string|null, deleted: boolean}|null}
 */
export function normaliserVersement(brut, id = '') {
  if (!brut || typeof brut !== 'object') return null;

  const montant = parseMontant(brut.montant);
  if (!Number.isFinite(montant) || montant <= 0 || montant > VERSEMENT_MAX) return null;

  const date = typeof brut.date === 'string' && FORMAT_DATE.test(brut.date.trim())
    ? brut.date.trim()
    : null;

  return {
    id: typeof brut.id === 'string' && brut.id ? brut.id : String(id || ''),
    montant,
    date,
    // Un auteur illisible n'en désigne aucun plutôt que d'en désigner un au
    // hasard — la même règle que pour le propriétaire d'une dépense solo.
    auteur: PERSONNES.includes(brut.auteur) ? brut.auteur : null,
    deleted: brut.deleted === true
  };
}

/**
 * Normalise un nœud de versements, tel que Firebase le rend
 *
 * Realtime Database stocke une collection comme un objet indexé par clé
 * poussée, jamais comme un tableau : la clé est reportée en `id` pour que
 * l'écran puisse désigner l'entrée à retirer.
 *
 * @param {*} noeud - Nœud `versements/{enveloppeId}` lu en base
 * @returns {Array<Object>} Versements exploitables, les plus récents d'abord
 */
export function normaliserVersements(noeud) {
  if (!noeud || typeof noeud !== 'object') return [];

  return Object.entries(noeud)
    .map(([cle, valeur]) => normaliserVersement(valeur, cle))
    .filter(Boolean)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/**
 * Les versements qui comptent — ceux qui ne sont pas à la corbeille
 *
 * @param {Array<Object>} versements
 * @returns {Array<Object>}
 */
export function versementsActifs(versements) {
  return (Array.isArray(versements) ? versements : []).filter(v => v && !v.deleted);
}

/**
 * Ce qui a été mis dans le pot
 *
 * @param {Array<Object>} versements
 * @param {'vous'|'conjointe'} [auteur] - Restreint à ce qu'une personne a versé
 * @returns {number} En euros, jamais NaN
 */
export function totalVerse(versements, auteur) {
  return versementsActifs(versements)
    .filter(v => auteur === undefined || auteur === null || v.auteur === auteur)
    .reduce((somme, v) => somme + (Number.isFinite(v.montant) ? v.montant : 0), 0);
}

/**
 * Le pot a-t-il été alimenté ?
 *
 * La question qui décide du sens de la jauge, et la seule. Sans versement, la
 * cagnotte garde la lecture d'avant — un objectif dont on retranche les
 * dépenses ; avec, c'est son contenu réel qui fait foi.
 *
 * @param {Array<Object>} versements
 * @returns {boolean}
 */
export function estAlimentee(versements) {
  return versementsActifs(versements).length > 0;
}

/**
 * Ce qui est déjà acquis sur l'objectif — les deux lectures, une seule fabrique
 *
 * `provisions.js` demande « combien manque-t-il encore ? », c'est-à-dire
 * `objectif − acquis`. Ce qu'« acquis » veut dire dépend de la lecture, et les
 * deux réponses sont justes chacune dans son monde :
 *
 *   **cagnotte alimentée** → `versé − dépensé`. L'argent est dans le pot ; ce
 *   qui en est sorti n'y est plus. C'est du contenu réel.
 *
 *   **budget** (aucun versement) → `dépensé`. Rien n'a été mis de côté, mais
 *   l'argent dépensé a bien été fourni : il a servi à ce que l'enveloppe vise.
 *   Un budget de 800 € dont 300 € sont dépensés a 500 € encore à couvrir.
 *
 * Appliquer la première formule à un pot vide donnait un contenu **négatif**, et
 * la provision réclamait alors l'objectif **plus** tout le déjà-dépensé. Mesuré
 * sur l'enveloppe « Vacances » du foyer : objectif 800 €, 1 009,81 € dépensés,
 * aucun versement — l'écran annonçait « il manque 1 809,81 € », soit très
 * exactement 800 + 1 009,81. Le commentaire de l'appelant disait pourtant qu'une
 * provision non alimentée « contient bien zéro » : le code contredisait son
 * intention.
 *
 * @param {Array<Object>} versements - Versements du pot
 * @param {number} depense - Total des charges rattachées
 * @returns {number} Ce qui compte déjà pour l'objectif, dans la bonne lecture
 */
export function acquisSurObjectif(versements, depense) {
  const sorti = Number.isFinite(depense) ? depense : 0;
  return estAlimentee(versements) ? totalVerse(versements) - sorti : sorti;
}

/**
 * Ce qu'il y a dans une cagnotte, et où elle en est de son objectif
 *
 * @param {Array<Object>} versements - Versements du pot
 * @param {number} depense - Total des charges rattachées, déjà calculé
 * @param {number|null} objectif - Montant visé, ou null
 * @returns {{verse: number, depense: number, dansLePot: number, objectif: number|null,
 *   partAtteinte: number|null, manque: number|null, atteint: boolean, aDecouvert: boolean}}
 */
export function bilanCagnotte(versements, depense, objectif) {
  const verse = totalVerse(versements);
  const sorti = Number.isFinite(depense) ? depense : 0;
  const dansLePot = verse - sorti;

  const vise = Number.isFinite(objectif) && objectif > 0 ? objectif : null;

  return {
    verse,
    depense: sorti,
    dansLePot,
    objectif: vise,
    // La jauge **monte** : un pot se remplit là où un budget se vide. Bornée à
    // [0, 100] — un pot à découvert ne fait pas sortir la barre par le bas, et
    // un pot au-delà de son objectif ne la fait pas déborder ; ce sont
    // `aDecouvert` et `atteint` qui le disent.
    partAtteinte: vise === null
      ? null
      : Math.max(0, Math.min(100, Math.round((dansLePot / vise) * 100))),
    manque: vise === null ? null : Math.max(0, vise - dansLePot),
    atteint: vise !== null && dansLePot >= vise,
    // Sortir plus que ce qu'on a mis : le pot doit le dire plutôt que d'afficher
    // une barre vide, qui se lirait « rien dedans » et non « vous êtes en
    // dessous de zéro ».
    aDecouvert: dansLePot < 0
  };
}

/**
 * Ce couple montant/auteur est-il écrivable ?
 *
 * Rejoue côté client le contrôle que les règles Firebase appliquent côté
 * serveur, pour que le refus s'explique avant l'écriture plutôt qu'après —
 * sans quoi la saisie partirait grossir la file hors ligne.
 *
 * @param {*} montantSaisi - Valeur du champ, telle que saisie
 * @param {string} auteur
 * @returns {{valide: boolean, montant?: number, erreur?: string}}
 */
export function versementEcrivable(montantSaisi, auteur) {
  const montant = parseMontant(montantSaisi);

  if (!Number.isFinite(montant) || montant <= 0) {
    return { valide: false, erreur: 'Montant du versement requis' };
  }
  if (montant > VERSEMENT_MAX) {
    return { valide: false, erreur: 'Montant trop élevé' };
  }
  if (!PERSONNES.includes(auteur)) {
    return { valide: false, erreur: 'Un versement doit dire qui l\'a fait' };
  }

  return { valide: true, montant };
}

/**
 * L'aval, le mur, et le seul chiffre qui le franchit
 *
 * Le périmètre « solo » a sorti une dépense du solde. Il ne l'a pas rendue
 * privée : les deux comptes lisent tout `household`, et une dépense perso s'y
 * affiche avec son montant et son libellé. « Ça ne se partage pas » n'est pas
 * « c'est à moi seul ».
 *
 * ## Pourquoi le mur ne peut pas être ici
 *
 * Une confidentialité écrite en JavaScript est du théâtre. L'autre personne a
 * exactement les mêmes accès à la base : un drapeau « masqué » est un rideau,
 * pas un mur — il suffit d'ouvrir la console Firebase pour lire à travers. Le
 * refus doit venir du **serveur**, et il en vient : `database.rules.json` donne
 * à `/prive/{emplacement}` une lecture réservée à son seul propriétaire.
 *
 * Ce fichier ne fait donc que du calcul. Il ne protège rien ; il met en forme
 * ce que les règles, elles, garantissent.
 *
 * ## L'aval, et ce qui le rend vrai
 *
 * Personne ne peut s'accorder son propre aval : la règle d'écriture de
 * `/aval/{emplacement}` exige d'être **l'autre**. Ce n'est pas une politesse
 * d'interface, c'est le moteur de règles qui refuse — rejoué contre lui, 22
 * contrôles dans les deux sens.
 *
 * Le retirer ferme les écritures futures et **n'ouvre jamais le passé** : la
 * lecture reste réservée au propriétaire, aval ou non. Sinon « privé » n'aurait
 * jamais été vrai, seulement différé.
 *
 * ## La limite honnête du total publié
 *
 * Le total qui franchit le mur est **déclaratif**. L'application du
 * propriétaire l'écrit ; aucune règle serveur ne peut vérifier qu'il correspond
 * au détail, puisque le serveur n'a pas le droit d'additionner ce qu'il n'a pas
 * le droit de lire — c'est le principe même du mur. Il repose donc sur la
 * confiance, et cela tient au choix « détail privé, total public », pas à un
 * défaut de mise en œuvre.
 */

import { parseMontant } from './montant.js';

/** Les deux emplacements du foyer */
export const EMPLACEMENTS = Object.freeze(['vous', 'conjointe']);

/** Plafond d'une dépense privée, aligné sur celui d'une charge */
const MONTANT_MAX = 100000;

/** Format d'une date : AAAA-MM-JJ */
const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * L'autre personne du foyer
 *
 * `null` sur un emplacement inconnu : désigner quelqu'un au hasard ferait
 * demander son aval à la mauvaise personne, ou pire, le lui accorder.
 *
 * @param {string} emplacement
 * @returns {'vous'|'conjointe'|null}
 */
export function emplacementOppose(emplacement) {
  if (emplacement === 'vous') return 'conjointe';
  if (emplacement === 'conjointe') return 'vous';
  return null;
}

/**
 * Remet un aval lu en base dans une forme exploitable
 *
 * L'absence vaut refus. C'est le seul défaut acceptable : un aval qu'on n'a pas
 * pu lire ne doit jamais être pris pour un aval accordé, sinon une lecture qui
 * échoue ouvrirait l'écriture privée. Le serveur la refuserait quand même —
 * mais l'écran promettrait alors quelque chose que la base démentira.
 *
 * @param {*} brut - Nœud `/aval/{emplacement}` tel que lu
 * @returns {{actif: boolean, accordeLe: number|null, accordePar: string|null}}
 */
export function normaliserAval(brut) {
  if (!brut || typeof brut !== 'object') {
    return { actif: false, accordeLe: null, accordePar: null };
  }

  return {
    actif: brut.actif === true,
    accordeLe: Number.isFinite(brut.accordeLe) ? brut.accordeLe : null,
    accordePar: EMPLACEMENTS.includes(brut.accordePar) ? brut.accordePar : null
  };
}

/**
 * Remet une dépense privée dans une forme exploitable
 *
 * Un montant inexploitable écarte l'entrée plutôt que de la compter pour zéro :
 * une dépense à zéro gonflerait le nombre publié à l'autre sans rien ajouter au
 * total, et le compte annoncé cesserait de correspondre.
 *
 * @param {*} brut
 * @param {string} [id] - Clé Firebase, reportée sur l'entrée
 * @returns {{id: string, montant: number, description: string, category: string, date: string|null, deleted: boolean}|null}
 */
export function normaliserDepensePrivee(brut, id = '') {
  if (!brut || typeof brut !== 'object') return null;

  const montant = parseMontant(brut.montant);
  if (!Number.isFinite(montant) || montant < 0 || montant > MONTANT_MAX) return null;

  const texte = (valeur, longueur) =>
    (typeof valeur === 'string' ? valeur.trim().slice(0, longueur) : '');

  return {
    id: typeof brut.id === 'string' && brut.id ? brut.id : String(id || ''),
    montant,
    description: texte(brut.description, 200),
    category: texte(brut.category, 100),
    date: typeof brut.date === 'string' && FORMAT_DATE.test(brut.date.trim())
      ? brut.date.trim()
      : null,
    deleted: brut.deleted === true
  };
}

/**
 * Normalise un mois de dépenses privées, tel que Firebase le rend
 *
 * @param {*} noeud - Nœud `depenses` d'une période
 * @returns {Array<Object>} Les plus récentes d'abord
 */
export function normaliserDepensesPrivees(noeud) {
  if (!noeud || typeof noeud !== 'object') return [];

  return Object.entries(noeud)
    .map(([cle, valeur]) => normaliserDepensePrivee(valeur, cle))
    .filter(Boolean)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/**
 * Les dépenses qui comptent — celles qui ne sont pas à la corbeille
 *
 * @param {Array<Object>} depenses
 * @returns {Array<Object>}
 */
export function depensesActives(depenses) {
  return (Array.isArray(depenses) ? depenses : []).filter(d => d && !d.deleted);
}

/**
 * Ce qui franchit le mur : le total et le compte, jamais le détail
 *
 * Le compte accompagne le montant parce qu'il change ce qu'on en comprend :
 * « 340 € en 2 dépenses » et « 340 € en 27 dépenses » ne décrivent pas le même
 * mois, et aucun des deux ne dit ce qui a été acheté.
 *
 * @param {Array<Object>} depenses
 * @returns {{montant: number, nombre: number}}
 */
export function resumePublie(depenses) {
  const actives = depensesActives(depenses);
  return {
    montant: actives.reduce(
      (somme, d) => somme + (Number.isFinite(d.montant) ? d.montant : 0),
      0
    ),
    nombre: actives.length
  };
}

/**
 * Le résumé publié par l'autre, remis en forme
 *
 * Un nœud absent n'est pas « zéro dépense privée » : c'est « on n'en sait
 * rien », et les deux se lisent très différemment. `publie` distingue les deux
 * pour que l'écran puisse se taire au lieu d'affirmer.
 *
 * @param {*} brut - Nœud `/totauxPrives/{emplacement}/{periode}`
 * @returns {{publie: boolean, montant: number, nombre: number}}
 */
export function resumeLu(brut) {
  if (!brut || typeof brut !== 'object' || !Number.isFinite(brut.montant)) {
    return { publie: false, montant: 0, nombre: 0 };
  }
  return {
    publie: true,
    montant: brut.montant,
    nombre: Number.isFinite(brut.nombre) ? brut.nombre : 0
  };
}

/**
 * Cette dépense privée est-elle écrivable ?
 *
 * Rejoue côté client ce que les règles appliquent côté serveur, pour que le
 * refus s'explique avant l'écriture. L'aval est vérifié ici aussi : sans lui,
 * la saisie partirait pour être rejetée plus tard — hors ligne, elle irait même
 * grossir la file d'attente, loin du geste qui l'a produite.
 *
 * @param {*} montantSaisi
 * @param {Object} aval - Normalisé par `normaliserAval`
 * @returns {{valide: boolean, montant?: number, erreur?: string}}
 */
export function depensePriveeEcrivable(montantSaisi, aval) {
  if (!aval || aval.actif !== true) {
    return {
      valide: false,
      erreur: 'Sans l\'accord de votre conjointe, aucune dépense privée ne peut être enregistrée'
    };
  }

  const montant = parseMontant(montantSaisi);
  if (!Number.isFinite(montant) || montant <= 0) {
    return { valide: false, erreur: 'Montant requis' };
  }
  if (montant > MONTANT_MAX) {
    return { valide: false, erreur: 'Montant trop élevé' };
  }

  return { valide: true, montant };
}

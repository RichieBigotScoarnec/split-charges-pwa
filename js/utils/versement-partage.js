/**
 * FairSplit — Alimenter une cagnotte à deux, chacun selon ses revenus
 *
 * Un versement porte un auteur, et un seul. Mettre 150 € de côté chaque mois
 * pour les vacances — la décision d'un foyer, pas d'une personne — demandait
 * donc de calculer les deux parts de tête, puis de saisir deux versements.
 * L'application connaît pourtant les revenus du mois : elle savait diviser une
 * dépense, elle ne savait pas diviser une mise de côté.
 *
 * ## Le partage suit celui des charges, il n'en invente pas un autre
 *
 * `calculateChargeShares` est la fabrique, et la seule. Un foyer au prorata
 * verse au prorata, un foyer à 50-50 verse à parts égales, un foyer à
 * pourcentages libres verse selon les siens. Recalculer ici « le prorata » à
 * part donnerait deux formules pour un même partage — et deux façons de dire la
 * même chose finissent toujours par diverger.
 *
 * ## Le mois qui décide est celui du versement, pas celui qu'on regarde
 *
 * La vue d'une enveloppe est transversale : elle s'ouvre depuis n'importe quel
 * mois affiché. Les revenus retenus sont donc ceux du mois de la DATE du
 * versement — le mois où l'argent est réellement mis de côté. C'est la même
 * règle que pour une charge, rangée dans le mois de sa date et non de l'écran.
 *
 * ## Deux parts qui font exactement le total
 *
 * L'une est arrondie, l'autre est le reste. Arrondir les deux séparément fait
 * perdre ou inventer un centime une fois sur deux : 150 € partagés 57,3 / 42,7
 * donnent 85,95 et 64,05, mais 100,01 € partagés en deux donneraient deux fois
 * 50,01 — soit 100,02 en base, pour un pot dont on croit connaître le contenu.
 *
 * Aucune base, aucun DOM, aucun réseau.
 */

import { calculateChargeShares } from './calculations.js';
import { resolveIncomeBase } from './salaries.js';

/** La valeur que porte le choix « à deux » dans le sélecteur d'auteur */
export const AUTEUR_A_DEUX = 'deux';

/** Arrondi au centime */
function auCentime(valeur) {
  return Math.round(valeur * 100) / 100;
}

/**
 * Comment un versement se répartit entre les deux personnes
 *
 * Le mode RÉELLEMENT appliqué est rendu, et pas seulement celui qui était
 * demandé : `calculateChargeShares` retombe sur 50-50 quand le prorata n'a rien
 * à diviser — un mois sans revenus saisis. Ce repli est le bon, mais l'écran
 * doit pouvoir dire ce qui s'est passé plutôt qu'annoncer un prorata qui n'en
 * est pas un.
 *
 * @param {Object} params
 * @param {number} params.montant - Total à mettre de côté
 * @param {string} params.shareMode - Mode du foyer : 'prorata' | '50-50' | 'custom'
 * @param {Object} params.salaries - Instantané de revenus du mois du versement
 * @param {Object} [params.customPercents] - Pourcentages libres du foyer
 * @returns {{vous: number, conjointe: number, applique: string}|null} null si
 *          le montant n'est pas exploitable
 */
export function partagerLeVersement({ montant, shareMode, salaries, customPercents } = {}) {
  if (!Number.isFinite(montant) || montant <= 0) return null;

  const assiette = resolveIncomeBase(salaries);

  // Le prorata sans revenus n'est pas un prorata : `calculateChargeShares`
  // partage alors en deux, et c'est ce qu'il faut dire.
  const applique = shareMode === 'prorata' && assiette.total <= 0 ? '50-50' : shareMode;

  const { yourShare } = calculateChargeShares(
    { amount: montant, splitOverride: null },
    shareMode,
    assiette,
    assiette.total,
    customPercents || { vous: 50, conjointe: 50 }
  );

  // L'une arrondie, l'autre le reste : les deux parts font exactement le total.
  const vous = auCentime(yourShare);
  const conjointe = auCentime(montant - vous);

  return { vous, conjointe, applique };
}

/**
 * Les versements à écrire, une fois les parts connues
 *
 * Une part nulle ne donne pas de versement : les règles Firebase exigent un
 * montant strictement positif, et `normaliserVersement` écarte le zéro. Écrire
 * quand même produirait un refus sur la moitié du geste, pour une ligne qui
 * n'aurait rien dit de plus qu'une absence.
 *
 * Le cas n'est pas théorique : un mois où l'un des deux n'a aucun revenu saisi
 * met tout le versement sur l'autre, et c'est arithmétiquement juste.
 *
 * @param {{vous: number, conjointe: number}} parts - Rendu par `partagerLeVersement`
 * @returns {Array<{auteur: string, montant: number}>} Vide si rien n'est à écrire
 */
export function versementsAEcrire(parts) {
  if (!parts) return [];

  return [
    { auteur: 'vous', montant: parts.vous },
    { auteur: 'conjointe', montant: parts.conjointe }
  ].filter(part => Number.isFinite(part.montant) && part.montant > 0);
}

/**
 * Comment le partage se raconte, une fois les prénoms connus
 *
 * La phrase paraît AVANT l'écriture, sous le formulaire : deux versements qui
 * partent d'un seul geste doivent être lisibles avant d'être faits, sinon le
 * pot se remplit de lignes que personne n'a vues passer.
 *
 * Les montants sont reçus déjà formatés — le formatage monétaire vit dans
 * `format.js`, et cette fonction n'a pas à en connaître un second.
 *
 * @param {Object} params
 * @param {string} params.applique - Mode réellement appliqué
 * @param {string} params.montantVous - Part de « vous », déjà formatée
 * @param {string} params.montantConjointe - Part de la conjointe, déjà formatée
 * @param {string} params.nomVous - Prénom, ou son défaut
 * @param {string} params.nomConjointe - Prénom, ou son défaut
 * @param {string} params.mois - Le mois du versement, en toutes lettres
 * @returns {string}
 */
export function phraseDuPartage({
  applique, montantVous, montantConjointe, nomVous, nomConjointe, mois
} = {}) {
  const selon = {
    'prorata': `au prorata des revenus de ${mois}`,
    '50-50': 'à parts égales',
    'custom': 'selon vos pourcentages'
  }[applique] || 'à parts égales';

  return `${montantVous} pour ${nomVous}, ${montantConjointe} pour ${nomConjointe} — ${selon}.`;
}

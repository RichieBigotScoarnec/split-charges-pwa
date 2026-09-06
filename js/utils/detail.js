/**
 * FairSplit — Le détail derrière un chiffre du bilan
 *
 * Le bilan annonce « Richard a payé 670,15 € » et « Restaurant : 565,60 € ».
 * Deux chiffres justes, et aucun moyen de savoir ce qu'il y a dedans : il
 * fallait aller dans les charges et filtrer de tête.
 *
 * Ce module rend les lignes qui composent l'un de ces chiffres. Sa seule
 * exigence, mais elle est absolue : **le détail doit s'additionner jusqu'au
 * chiffre qu'il explique.** Un écran qui ouvre un total sur une liste qui ne
 * le retrouve pas est pire que pas d'écran du tout — il fait douter du total.
 *
 * D'où la règle de construction : les charges passent par le MÊME entonnoir que
 * `computeSummary` — communes seulement, non supprimées, montant inexploitable
 * ramené à zéro — et la part d'une charge partagée est calculée par la même
 * fonction, `calculateJointPayment`. Pas de second calcul : c'est ainsi que les
 * deux chiffres divergent.
 *
 * Ce module ne fait que du calcul : aucune base, aucun DOM, aucun réseau.
 */

import { chargesCommunes } from './perimetre.js';
import { calculateJointPayment } from './calculations.js';
import { resolveIncomeBase } from './salaries.js';
import { trierParDate } from './tri.js';

/**
 * Les charges que le bilan compte, marquées de leur origine
 *
 * Exactement l'entonnoir de `computeSummary` : une dépense solo n'entre pas,
 * une charge supprimée non plus, et un montant inexploitable vaut zéro plutôt
 * que de propager `NaN` jusqu'à l'écran.
 *
 * Le drapeau `fixe` sert à l'affichage — une ligne « Loyer » gagne à dire
 * qu'elle est fixe —, jamais au calcul.
 *
 * @param {Array<Object>} fixedCharges
 * @param {Array<Object>} variableCharges
 * @returns {Array<Object>}
 */
function chargesRetenues(fixedCharges, variableCharges) {
  const retenir = (liste, fixe) => chargesCommunes(Array.isArray(liste) ? liste : [])
    .filter(charge => charge && !charge.deleted)
    .map(charge => ({
      ...charge,
      fixe,
      amount: Number.isFinite(charge.amount) ? charge.amount : 0
    }));

  return [...retenir(fixedCharges, true), ...retenir(variableCharges, false)];
}

/** La somme d'une propriété sur des lignes */
function somme(lignes, cle) {
  return lignes.reduce((total, ligne) => total + (Number.isFinite(ligne[cle]) ? ligne[cle] : 0), 0);
}

/**
 * Ce que quelqu'un a réellement avancé, ligne par ligne
 *
 * Une charge « partagée » ne compte pas en entier : chacun n'en a avancé qu'une
 * part, celle que `calculateJointPayment` calcule. Afficher son montant plein
 * ferait une liste qui dépasse son propre total — le défaut le plus facile à
 * commettre ici, et le seul qui compte.
 *
 * Les lignes dont la part est nulle sont écartées : elles n'expliquent rien.
 *
 * @param {Object} params
 * @param {Array<Object>} params.fixedCharges
 * @param {Array<Object>} params.variableCharges
 * @param {'vous'|'conjointe'} params.qui
 * @param {string} params.shareMode
 * @param {Object} params.salaries
 * @param {Object} params.customPercents
 * @returns {{lignes: Array<Object>, total: number}}
 */
export function detailDuPayeur({
  fixedCharges, variableCharges, qui, shareMode, salaries, customPercents
}) {
  const base = resolveIncomeBase(salaries);
  const lignes = [];

  for (const charge of chargesRetenues(fixedCharges, variableCharges)) {
    let part;

    if (charge.paidBy === 'vous') {
      part = qui === 'vous' ? charge.amount : 0;
    } else if (charge.paidBy === 'conjointe') {
      part = qui === 'conjointe' ? charge.amount : 0;
    } else {
      // Même fabrique que le bilan : un second calcul divergerait.
      const joint = calculateJointPayment(charge, shareMode, base, base.total, customPercents);
      part = qui === 'vous' ? joint.yourPayment : joint.partnerPayment;
    }

    if (!Number.isFinite(part) || part <= 0) continue;

    lignes.push({
      ...charge,
      part,
      // Vrai quand la ligne ne compte que pour une part de son montant : c'est
      // ce que l'écran doit dire, sinon le lecteur additionne les montants
      // affichés et ne retombe pas sur le total.
      partielle: Math.round(part * 100) !== Math.round(charge.amount * 100)
    });
  }

  return { lignes: trierParDate(lignes), total: somme(lignes, 'part') };
}

/**
 * Ce qu'une catégorie contient, ligne par ligne
 *
 * Le repli sur « Autre » reproduit celui de `analyzeCategoriesData` : une
 * charge sans catégorie y est comptée sous ce nom, et le détail doit la
 * retrouver au même endroit.
 *
 * @param {Object} params
 * @param {Array<Object>} params.fixedCharges
 * @param {Array<Object>} params.variableCharges
 * @param {string} params.categorie
 * @returns {{lignes: Array<Object>, total: number}}
 */
export function detailDeLaCategorie({ fixedCharges, variableCharges, categorie }) {
  const cible = typeof categorie === 'string' && categorie ? categorie : 'Autre';

  const lignes = chargesRetenues(fixedCharges, variableCharges)
    .filter(charge => (charge.category || 'Autre') === cible);

  return { lignes: trierParDate(lignes), total: somme(lignes, 'amount') };
}

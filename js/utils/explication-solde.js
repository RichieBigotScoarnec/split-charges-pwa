/**
 * FairSplit — D'où vient le solde : l'ardoise, et ce que le mois en a fait
 *
 * Le solde affiché a deux composantes, et une seule était nommée :
 *
 *     solde = report des mois précédents + solde propre au mois
 *
 * La phrase disait « dont 39,01 € que la conjointe devait déjà au titre des
 * mois précédents », quel que soit le mois courant. Elle se déclenchait sur la
 * seule EXISTENCE d'un report, sans regarder ni son sens ni ce qu'il restait à
 * devoir. Trois de ses quatre cas étaient faux :
 *
 *   — le mois REMBOURSE l'ardoise : « 9,58 € dont 39,01 € », une partie plus
 *     grande que le tout ;
 *   — le report allait en SENS INVERSE : « dont » rapporte l'une à l'autre deux
 *     dettes opposées ;
 *   — le mois SOLDE exactement : « Comptes équilibrés » suivi, dans la même
 *     carte, de « dont 39,01 € que la conjointe devait ». Deux phrases qui se
 *     contredisent à un pixel d'écart.
 *
 * Le cas où « dont » est juste — le mois creuse l'ardoise — est le seul des
 * quatre, et c'est probablement celui sur lequel la phrase a été écrite.
 *
 * ## Deux faits plutôt qu'une fraction
 *
 * Un report ne se raconte pas comme une part d'un total : il se raconte comme
 * un état de départ et un mouvement. « 39,01 € restaient dus ; ce mois-ci en a
 * effacé 29,43 € » se vérifie de tête, et reste vrai dans les quatre cas.
 *
 * ## Les comparaisons se font en centimes entiers
 *
 * `finalBalance` est arrondi au centime par `computeSummary` ; le report et le
 * solde propre ne le sont pas. Comparer les flottants bruts ferait basculer de
 * cas sur un résidu de virgule — exactement le défaut qui faisait proposer de
 * régler une dette de -0,0011 €.
 */

import { formatCurrency } from './format.js';

/** Un montant en centimes entiers, seule échelle où l'argent se compare */
function centimes(valeur) {
  return Math.round((Number.isFinite(valeur) ? valeur : 0) * 100);
}

/**
 * D'où vient le solde du mois
 *
 * Rend une phrase nue, sans balisage : l'appelant l'insère où il veut, et
 * aucune donnée de membre n'y transite — donc rien à échapper.
 *
 * @param {Object} params
 * @param {number} params.carryOver - Report des mois précédents
 * @param {number} params.ownBalance - Solde propre au mois affiché
 * @param {number} params.finalBalance - Somme des deux, arrondie au centime
 * @returns {string} Phrase, ou chaîne vide s'il n'y a rien à expliquer
 */
export function expliquerLeReport({ carryOver, ownBalance, finalBalance }) {
  const report = centimes(carryOver);
  const mois = centimes(ownBalance);
  const total = centimes(finalBalance);

  // Sans report, il n'y a pas de composition à expliquer : le solde EST le
  // mois. L'appelant garde sa phrase d'avant, qui dit qui a payé plus que sa
  // part — vraie, et déjà éprouvée.
  if (report === 0) return '';

  const somme = (c) => formatCurrency(Math.abs(c) / 100);

  if (mois === 0) {
    return `${somme(report)} restaient dus des mois précédents ; ce mois-ci n'y a rien changé.`;
  }

  // Même sens : le mois CREUSE l'ardoise. C'est le seul cas où « dont » dit
  // vrai, et on le garde — les deux montants s'additionnent bien vers le total.
  if ((report > 0) === (mois > 0)) {
    return `dont ${somme(report)} des mois précédents et ${somme(mois)} de ce mois-ci.`;
  }

  // Sens opposés : le mois REMBOURSE. Trois issues, selon ce qu'il en reste.
  if (total === 0) {
    return `les ${somme(report)} dus des mois précédents sont soldés : ce mois-ci les a exactement effacés.`;
  }

  // Le signe du total a changé : l'ardoise est effacée, et le mois a basculé
  // au-delà. Qui doit désormais est déjà dit par le solde lui-même — inutile de
  // le répéter, et le répéter obligerait à faire transiter un prénom ici.
  if ((total > 0) !== (report > 0)) {
    return `les ${somme(report)} dus des mois précédents sont soldés ; ce mois-ci laisse ${somme(total)} dans l'autre sens.`;
  }

  return `${somme(report)} restaient dus des mois précédents ; ce mois-ci en a effacé ${somme(mois)}.`;
}

/**
 * FairSplit — Chercher un montant, tel qu'on le lit et tel qu'on le tape
 *
 * La recherche versait le montant brut parmi les champs de texte :
 * `String(charge.amount)`. Une charge de 12,50 € y entrait sous la forme
 * « 12.5 ». Trois conséquences, toutes constatées :
 *
 *   « 12,50 »  — ce que l'écran affiche — ne trouvait rien
 *   « 12.50 »  — la même somme, au point — ne trouvait rien non plus
 *   « 1 171,01 » ne trouvait rien, l'espace des milliers y suffisait
 *
 * Et la comparaison par sous-chaîne rendait l'inverse aussi faux : « 17 »
 * trouvait 1171,01, parce que ces deux chiffres s'y suivent. Un montant n'est
 * pas un texte — le chercher comme tel donne des réponses vides sur ce qui
 * existe, et des réponses fausses sur ce qui n'a rien à voir.
 *
 * Ce module compare des NOMBRES. Le texte reste au texte.
 */

/**
 * Ce qui sépare les milliers, à l'écran comme au clavier
 *
 * `formatCurrency` produit une espace insécable étroite (U+202F) que personne
 * ne tape ; un utilisateur tape une espace ordinaire, ou rien. Les trois
 * doivent mener au même montant.
 */
const SEPARATEURS_MILLIERS = /[\s   ']/g;

/**
 * Un montant, au plus deux décimales, une fois la saisie nettoyée
 *
 * Deux décimales et pas plus : au-delà, ce n'est pas un montant en euros, et
 * le rendre ici ferait chercher un nombre que la base ne peut pas contenir.
 */
const MONTANT_SAISI = /^\d+(\.\d{0,2})?$/;

/**
 * La saisie ramenée à une écriture unique, ou null si ce n'est pas un montant
 *
 * Rendue à part parce que c'est elle qui décide si la requête relève de ce
 * module : « courses » n'est pas un montant et doit rester au texte.
 *
 * @param {*} requete - Ce que l'utilisateur a tapé
 * @returns {string|null} Un nombre écrit au point, ou null
 */
export function normaliserSaisieMontant(requete) {
  if (typeof requete !== 'string') return null;

  const net = requete
    .replace(/€/g, '')
    .replace(SEPARATEURS_MILLIERS, '')
    // La virgule est le séparateur décimal du clavier français ; le point,
    // celui de la base. Les deux désignent la même somme.
    .replace(/,/g, '.');

  return MONTANT_SAISI.test(net) ? net : null;
}

/**
 * Ce montant répond-il à cette recherche ?
 *
 * Deux lectures, selon que la saisie porte ou non des décimales — et c'est
 * cette distinction qui rend la recherche utile :
 *
 *   « 12 »    désigne les EUROS. Trouve 12,00 et 12,50, jamais 120,00, qui est
 *             un autre montant. Chercher un ordre de grandeur est légitime ;
 *             ramener tout ce qui commence par les mêmes chiffres ne l'est pas.
 *   « 12,5 »  désigne la somme exacte, au centime. Trouve 12,50 — l'écran écrit
 *             deux décimales, la base en garde une, et l'utilisateur ne devrait
 *             pas avoir à savoir laquelle des deux il interroge.
 *
 * La valeur absolue est prise pour que le sens d'un remboursement ne décide pas
 * de sa trouvabilité.
 *
 * @param {*} montant - Montant porté par la charge
 * @param {*} requete - Ce que l'utilisateur a tapé
 * @returns {boolean}
 */
export function montantCorrespond(montant, requete) {
  const net = normaliserSaisieMontant(requete);
  if (net === null) return false;

  const valeur = Number(montant);
  if (!Number.isFinite(valeur)) return false;

  const cible = Number(net);
  if (!Number.isFinite(cible)) return false;

  const absolu = Math.abs(valeur);

  if (!net.includes('.')) return Math.trunc(absolu) === cible;

  // Au centime, et par entiers : 1171,01 × 100 vaut 117101,00000000001 en
  // flottant, et une égalité stricte sur les décimales serait fausse.
  return Math.round(absolu * 100) === Math.round(cible * 100);
}

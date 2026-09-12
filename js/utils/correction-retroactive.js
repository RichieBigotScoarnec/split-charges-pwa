/**
 * FairSplit — L'écart qu'une correction rétroactive laisse sur place
 *
 * Corriger le salaire d'un mois passé est un geste sûr, et il a été construit
 * pour l'être : chaque mois porte son propre instantané de revenus, et
 * `saveSalaries` n'écrit les revenus globaux que si l'on édite le mois courant.
 * Corriger août ne touche donc ni septembre ni la valeur par défaut des mois à
 * venir.
 *
 * Il reste un cas, un seul, où le geste laisse quelque chose derrière lui.
 *
 * ## Le cas
 *
 * Août a été soldé — un remboursement a ramené son solde à zéro. En septembre,
 * on corrige le salaire d'août. Le solde d'août change : le remboursement
 * enregistré ne correspond plus aux parts recalculées.
 *
 * **Report activé**, il ne se passe rien de fâcheux : `computeBalanceChain`
 * recalcule toute la chaîne à chaque changement de mois, et l'écart rejoint
 * septembre de lui-même. C'est exactement ce pour quoi le report existe.
 *
 * **Report désactivé**, chaque mois repart de zéro. L'écart reste donc sur
 * août, un mois qu'on ne regarde plus, et il n'existe nulle part ailleurs. Rien
 * à l'écran ne le dit : la sauvegarde est verte, le bilan de septembre est
 * juste, et la somme des deux mois ne l'est plus.
 *
 * ## Ce que ce module fait, et ce qu'il ne fait pas
 *
 * Il ne corrige rien et n'empêche rien : la correction est légitime, c'est même
 * la raison d'être des instantanés par mois. Il rend une phrase, ou rien.
 *
 * Et il ne la rend que quand elle apprend quelque chose. Un mois déjà non soldé
 * qui le reste n'appelle aucune remarque — on le savait. Une correction qui
 * ramène le mois à zéro non plus : c'est la bonne nouvelle, et l'annoncer
 * reviendrait à traiter une réussite comme un incident.
 *
 * Aucune base, aucun DOM, aucun réseau.
 */

import { formatCurrency } from './format.js';
import { formatPeriod } from './date.js';

/** Une clé de mois : AAAA-MM */
const CLE_MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Arrondi au centime, la seule précision qui ait un sens ici
 *
 * Deux soldes qui ne diffèrent que d'un millième d'euro sont le même solde :
 * ils viennent d'une division par une somme de salaires, et l'écran les
 * afficherait identiques. Comparer les valeurs brutes ferait paraître un
 * avertissement pour un chiffre que personne ne peut voir bouger.
 *
 * @param {*} valeur
 * @returns {number} 0 si la valeur n'est pas un nombre fini
 */
function auCentime(valeur) {
  return Number.isFinite(valeur) ? Math.round(valeur * 100) / 100 : 0;
}

/**
 * La correction d'un mois passé laisse-t-elle un écart que rien ne rattrapera ?
 *
 * Les cinq conditions sont cumulatives, et chacune écarte un cas où la phrase
 * serait fausse ou inutile :
 *
 *   1. les deux mois sont lisibles — sans quoi on ne sait pas de quoi on parle ;
 *   2. le mois corrigé est **antérieur** au mois courant. Corriger le mois en
 *      cours est la saisie ordinaire, et c'est d'ailleurs le seul cas où les
 *      revenus globaux suivent ;
 *   3. le report est **désactivé**. Activé, la chaîne des soldes porte l'écart
 *      au mois suivant, et il n'y a rien à signaler ;
 *   4. le solde a **changé**. Sinon la correction n'a rien déplacé — deux
 *      revenus corrigés dans le même rapport, par exemple ;
 *   5. le solde d'arrivée n'est **pas** nul. Une correction qui solde le mois
 *      est une bonne nouvelle, pas un avertissement.
 *
 * @param {Object} params
 * @param {string} params.periode - Le mois corrigé, AAAA-MM
 * @param {string} params.moisCourant - Le mois calendaire, AAAA-MM
 * @param {boolean} params.reportActif - Le report d'un mois sur l'autre
 * @param {number} params.soldeAvant - Solde du mois avant la correction
 * @param {number} params.soldeApres - Solde du mois après la correction
 * @returns {string|null} La phrase à dire, ou null s'il n'y a rien à dire
 */
export function ecartLaisseParLaCorrection({
  periode, moisCourant, reportActif, soldeAvant, soldeApres
} = {}) {
  if (typeof periode !== 'string' || !CLE_MOIS.test(periode)) return null;
  if (typeof moisCourant !== 'string' || !CLE_MOIS.test(moisCourant)) return null;

  // Les clés AAAA-MM se comparent comme des chaînes : c'est exact, et cela
  // évite une `Date` dont le fuseau n'a rien à faire ici.
  if (periode >= moisCourant) return null;

  if (reportActif) return null;

  const avant = auCentime(soldeAvant);
  const apres = auCentime(soldeApres);
  if (avant === apres) return null;
  if (apres === 0) return null;

  const mois = formatPeriod(periode);

  // Aucun reproche, et aucune consigne : le fait, puis où il se trouve. Le sens
  // du solde — qui doit à qui — se lit sur le bilan du mois, qui est à l'écran
  // au moment où cette phrase paraît. Le répéter ici demanderait les prénoms du
  // foyer, et deux rédactions du même chiffre finissent par diverger.
  return `Le solde de ${mois} passe de ${formatCurrency(avant)} à ${formatCurrency(apres)}. `
    + 'Le report étant désactivé, cet écart ne rejoindra aucun autre mois.';
}

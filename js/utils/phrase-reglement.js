/**
 * FairSplit — Ce qu'un règlement fera au solde, dit avant de l'écrire
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PHRASE EXISTE
 *
 * « Régler ce solde » écrivait le montant EXACT du solde, après une question
 * fermée. On rembourse pourtant rarement au centime : on arrondit — 70 € pour
 * 66,94 € —, on paie en deux fois, ou on verse ce que la banque a réellement
 * débité. Le montant devient donc une saisie, et une saisie libre ouvre trois
 * issues au lieu d'une.
 *
 * La protection contre la faute de frappe n'est pas un plafond : c'est cette
 * phrase. Un plafond refuserait un geste légitime — un trop-versé délibéré
 * existe — et un refus n'apprend rien. La phrase, elle, AFFICHE la
 * conséquence : « Il restera 1 233,06 € à régler » se lit tout seul quand on
 * voulait taper 70 et qu'on a tapé 7.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AU CENTIME, JAMAIS EN FLOTTANT
 *
 * `66.94 - 66.94` vaut zéro, mais `0.1 + 0.2 - 0.3` ne vaut pas zéro. Une
 * comparaison flottante ferait donc dire « il restera 0,00 € à régler » à un
 * paiement exact — un reste affiché nul, sur l'écran qui promettait zéro. Les
 * trois branches se décident sur des ENTIERS de centimes, et le reste rendu en
 * est un : le rendu divise, la décision non.
 *
 * ─────────────────────────────────────────────────────────────────────
 * « TU », ET QUI EST « TU »
 *
 * Même convention que la tête du bilan : les phrases s'adressent à la personne
 * qui tient le téléphone, et `moi` est l'emplacement du compte connecté. Le
 * trop-versé a DEUX lectures, pas une — celui qui verse trop peut être l'un ou
 * l'autre — et une seule rédaction se périmerait sur un des deux téléphones :
 *
 *   je verse trop        → l'autre me devra   → « Cindy te devra 5,00 € »
 *   l'autre verse trop   → je lui devrai      → « Tu devras 5,00 € à Cindy »
 *
 * Le sens du solde qui RESTE n'est pas relu ici : il vient de
 * `describeBalance`, seule fabrique de la convention « positif, la conjointe
 * est débitrice ». Une seconde lecture du signe serait le défaut `normalizePair`
 * appliqué à un sens plutôt qu'à un total.
 *
 * Aucun DOM, aucune base : ce module répond, le rendu affiche.
 */

import { parseMontant } from './montant.js';
import { validateChargeAmount } from './validation.js';
import { formatCurrency } from './format.js';
import { describeBalance, memberLabel, normaliserEmplacement } from './members.js';
import { emplacementOppose } from './confidentialite.js';

/**
 * Les quatre issues d'une saisie, nommées
 *
 * Nommées plutôt que devinées du signe du reste par chaque lecteur : le rendu
 * désactive son bouton sur `refus`, et un contrôle qui lirait « reste < 0 »
 * pour en déduire la même chose en ferait une seconde rédaction.
 */
export const ISSUES = Object.freeze({
  REFUS: 'refus',
  EXACT: 'exact',
  PARTIEL: 'partiel',
  DEPASSEMENT: 'depassement'
});

/**
 * Ce que le règlement saisi fera au solde
 *
 * @param {Object} [entree]
 * @param {string|number} [entree.saisie] - Ce que la personne a tapé
 * @param {number} [entree.solde] - Le solde CUMULÉ, report inclus ; positif, la
 *   conjointe est débitrice
 * @param {Object} [entree.members] - Prénoms du foyer
 * @param {string} [entree.moi] - Emplacement du compte connecté
 * @returns {{issue: string, valide: boolean, phrase: string, montant: number,
 *   resteCentimes: number|null}}
 */
export function consequenceDuReglement(entree = {}) {
  const { saisie, solde, members, moi } = entree;

  // Les règles de saisie ne sont pas réécrites ici : `validateChargeAmount`
  // refuse déjà le vide, le non-nombre, le négatif, le zéro et le hors-borne,
  // et c'est elle que les trois formulaires appliquent. Une seconde rédaction
  // dirait « montant invalide » là où l'autre dit pourquoi.
  const verdict = validateChargeAmount(saisie);
  if (!verdict.valid) {
    return {
      issue: ISSUES.REFUS, valide: false, phrase: verdict.error,
      montant: NaN, resteCentimes: null
    };
  }

  // Un solde illisible n'est pas une saisie fautive : on ne peut simplement
  // rien promettre. Le dire plutôt que rendre « il restera NaN € ».
  if (!Number.isFinite(solde)) {
    return {
      issue: ISSUES.REFUS, valide: false,
      phrase: 'Le solde n\'est pas lisible — impossible de dire ce que ce versement changera.',
      montant: NaN, resteCentimes: null
    };
  }

  const montant = parseMontant(saisie);
  const resteCentimes = Math.round(Math.abs(solde) * 100) - Math.round(montant * 100);

  if (resteCentimes === 0) {
    return {
      issue: ISSUES.EXACT, valide: true,
      phrase: 'Le solde du mois reviendra à zéro.',
      montant, resteCentimes
    };
  }

  if (resteCentimes > 0) {
    return {
      issue: ISSUES.PARTIEL, valide: true,
      phrase: `Il restera ${formatCurrency(resteCentimes / 100)} à régler.`,
      montant, resteCentimes
    };
  }

  // Le solde a changé de sens. Son signe suit celui d'avant : verser dans le
  // sens d'un solde positif le fait descendre, donc passer négatif.
  const nouveauSolde = (Math.sign(solde) * resteCentimes) / 100;
  const debiteur = describeBalance(nouveauSolde, members).emplacementDebiteur;
  const excedent = formatCurrency(-resteCentimes / 100);

  const phrase = debiteur === normaliserEmplacement(moi)
    ? `Tu devras ${excedent} à ${memberLabel(emplacementOppose(debiteur), members)}.`
    : `${memberLabel(debiteur, members)} te devra ${excedent}.`;

  return { issue: ISSUES.DEPASSEMENT, valide: true, phrase, montant, resteCentimes };
}

/**
 * FairSplit — Le mois écoulé, en une page
 *
 * L'application calcule tout ce qu'il faut pour dire comment un mois s'est
 * passé : son total, l'écart au mois ordinaire, la catégorie qui a le plus
 * bougé, le taux d'effort, le reste à vivre, le solde et son règlement. Aucun
 * écran ne les réunissait. Il fallait ouvrir le bilan, puis les tendances,
 * puis les enveloppes, et faire la synthèse de tête.
 *
 * **Ce module ne calcule aucun chiffre d'argent nouveau.** Il compose ce que
 * `computeSummary` et `tendances.js` produisent déjà. C'est délibéré : chaque
 * fois qu'un second calcul a été écrit pour le même nombre dans ce dépôt, les
 * deux ont fini par diverger — `normalizePair`, `resolveShareMode`, la garde
 * du montant abîmé. Le bilan du mois est passé en paramètre, il n'est pas
 * refait ici.
 *
 * Chaque partie peut manquer, et le dit : sans trois mois révolus, il n'y a
 * pas de « mois ordinaire » auquel comparer ; sans revenus, pas de taux
 * d'effort. Une case absente vaut `null`, et l'écran l'omet plutôt que
 * d'afficher un tiret.
 *
 * Ce module ne fait que du calcul : aucune base, aucun DOM, aucun réseau.
 */

import { estSolo } from './perimetre.js';
import { mediane, tauxDEffort, resteAVivre, partDuFixe, categorieQuiABouge } from './tendances.js';

/** Une clé de mois */
const CLE_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Combien de mois révolus font un « mois ordinaire » */
const MOIS_POUR_UN_ORDINAIRE = 3;

/** Et jusqu'où on remonte pour l'établir */
const PROFONDEUR = 6;

/** En deçà, un solde est réglé — même garde que `settleBalance` */
const SOLDE_NEGLIGEABLE = 0.01;

/**
 * Les charges communes actives d'un mois, les deux collections réunies
 * @param {Object} periode
 * @returns {{fixes: Array<Object>, variables: Array<Object>}}
 */
function chargesDuMois(periode) {
  const retenir = (noeud) => (noeud && typeof noeud === 'object' ? Object.values(noeud) : [])
    .filter(charge => charge && !charge.deleted && !estSolo(charge));

  return {
    fixes: retenir(periode && periode.fixedCharges),
    variables: retenir(periode && periode.variableCharges)
  };
}

/** La somme des montants exploitables d'une liste */
function somme(charges) {
  return charges.reduce(
    (total, charge) => total + (Number.isFinite(charge.amount) ? charge.amount : 0), 0
  );
}

/**
 * Les totaux par catégorie d'un mois, comme `analyzeCategoriesData` les produit
 * @param {Object} periode
 * @returns {Object<string, number>}
 */
function parCategorie(periode) {
  const { fixes, variables } = chargesDuMois(periode);
  const totaux = {};

  for (const charge of [...fixes, ...variables]) {
    const nom = charge.category || 'Autre';
    totaux[nom] = (totaux[nom] || 0) + (Number.isFinite(charge.amount) ? charge.amount : 0);
  }

  return totaux;
}

/**
 * La période qui précède
 * @param {string} periode - AAAA-MM
 * @returns {string|null}
 */
function moisPrecedent(periode) {
  const lu = typeof periode === 'string' ? periode.match(CLE_MOIS) : null;
  if (!lu) return null;

  const total = Number(lu[1]) * 12 + (Number(lu[2]) - 1) - 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Le mois écoulé, prêt pour l'écran
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` complet
 * @param {string} params.mois - AAAA-MM, le mois dont on fait le rapport
 * @param {Object} params.bilan - Sortie de `computeSummary` pour ce mois
 * @param {Object} [params.salaries] - Instantané de revenus du mois
 * @returns {Object|null} `null` si le mois n'existe pas
 */
export function rapportDuMois({ periods, mois, bilan, salaries }) {
  if (!periods || typeof periods !== 'object') return null;
  if (!CLE_MOIS.test(mois || '')) return null;

  const periode = periods[mois];
  if (!periode || typeof periode !== 'object') return null;

  const { fixes, variables } = chargesDuMois(periode);
  const total = somme(fixes) + somme(variables);

  // Rien de saisi : un rapport sur un mois vide n'apprendrait rien, et
  // l'annoncer vaut mieux que d'aligner des zéros.
  if (total <= 0 && fixes.length === 0 && variables.length === 0) {
    return { mois, vide: true };
  }

  // Le mois ordinaire : la médiane des révolus qui précèdent, jamais la
  // moyenne — un mois exceptionnel la déplacerait, et c'est justement lui
  // qu'on cherche à situer.
  const precedents = Object.keys(periods)
    .filter(cle => CLE_MOIS.test(cle) && cle < mois)
    .sort()
    .slice(-PROFONDEUR)
    .map(cle => {
      const { fixes: f, variables: v } = chargesDuMois(periods[cle]);
      return somme(f) + somme(v);
    })
    .filter(valeur => valeur > 0);

  const ordinaire = precedents.length >= MOIS_POUR_UN_ORDINAIRE ? mediane(precedents) : null;

  const avant = moisPrecedent(mois);
  const bouge = avant && periods[avant]
    ? categorieQuiABouge(parCategorie(periode), parCategorie(periods[avant]))
    : null;

  const solde = bilan && Number.isFinite(bilan.balance) ? bilan.balance : null;

  return {
    mois,
    vide: false,
    total,
    nombre: fixes.length + variables.length,

    // Comparé à un mois ordinaire, quand il y en a un. `null` sinon : sans
    // trois mois révolus, « ordinaire » ne veut rien dire.
    ordinaire,
    ecart: ordinaire === null ? null : total - ordinaire,

    partFixe: partDuFixe(somme(fixes), somme(variables)),
    tauxDEffort: tauxDEffort(total, salaries),
    resteAVivre: resteAVivre(total, salaries),

    // La catégorie qui a le plus bougé, dans un sens ou dans l'autre — une
    // dépense qui disparaît est une variation, et souvent la plus parlante.
    categorieQuiABouge: bouge,
    comparee: bouge ? avant : null,

    solde,
    soldeRegle: solde === null ? null : Math.abs(solde) < SOLDE_NEGLIGEABLE
  };
}

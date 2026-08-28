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
import {
  ecartAuHabituel, tauxDEffort, resteAVivre, partDuFixe, categorieQuiABouge, totauxParCategorie
} from './tendances.js';

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
 * Où en est un mois par rapport au calendrier
 *
 * @param {string} mois - AAAA-MM rapporté
 * @param {string} [moisReel] - AAAA-MM du calendrier
 * @returns {'revolu'|'en-cours'|'a-venir'|null}
 */
function etatDuMois(mois, moisReel) {
  if (!CLE_MOIS.test(moisReel || '')) return null;
  if (mois === moisReel) return 'en-cours';
  return mois < moisReel ? 'revolu' : 'a-venir';
}

/**
 * Le mois écoulé, prêt pour l'écran
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` complet
 * @param {string} params.mois - AAAA-MM, le mois dont on fait le rapport
 * @param {Object} params.bilan - Sortie de `computeSummary` pour ce mois
 * @param {Object} [params.salaries] - Instantané de revenus du mois
 * @param {string} [params.moisReel] - AAAA-MM du calendrier, pour savoir si le
 *   mois rapporté est encore en cours
 * @returns {Object|null} `null` si le mois n'existe pas
 */
export function rapportDuMois({ periods, mois, bilan, salaries, moisReel }) {
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

  // Le mois ordinaire vient de `ecartAuHabituel`, LA MÊME FABRIQUE que le
  // panneau des tendances — et non d'une seconde médiane.
  //
  // L'en-tête de ce module promet qu'il ne calcule aucun chiffre d'argent
  // nouveau ; il refaisait pourtant celui-ci, sur une autre fenêtre. Mesuré sur
  // sept mois : « un mois ordinaire » valait 1 100 € dans les tendances et
  // 1 050 € dans le rapport, et l'écart au mois affiché 900 € contre 950 €.
  // Deux réponses à la même question, dans la même application, pour le même
  // mois — le défaut de `normalizePair` et de `resolveShareMode`, reproduit.
  //
  // La fenêtre est donc celle des tendances : les `PROFONDEUR` mois qui se
  // terminent par le mois affiché, dont `ecartAuHabituel` écarte le dernier
  // pour établir la référence.
  const fenetre = Object.keys(periods)
    .filter(cle => CLE_MOIS.test(cle) && cle <= mois)
    .sort()
    .slice(-PROFONDEUR)
    .map(cle => {
      const { fixes: f, variables: v } = chargesDuMois(periods[cle]);
      return somme(f) + somme(v);
    });

  // Le seuil reste celui de ce module : sans trois mois révolus, « ordinaire »
  // ne veut rien dire, et `ecartAuHabituel` se contenterait d'un seul.
  const revolus = fenetre.slice(0, -1).filter(valeur => valeur > 0);
  const habituel = revolus.length >= MOIS_POUR_UN_ORDINAIRE ? ecartAuHabituel(fenetre) : null;

  const ordinaire = habituel ? habituel.reference : null;

  const avant = moisPrecedent(mois);
  const bouge = avant && periods[avant]
    ? categorieQuiABouge(totauxParCategorie(periode), totauxParCategorie(periods[avant]))
    : null;

  const solde = bilan && Number.isFinite(bilan.balance) ? bilan.balance : null;

  return {
    mois,
    vide: false,
    total,
    nombre: fixes.length + variables.length,

    // Où en est le mois rapporté ? Trois états, et un seul autorise à
    // QUALIFIER l'écart :
    //
    //   - révolu   — il est complet, « 300 € de plus qu'un mois ordinaire »
    //                veut dire quelque chose ;
    //   - en cours — le 6, il pèse 1 050 € contre 2 000 € d'ordinaire, et
    //                l'écart de −950 € est celui des vingt-quatre jours qui
    //                restent, pas d'une économie. `trends.js` porte déjà cette
    //                réserve sur la même mesure : c'est sa formule qui est
    //                reprise, pas une seconde ;
    //   - à venir  — le sélecteur propose un mois d'avance, et la reconduction
    //                peut y avoir inscrit les charges fixes. Le comparer à un
    //                mois ordinaire annoncerait « 1 090 € de moins » pour un
    //                mois qui n'a pas commencé.
    //
    // Sans `moisReel`, on ne peut rien affirmer : `null`, et l'écran ne
    // qualifie rien plutôt que de supposer le mois clos.
    etat: etatDuMois(mois, moisReel),

    // Comparé à un mois ordinaire, quand il y en a un. `null` sinon : sans
    // trois mois révolus, « ordinaire » ne veut rien dire.
    ordinaire,
    ecart: habituel ? habituel.variation : null,

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

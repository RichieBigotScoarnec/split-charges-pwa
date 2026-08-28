/**
 * FairSplit — Ce qu'une charge fixe coûte à l'année
 *
 * Un loyer se lit par mois : c'est ainsi qu'il se paie. Un abonnement, non —
 * 9,99 € ne se remarquent jamais, 119,88 € se discutent. L'application
 * n'affichait que le mois, et le foyer n'avait donc aucun endroit où lire ce
 * que ses charges récurrentes lui coûtent sur une année. Sumeria en a fait un
 * de ses arguments, et c'est mérité : c'est le chiffre qui fait réagir.
 *
 * Deux lectures, et la seconde exige de l'histoire :
 *
 *   - **Le coût annuel**, qui se déduit du mois affiché seul. Toujours
 *     disponible, y compris le premier jour.
 *   - **Ce qui a augmenté** depuis l'an dernier, qui demande de retrouver la
 *     même charge douze mois plus tôt. Le module se tait tant qu'il ne l'a pas,
 *     comme les détecteurs de `anticipation.js`.
 *
 * Ce module ne fait que du calcul : aucune base, aucun DOM, aucun réseau.
 */

import { chargesCommunes, totalDesCharges } from './perimetre.js';
import { plier } from './recherche-texte.js';

/** Une clé de mois */
const CLE_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Les mois d'une année — l'unité dans laquelle on veut lire le total */
const MOIS_PAR_AN = 12;

/**
 * En deçà, une hausse n'en est pas une
 *
 * Un centime d'écart vient d'un arrondi de facture, pas d'une augmentation.
 * Le signaler ferait du bruit là où l'on veut un signal.
 */
const HAUSSE_MINIMALE = 0.5;

/**
 * Ce que les charges fixes du mois coûtent, au mois et à l'année
 *
 * Les dépenses solo sont écartées : elles n'engagent pas le foyer, et les
 * verser dans un total commun contredirait le bilan.
 *
 * @param {Array<Object>} fixedCharges - Charges fixes du mois affiché
 * @returns {{parMois: number, parAn: number, nombre: number}}
 */
export function coutDesChargesFixes(fixedCharges) {
  const actives = chargesCommunes(Array.isArray(fixedCharges) ? fixedCharges : [])
    .filter(charge => charge && !charge.deleted);

  const parMois = totalDesCharges(actives);

  return { parMois, parAn: parMois * MOIS_PAR_AN, nombre: actives.length };
}

/**
 * La même période, un an plus tôt
 * @param {string} periode - AAAA-MM
 * @returns {string|null}
 */
function memeMoisLAnDernier(periode) {
  const lu = typeof periode === 'string' ? periode.match(CLE_MOIS) : null;
  return lu ? `${Number(lu[1]) - 1}-${lu[2]}` : null;
}

/**
 * Les charges fixes communes d'un mois, indexées par libellé plié
 * @param {Object} periode - Nœud d'une période
 * @returns {Map<string, {description: string, amount: number}>}
 */
function chargesParLibelle(periode) {
  const index = new Map();
  const noeud = periode && periode.fixedCharges;
  if (!noeud || typeof noeud !== 'object') return index;

  for (const charge of chargesCommunes(Object.values(noeud))) {
    if (!charge || charge.deleted) continue;
    if (!Number.isFinite(charge.amount)) continue;

    const cle = plier(typeof charge.description === 'string' ? charge.description.trim() : '');
    if (!cle) continue;

    // Le même libellé deux fois dans un mois : on somme, comme le total le fait.
    const vu = index.get(cle);
    if (vu) vu.amount += charge.amount;
    else index.set(cle, { description: charge.description.trim(), amount: charge.amount });
  }

  return index;
}

/**
 * Quelles charges fixes ont augmenté depuis l'an dernier ?
 *
 * La comparaison porte sur le MÊME MOIS de l'année précédente, et non sur le
 * mois précédent : une charge fixe ne bouge pas d'un mois sur l'autre, et la
 * comparer à son voisin ne dirait rien. Douze mois plus tôt, l'écart est celui
 * d'une révision annuelle — loyer indexé, assurance, abonnement réévalué.
 *
 * Le module se tait si le mois d'il y a un an est absent : on ne compare pas à
 * ce qu'on n'a pas.
 *
 * @param {Object} params
 * @param {Object} params.periods - Nœud `periods` complet
 * @param {string} params.moisCourant - AAAA-MM
 * @returns {{lignes: Array<Object>, ecartMensuel: number, compare: string}|null}
 */
export function haussesDepuisLAnDernier({ periods, moisCourant }) {
  if (!periods || typeof periods !== 'object') return null;
  if (!CLE_MOIS.test(moisCourant || '')) return null;

  const anDernier = memeMoisLAnDernier(moisCourant);
  if (!anDernier || !periods[anDernier]) return null;

  const avant = chargesParLibelle(periods[anDernier]);
  const maintenant = chargesParLibelle(periods[moisCourant]);
  if (avant.size === 0 || maintenant.size === 0) return null;

  const lignes = [];
  let ecartMensuel = 0;

  for (const [cle, actuelle] of maintenant) {
    const passee = avant.get(cle);
    // Une charge qui n'existait pas l'an dernier n'a pas augmenté : elle est
    // apparue. Les confondre gonflerait la hausse d'un déménagement entier.
    if (!passee) continue;

    const ecart = actuelle.amount - passee.amount;
    if (ecart < HAUSSE_MINIMALE) continue;

    lignes.push({
      description: actuelle.description,
      avant: passee.amount,
      apres: actuelle.amount,
      ecart
    });
    ecartMensuel += ecart;
  }

  if (lignes.length === 0) return null;

  // La plus forte hausse d'abord : c'est celle sur laquelle on peut agir.
  lignes.sort((a, b) => b.ecart - a.ecart);

  return { lignes, ecartMensuel, compare: anDernier };
}

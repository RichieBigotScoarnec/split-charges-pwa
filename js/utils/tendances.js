/**
 * FairSplit — Ce que six mois de dépenses ont à dire
 *
 * Le panneau affichait quatre chiffres : moyenne, minimum, maximum, tendance.
 * Deux d'entre eux étaient fragiles, et les quatre répondaient à « quel est le
 * plus gros mois ? » plutôt qu'à « est-ce qu'on s'en sort ? ».
 *
 * La tendance comparait le premier mois au dernier, et rien entre les deux :
 *
 *   const trend = totals[totals.length - 1] - totals[0];
 *
 * Sur 380 → 512 → 445 → 1 260, elle annonçait +231 % en ignorant la moitié des
 * points. Un seul mois exceptionnel devenait « la tendance ».
 *
 * La moyenne, elle, se fait tirer par les extrêmes : 649,59 € quand trois mois
 * sur quatre tiennent entre 380 et 512 — un mois qui n'a jamais existé.
 *
 * Ce module ne fait que du calcul : aucune base, aucun DOM.
 */

import { resolveIncomeBase } from './salaries.js';
import { estSolo } from './perimetre.js';

/** En deçà d'un centime, une variation n'en est pas une */
export const SEUIL_VARIATION = 0.01;

/**
 * Ne retient que les nombres exploitables
 *
 * Une charge héritée peut ne porter aucun montant : `Math.min` d'un tableau
 * contenant `undefined` rend NaN, qui se propage ensuite dans tout le panneau.
 *
 * @param {*} valeurs
 * @returns {Array<number>}
 */
function nombres(valeurs) {
  return (Array.isArray(valeurs) ? valeurs : []).filter(Number.isFinite);
}

/**
 * La médiane, c'est-à-dire ce que coûte un mois ordinaire
 *
 * Contrairement à la moyenne, un mois exceptionnel ne la déplace presque pas.
 * L'écart entre les deux dit à lui seul s'il y a eu un coup dur.
 *
 * @param {Array<number>} totaux - Total de chaque mois
 * @returns {number|null} null si rien n'est exploitable
 */
export function mediane(totaux) {
  const tries = nombres(totaux).slice().sort((a, b) => a - b);
  if (tries.length === 0) return null;

  const milieu = Math.floor(tries.length / 2);

  return tries.length % 2 === 0
    ? (tries[milieu - 1] + tries[milieu]) / 2
    : tries[milieu];
}

/**
 * La moyenne des totaux
 *
 * @param {Array<number>} totaux
 * @returns {number|null}
 */
export function moyenne(totaux) {
  const utiles = nombres(totaux);
  if (utiles.length === 0) return null;
  return utiles.reduce((somme, valeur) => somme + valeur, 0) / utiles.length;
}

/**
 * De combien le dernier mois s'écarte d'un mois habituel
 *
 * La référence est la **médiane des mois précédents**, et non le premier
 * d'entre eux : un mois de départ atypique faussait tout le verdict, et deux
 * points ne font pas une tendance.
 *
 * @param {Array<number>} totaux - Totaux par mois, du plus ancien au plus récent
 * @returns {{variation: number, part: number|null, reference: number, dernier: number}|null}
 */
export function ecartAuHabituel(totaux) {
  const utiles = nombres(totaux);
  if (utiles.length < 2) return null;

  const dernier = utiles[utiles.length - 1];
  const reference = mediane(utiles.slice(0, -1));
  const variation = dernier - reference;

  return {
    variation,
    // Sans référence positive, un pourcentage n'a pas de sens : un mois à zéro
    // suivi d'un mois à 400 € n'est pas « +∞ % ».
    part: reference > 0 ? (variation / reference) * 100 : null,
    reference,
    dernier
  };
}

/** Une clé de mois */
const CLE_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Jusqu'où on remonte pour établir ce que coûte un mois ordinaire */
export const PROFONDEUR_ORDINAIRE = 6;

/** Et combien de mois où il s'est passé quelque chose il en faut */
export const MOIS_POUR_UN_ORDINAIRE = 3;

/**
 * Le total des charges COMMUNES d'un mois
 *
 * Le même entonnoir que `totauxParCategorie`, sans le rangement : ni les
 * charges à la corbeille, ni les dépenses solo — celles-ci n'ont jamais pesé
 * sur ce que le FOYER dépense.
 *
 * @param {Object} periode - Contenu d'une période, tel que lu en base
 * @returns {number}
 */
export function totalCommunDuMois(periode) {
  let total = 0;

  for (const collection of ['fixedCharges', 'variableCharges']) {
    const noeud = periode && periode[collection];
    if (!noeud || typeof noeud !== 'object') continue;

    for (const charge of Object.values(noeud)) {
      if (!charge || charge.deleted || estSolo(charge)) continue;
      total += Number.isFinite(charge.amount) ? charge.amount : 0;
    }
  }

  return total;
}

/**
 * Ce que coûte un mois ordinaire, vu depuis un mois donné
 *
 * **Cette fabrique est la seule, et elle referme un écart mesuré.** Trois
 * surfaces annonçaient « un mois ordinaire » : le panneau des tendances et le
 * rapport mensuel par `ecartAuHabituel` sur les cinq mois qui précèdent, et la
 * carte « à ce rythme » par une seconde médiane, sur SIX mois dont elle
 * écartait ceux à zéro. Mesuré sur 600 · 700 · 800 · 900 · 1 000 · 1 100 ·
 * 1 200 : **950,00 € sur le bilan, 1 000,00 € dans la modale du rapport**, même
 * mois, même application, même phrase. Huitième occurrence du défaut
 * `normalizePair`, et la seule qui restait ouverte.
 *
 * La fenêtre retenue est celle des tendances, parce que c'est elle que deux
 * écrans sur trois lisaient déjà : les mois qui précèdent immédiatement, jamais
 * celui qu'on regarde — un mois en cours est incomplet, et le comparer à
 * lui-même n'apprend rien.
 *
 * **Un mois à zéro reste un mois.** Il entre dans la médiane : l'écarter
 * ferait passer un foyer qui a vraiment peu dépensé pour un foyer sans
 * historique. Il ne compte simplement pas dans le SEUIL, qui demande trois mois
 * où il s'est passé quelque chose — sans quoi « ordinaire » ne veut rien dire.
 *
 * @param {Object} params
 * @param {Object} params.periods - Instantané de l'historique
 * @param {string} params.mois - AAAA-MM, le mois d'où l'on regarde
 * @returns {{reference: number, dernier: number, variation: number,
 *   part: number|null, moisCompares: number}|null}
 */
export function moisOrdinaire({ periods, mois }) {
  if (!CLE_MOIS.test(mois || '')) return null;

  const source = periods && typeof periods === 'object' ? periods : {};

  const precedents = Object.keys(source)
    .filter(cle => CLE_MOIS.test(cle) && cle < mois)
    .sort()
    .slice(-(PROFONDEUR_ORDINAIRE - 1))
    .map(cle => totalCommunDuMois(source[cle]));

  if (precedents.filter(total => total > 0).length < MOIS_POUR_UN_ORDINAIRE) return null;

  const reference = mediane(precedents);
  if (!(reference > 0)) return null;

  const dernier = totalCommunDuMois(source[mois]);
  const variation = dernier - reference;

  return {
    reference,
    dernier,
    variation,
    part: (variation / reference) * 100,
    moisCompares: precedents.length
  };
}

/**
 * La part des revenus que les charges consomment
 *
 * C'est la seule mesure qui donne un sens au montant : « 1 260 € » ne dit rien,
 * « 29 % de vos revenus » dit tout. Un foyer à 35 % et un foyer à 70 % ne
 * vivent pas la même vie, et le total ne permet pas de les distinguer.
 *
 * L'assiette est celle du prorata — salaires et revenus complémentaires — pour
 * que le taux se lise avec la répartition affichée juste au-dessus.
 *
 * @param {number} charges - Total des charges du mois
 * @param {*} revenus - Instantané de salaires de la période
 * @returns {number|null} Pourcentage, ou null si les revenus sont inconnus
 */
export function tauxDEffort(charges, revenus) {
  const base = resolveIncomeBase(revenus);
  if (!(base.total > 0) || !Number.isFinite(charges)) return null;
  return (charges / base.total) * 100;
}

/**
 * Ce qui reste une fois les charges payées
 *
 * @param {number} charges - Total des charges du mois
 * @param {*} revenus - Instantané de salaires de la période
 * @returns {number|null} En euros, négatif si les charges dépassent
 */
export function resteAVivre(charges, revenus) {
  const base = resolveIncomeBase(revenus);
  if (!(base.total > 0) || !Number.isFinite(charges)) return null;
  return base.total - charges;
}

/**
 * La part des charges fixes dans le total
 *
 * Information structurelle plutôt que conjoncturelle : un foyer à 80 % de fixe
 * n'a aucune marge de manœuvre, à 40 % il peut ajuster. Le graphe trace déjà
 * les deux courbes sans jamais énoncer leur rapport.
 *
 * @param {number} fixes
 * @param {number} variables
 * @returns {number|null} Pourcentage
 */
export function partDuFixe(fixes, variables) {
  if (!Number.isFinite(fixes) || !Number.isFinite(variables)) return null;
  const total = fixes + variables;
  if (!(total > 0)) return null;
  return (fixes / total) * 100;
}

/**
 * La catégorie dont la dépense a le plus varié d'un mois à l'autre
 *
 * « Courses : +85 € » désigne quoi regarder ; « total +231 % » ne désigne rien.
 *
 * Une catégorie absente d'un des deux mois compte pour zéro de ce côté : une
 * dépense qui apparaît est une variation, et c'en est même souvent la plus
 * parlante.
 *
 * @param {Object<string, number>} dernier - Totaux par catégorie du mois récent
 * @param {Object<string, number>} precedent - Totaux par catégorie du mois d'avant
 * @returns {{categorie: string, variation: number}|null}
 */
/**
 * Le seau d'une charge sans catégorie
 *
 * « Autre » ne convient pas : c'est une catégorie RÉELLE du foyer
 * (`config.js`), et l'y verser confondrait ce qu'il a rangé là avec ce qu'il
 * n'a rangé nulle part.
 */
export const SANS_CATEGORIE = 'Sans catégorie';

/**
 * Répartit les charges communes d'une période par catégorie
 *
 * Fixes et variables confondues : c'est la dépense qui compte, pas la forme
 * sous laquelle elle est saisie. Les dépenses solo sont écartées — « la
 * catégorie qui a le plus bougé » est une observation sur le FOYER.
 *
 * **Cette fabrique est la seule.** Le panneau des tendances et le rapport
 * mensuel posent la même question au même `categorieQuiABouge` ; deux
 * agrégations séparées y répondaient sur des seaux différents — l'une rangeait
 * les charges sans catégorie sous « Autre », l'autre sous « Sans catégorie » —
 * et les deux écrans pouvaient nommer deux catégories différentes pour le même
 * mois. C'est exactement le défaut de `normalizePair` et de `resolveShareMode`,
 * et il se referme de la même façon : une seule fonction.
 *
 * @param {Object} periode - Contenu d'une période, tel que lu en base
 * @returns {Object<string, number>} Total par libellé de catégorie
 */
export function totauxParCategorie(periode) {
  const totaux = {};

  for (const collection of ['fixedCharges', 'variableCharges']) {
    const noeud = periode && periode[collection];
    if (!noeud || typeof noeud !== 'object') continue;

    for (const charge of Object.values(noeud)) {
      if (!charge || charge.deleted || estSolo(charge)) continue;

      const categorie = typeof charge.category === 'string' && charge.category
        ? charge.category
        : SANS_CATEGORIE;
      const montant = Number.isFinite(charge.amount) ? charge.amount : 0;

      totaux[categorie] = (totaux[categorie] || 0) + montant;
    }
  }

  return totaux;
}

export function categorieQuiABouge(dernier, precedent) {
  const lire = source => (source && typeof source === 'object' ? source : {});

  const recent = lire(dernier);
  const ancien = lire(precedent);

  const categories = new Set([...Object.keys(recent), ...Object.keys(ancien)]);

  let gagnante = null;

  for (const categorie of categories) {
    const apres = Number.isFinite(recent[categorie]) ? recent[categorie] : 0;
    const avant = Number.isFinite(ancien[categorie]) ? ancien[categorie] : 0;
    const variation = apres - avant;

    if (Math.abs(variation) < SEUIL_VARIATION) continue;
    if (gagnante && Math.abs(variation) <= Math.abs(gagnante.variation)) continue;

    gagnante = { categorie, variation };
  }

  return gagnante;
}

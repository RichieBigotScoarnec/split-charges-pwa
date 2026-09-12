/**
 * FairSplit — Un budget qu'on corrige plutôt qu'un budget qu'on invente
 *
 * L'éditeur de budgets listait les DIX-NEUF catégories du foyer par ordre
 * alphabétique — « Autre, Bar, Boulangerie, Bricolage, Café, Coiffeur,
 * Courses, Culture, Essence, Jardin… » — chacune avec un champ vide. Le foyer
 * n'en avait dépensé que sur sept. Il fallait donc parcourir dix-neuf lignes,
 * en reconnaître sept, et INVENTER un nombre pour chacune.
 *
 * C'est la règle que ce dépôt s'est donnée, enfreinte de la façon la plus
 * coûteuse : ne pas demander ce que l'application peut calculer. Elle connaît
 * la médiane de chaque catégorie sur tout l'historique qu'elle porte déjà.
 * Un budget proposé se corrige d'un geste ; un budget à inventer se remet à
 * plus tard, indéfiniment — et tant qu'aucun budget n'existe, `veille.js`,
 * `rythmeDuBudget` et la moitié des cartes d'anticipation n'ont rien à
 * surveiller. Une fonctionnalité entière restait dormante par friction
 * d'amorçage.
 *
 * ## Pourquoi la médiane, et pourquoi les mois RÉVOLUS
 *
 * La médiane parce qu'un mois exceptionnel ne doit pas fixer le budget des
 * suivants — c'est déjà le choix que fait `tendances.js` pour dire ce que
 * coûte un mois ordinaire, et il n'y a aucune raison d'en faire un autre ici.
 *
 * Les mois révolus seulement, parce que le mois en cours est incomplet : le 3
 * du mois, il proposerait un budget « Courses » de 40 €. Le module ne calcule
 * rien de neuf : il compose `totauxParCategorie` et `mediane`, les fabriques
 * dont vivent déjà les tendances et le rapport.
 */

import { totauxParCategorie, mediane } from './tendances.js';

/**
 * Le nombre de mois révolus en deçà duquel on ne propose rien
 *
 * Un seul mois observé n'est pas une habitude, c'est une occurrence : la
 * proposition serait un chiffre pris au hasard présenté comme un conseil.
 * Deux mois suffisent à ce que la médiane veuille dire quelque chose — c'est
 * le même seuil que `memoire-libelle.js` retient pour parler d'habitude.
 */
export const MOIS_MINIMUM = 2;

/**
 * Ce que chaque catégorie coûte un mois ordinaire
 *
 * @param {Object|null} periods - Nœud `periods` (mois → données)
 * @param {string} moisCourant - Le mois affiché, exclu car incomplet
 * @returns {Object<string, number>} Catégorie → médiane, arrondie à l'euro.
 *   Vide si l'historique révolu n'atteint pas `MOIS_MINIMUM`.
 */
export function budgetsProposes(periods, moisCourant) {
  if (!periods || typeof periods !== 'object') return {};

  const revolus = Object.keys(periods)
    .filter(mois => /^\d{4}-\d{2}$/.test(mois) && mois < String(moisCourant || ''))
    .sort();

  if (revolus.length < MOIS_MINIMUM) return {};

  // Un mois où la catégorie n'apparaît pas compte pour zéro, et non pour
  // « absent » : une catégorie dépensée un mois sur trois a bien une médiane
  // basse, c'est l'information utile. Sans ce zéro, une dépense annuelle
  // proposerait son montant entier comme budget MENSUEL.
  const parMois = revolus.map(mois => totauxParCategorie(periods[mois]));
  const categories = new Set(parMois.flatMap(totaux => Object.keys(totaux)));

  const proposes = {};
  for (const categorie of categories) {
    const valeur = mediane(parMois.map(totaux => totaux[categorie] || 0));
    // Une médiane nulle ne se propose pas : « budget de 0 € » et « pas de
    // budget » ne se disent pas de la même façon à l'écran, et l'éditeur
    // traite déjà le second par un champ vide.
    if (valeur !== null && valeur > 0) proposes[categorie] = Math.round(valeur);
  }

  return proposes;
}

/**
 * L'ordre dans lequel les catégories méritent d'être présentées
 *
 * Par dépense décroissante du mois affiché, puis par proposition décroissante,
 * puis par ordre alphabétique. Une catégorie sur laquelle rien n'a jamais été
 * dépensé ne peut pas être au-dessus de « Courses », quel que soit son rang
 * dans l'alphabet.
 *
 * @param {Array<string>} categories - Tous les libellés connus
 * @param {Object<string, number>} depenses - Dépense du mois affiché
 * @param {Object<string, number>} proposes - Médiane par catégorie
 * @param {Object<string, number>} budgets - Budgets déjà fixés
 * @returns {{utilisees: Array<string>, dormantes: Array<string>}}
 *   `utilisees` : celles qui portent une dépense, une proposition ou un budget.
 *   `dormantes` : les autres, que l'éditeur replie.
 */
export function ordonnerCategories(categories, depenses, proposes, budgets) {
  const liste = [...new Set(categories)].filter(Boolean);
  const poids = (nom) => (depenses[nom] || 0);

  const parle = (nom) => Boolean(depenses[nom] || proposes[nom] || budgets[nom]);

  const trier = (a, b) => (poids(b) - poids(a))
    || ((proposes[b] || 0) - (proposes[a] || 0))
    || a.localeCompare(b, 'fr');

  return {
    utilisees: liste.filter(parle).sort(trier),
    dormantes: liste.filter(nom => !parle(nom)).sort((a, b) => a.localeCompare(b, 'fr'))
  };
}

import { dateDeLaCharge, dateDuJour, heureDeLaCharge } from './date.js';
import { totauxParPerimetre } from './perimetre.js';

/**
 * L'ordre d'affichage des listes
 *
 * Rien n'était trié. Ni les charges fixes, ni les variables, ni les
 * remboursements : les entrées sortaient dans l'ordre où Firebase rend les
 * clés, c'est-à-dire l'ordre de création. Une dépense du 3, saisie après une du
 * 20, s'affichait après elle.
 *
 * Le défaut ne se voyait pas tant qu'aucune date n'était affichée : sans repère
 * temporel, un ordre arbitraire ressemble à un ordre. Il devient visible le jour
 * où les dates apparaissent — c'est-à-dire maintenant.
 *
 * Ces fonctions sont pures : elles ne trient que ce qu'on leur donne, et rendent
 * un tableau neuf plutôt que de réordonner celui du state.
 */

/**
 * Le jour d'une entrée, sous une forme comparable
 *
 * Les dates déclarées sont des chaînes AAAA-MM-JJ, qui se comparent
 * lexicographiquement dans le bon ordre. Les entrées anciennes n'ont qu'un
 * horodatage : on en tire le jour local, pour que les deux se comparent entre
 * elles sans passer par des unités différentes.
 *
 * @param {Object} entree - Charge ou remboursement
 * @returns {string} AAAA-MM-JJ, ou chaîne vide si l'entrée n'apprend rien
 */
export function jourDeTri(entree) {
  const valeur = dateDeLaCharge(entree);
  if (typeof valeur === 'string') return valeur;
  if (typeof valeur === 'number') return dateDuJour(new Date(valeur));
  return '';
}

/**
 * Compare deux entrées, la plus récente d'abord
 *
 * Le jour prime ; à jour égal, l'heure déclarée départage, puis l'ordre de
 * saisie — la dernière écrite en tête, c'est celle qu'on vient d'ajouter et
 * qu'on veut vérifier.
 *
 * Une entrée sans heure passe après celles qui en portent, à jour égal. Ce
 * n'est pas un jugement sur son ancienneté : c'est qu'elle ne peut pas
 * s'intercaler entre deux heures sans qu'on invente laquelle. La reléguer
 * laisse la suite des heures lisible, et le repli sur l'ordre de saisie garde
 * son sens entre elles.
 *
 * Une entrée sans repère temporel passe en dernier plutôt que de se glisser
 * n'importe où : elle n'a pas de place légitime dans une suite chronologique,
 * et la reléguer le dit. Aucun test n'est nécessaire pour l'obtenir — la chaîne
 * vide précède toute date dans l'ordre lexicographique, donc l'ordre décroissant
 * la rejette en queue d'elle-même. J'avais d'abord écrit deux gardes explicites
 * pour ce cas ; les retirer ne changeait aucun résultat, ce qui est la
 * définition d'un code que rien n'exerce. Le comportement reste garanti par
 * `tests/utils/tri.test.js`, qui le vérifie sans se soucier du moyen.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
export function plusRecenteDAbord(a, b) {
  const jourA = jourDeTri(a);
  const jourB = jourDeTri(b);

  if (jourA !== jourB) return jourA < jourB ? 1 : -1;

  // HH:MM se compare lexicographiquement dans le bon ordre, les deux membres
  // étant sur deux chiffres. Le vide précède toute heure, donc l'ordre
  // décroissant range les entrées sans heure en queue de leur journée.
  const heureA = heureDeLaCharge(a);
  const heureB = heureDeLaCharge(b);
  if (heureA !== heureB) return heureA < heureB ? 1 : -1;

  const tsA = Number.isFinite(a && a.timestamp) ? a.timestamp : 0;
  const tsB = Number.isFinite(b && b.timestamp) ? b.timestamp : 0;
  return tsB - tsA;
}

/**
 * Trie une liste, la plus récente d'abord
 *
 * @param {Array<Object>} entrees
 * @returns {Array<Object>} Un tableau neuf, trié
 */
export function trierParDate(entrees) {
  return [...(Array.isArray(entrees) ? entrees : [])].sort(plusRecenteDAbord);
}

/**
 * Regroupe des charges par catégorie, la plus dépensière en tête
 *
 * L'ordre des catégories suivait celui de la première charge rencontrée, ce qui
 * ne veut rien dire. Le total, lui, répond à la question qu'on se pose en
 * ouvrant l'écran : où part l'argent ?
 *
 * ─────────────────────────────────────────────────────────────────────
 * LE TOTAL DE CATÉGORIE INCLUAIT LE PERSONNEL SANS LE DIRE (lot P2)
 *
 * Mesuré à la main sur septembre 2026 :
 * `122,07 + 20,64 + 20,00 + 25,00 + 80,18 + 10,00 + 103,86 = 381,75` pour
 * « Courses », dont **10,00 de personnel**. Le pied de liste, lui, savait déjà
 * dire `commun + X perso` — mais il le disait pour la liste entière, et
 * `grouperParCategorie` ne portait AUCUNE notion de périmètre : zéro occurrence
 * de `solo` ou `commun` dans ce fichier. La distinction était donc appliquée à
 * une surface sur deux, et `totaux-liste.js` la recalculait PAR-DESSUS.
 *
 * Elle porte désormais là où le groupement vit. Un total de catégorie qui DIT
 * sa part personnelle cesse de prétendre être un chiffre du foyer — et c'est ce
 * qui rend lisible l'asymétrie que P1b a installée : depuis que le personnel
 * vit derrière un mur, les deux comptes ne voient pas les mêmes chiffres sur
 * toute surface qui le compte.
 *
 * **`total` reste la somme des deux, et c'est délibéré** : c'est lui qui porte
 * le tri « la plus dépensière en tête », et une catégorie ne descend pas dans
 * la liste parce que sa dépense est personnelle. L'ajout est ADDITIF — aucun
 * des trois appelants ne casse.
 *
 * @param {Array<Object>} charges
 * @returns {Array<{categorie: string, charges: Array<Object>,
 *   total: number, commun: number, solo: number}>}
 */
export function grouperParCategorie(charges) {
  const groupes = new Map();

  for (const charge of (Array.isArray(charges) ? charges : [])) {
    if (!charge) continue;
    const categorie = charge.category || 'Sans catégorie';
    if (!groupes.has(categorie)) {
      groupes.set(categorie, { categorie, charges: [] });
    }
    groupes.get(categorie).charges.push(charge);
  }

  return [...groupes.values()]
    .map(groupe => {
      // Le couple vient de la fabrique unique du dépôt, jamais d'une somme
      // écrite ici : `totauxParPerimetre` porte déjà la garde du montant
      // illisible — `somme + undefined` donne `NaN`, et `NaN` se propage
      // jusqu'à l'écran — et le filtre des supprimées.
      const { commun, solo, total } = totauxParPerimetre(groupe.charges);
      return { ...groupe, charges: trierParDate(groupe.charges), total, commun, solo };
    })
    .sort((a, b) => b.total - a.total);
}

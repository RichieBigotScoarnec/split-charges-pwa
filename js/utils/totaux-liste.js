/**
 * FairSplit — Les totaux d'une liste de charges, et ce qu'ils comptent
 *
 * ## Pourquoi ce fichier existe
 *
 * `variable-charges.js` et `fixed-charges.js` portaient chacun une copie
 * mot pour mot de `afficherTotal`. Deux copies d'une règle d'argent, c'est le
 * défaut que ce dépôt paie le plus cher — `normalizePair`, `resolveShareMode`,
 * `ecartAuHabituel` : à chaque fois, deux lectures du même chiffre qui
 * finissent par diverger sans que rien ne le dise.
 *
 * Et il y avait un troisième lecteur, qui n'affichait pas le même chiffre :
 * **la recherche**. Elle masquait les lignes par `style.display` sans jamais
 * toucher aux totaux. Mesuré avant correction : chercher « intermarche »
 * laissait trois lignes valant 294,32 € sous un total resté à 464,32 €, et
 * l'en-tête « Courses » affichait lui aussi le total du mois entier. La
 * question la plus naturelle qu'on pose à une recherche de dépenses — combien
 * je dépense chez cette enseigne — recevait donc une réponse fausse de 170 €,
 * affichée avec le même aplomb qu'une réponse juste.
 *
 * Les trois lecteurs passent désormais par ici.
 *
 * ## Ce que le total compte
 *
 * `totauxParPerimetre` écarte les dépenses solo du total commun : une charge
 * qui ne pèse pas sur le solde du couple n'a pas à grossir le total qu'on lit
 * au-dessus du bilan. Le perso est nommé à part, et seulement s'il existe —
 * sans quoi tous les mois déjà en base changeraient d'apparence.
 */

import { formatCurrency } from './format.js';
import { totauxParPerimetre } from './perimetre.js';
import { grouperParCategorie } from './tri.js';

/**
 * Le pied de liste : le total commun, et le perso seulement s'il existe
 *
 * `textContent` et non `innerHTML` : la politique de sécurité du dépôt plafonne
 * les sites d'injection, et un total n'a aucune raison d'en ouvrir un de plus.
 *
 * @param {HTMLElement|null} element - Le `<span>` du total
 * @param {Array<Object>} charges - Les charges réellement affichées
 */
export function afficherTotalDeListe(element, charges) {
  if (!element) return;
  const { commun, solo } = totauxParPerimetre(Array.isArray(charges) ? charges : []);
  element.textContent = solo > 0
    ? `${formatCurrency(commun)} + ${formatCurrency(solo)} perso`
    : formatCurrency(commun);
}

/**
 * Accorde les sous-totaux de catégorie aux charges réellement affichées
 *
 * Chaque bloc `.charge-category` porte le libellé de sa catégorie en
 * `data-categorie` — posé au rendu, plutôt que relu depuis l'en-tête, qui
 * mêle l'emoji, le nom et le montant dans le même nœud de texte.
 *
 * Une catégorie dont plus aucune charge n'est affichée retombe à zéro plutôt
 * que de garder son ancien montant : pendant une recherche, `hideEmptyCategories`
 * la masque de toute façon, mais un bloc laissé avec un total périmé
 * réapparaîtrait faux au premier caractère effacé.
 *
 * @param {HTMLElement|null} listeElement - Le conteneur de la liste
 * @param {Array<Object>} charges - Les charges réellement affichées
 */
export function accorderLesSousTotaux(listeElement, charges) {
  if (!listeElement) return;

  const totaux = new Map(
    grouperParCategorie(Array.isArray(charges) ? charges : [])
      .map(groupe => [groupe.categorie, groupe.total])
  );

  for (const bloc of listeElement.querySelectorAll('.charge-category')) {
    const span = bloc.querySelector('.category-total');
    if (!span) continue;
    span.textContent = formatCurrency(totaux.get(bloc.dataset.categorie) || 0);
  }
}

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
 * UNE SEULE FAÇON DE DIRE UN TOTAL QUI PORTE DU PERSONNEL
 *
 * Cette formulation vivait en clair dans `afficherTotalDeListe`, et c'était
 * juste tant que le pied de liste était le seul à la prononcer. Le lot P2 lui
 * donne un second lecteur — l'en-tête de catégorie, qui doit dire sa part
 * personnelle de la même façon. Deux rédactions du même chiffre divergent au
 * premier correctif, et le symptôme serait deux manières de dire la même chose
 * à deux lignes de distance.
 *
 * Le volet personnel ne paraît QUE s'il existe : sans quoi tous les mois déjà
 * en base changeraient d'apparence, et une mention systématique ferait du bruit
 * sur la majorité des lignes.
 *
 * @param {{commun: number, solo: number}} totaux
 * @returns {string}
 */
export function libelleDuTotal({ commun, solo }) {
  return solo > 0
    ? `${formatCurrency(commun)} + ${formatCurrency(solo)} perso`
    : formatCurrency(commun);
}

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
  element.textContent = libelleDuTotal(
    totauxParPerimetre(Array.isArray(charges) ? charges : [])
  );
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
      .map(groupe => [groupe.categorie, groupe])
  );

  for (const bloc of listeElement.querySelectorAll('.charge-category')) {
    const span = bloc.querySelector('.category-total');
    if (!span) continue;
    // Le couple que le groupement rend, et la formulation du pied : c'est le
    // MÊME chiffre dit de la même façon, au rendu comme sous une recherche.
    span.textContent = libelleDuTotal(
      totaux.get(bloc.dataset.categorie) || { commun: 0, solo: 0 }
    );
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RENVOI : OÙ SONT PARTIES LES DÉPENSES QUE LA PORTÉE VIENT DE RETIRER
 *
 * Avant le lot P2, « À deux » montrait le commun ET le personnel : rien à
 * chercher, tout était là. Filtrer répare la commande, et crée le défaut
 * qu'aucun filtre ne peut éviter — **une dépense saisie devient
 * introuvable**. On la saisit, on coche « perso », elle disparaît de l'écran
 * où on vient de la voir, et rien ne dit où elle est allée.
 *
 * Le renvoi est ce qui referme ça. Il ne se contente pas d'annoncer un chiffre
 * comme le pied : il NOMME sa destination, et le nom vient de
 * `utils/portee.js` — celui du segment, pour qu'on puisse le chercher à
 * l'écran.
 *
 * ## Il corrige aussi une affirmation FAUSSE
 *
 * Un mois qui ne porte que du personnel affichait « Aucune charge variable
 * pour cette période » sous « À deux ». C'est faux — il y en a, elles sont
 * ailleurs — et c'est le seul endroit où le renvoi ne complète pas l'écran
 * mais le corrige. La propriété à tenir : **l'écran ne prétend jamais qu'un
 * mois est vide quand il ne l'est pas.** Il dit qu'il n'y a rien de COMMUN, et
 * dit où sont les autres.
 *
 * ## `textContent`, et un BOUTON NU
 *
 * Pas d'`aria-checked`, `aria-selected` ni `aria-current` sur la commande :
 * `tests/e2e/portee-unique.spec.js` relève tout élément visible portant l'un
 * des trois dont le texte contient « moi », et le compterait comme une SECONDE
 * annonce de portée — sur l'écran dont il tient qu'il n'en annonce qu'une.
 */

/**
 * La phrase du renvoi, ou `''` quand il n'y a rien à annoncer
 *
 * @param {{nombre: number, total: number, libelle: string}} renvoi
 * @returns {string}
 */
export function libelleDuRenvoi({ nombre, total, libelle }) {
  if (!(nombre > 0)) return '';
  // UN SEUL `nombre > 1` pour les deux accords : le nom et le participe.
  // Écrits séparément, le participe est resté au pluriel sur une dépense
  // unique — « 1 dépense perso … rangées dans » — et c'est le cas le plus
  // fréquent du renvoi, puisqu'on coche « perso » une dépense à la fois.
  const pluriel = nombre > 1;
  const depenses = `${nombre} dépense${pluriel ? 's' : ''} perso`;
  const rangees = `rangée${pluriel ? 's' : ''} dans`;
  return `${depenses} (${formatCurrency(total)}) — ${rangees} « ${libelle} »`;
}

/**
 * Pose le renvoi sous une liste, ou l'efface
 *
 * @param {HTMLElement|null} element - Le conteneur du renvoi
 * @param {{nombre: number, total: number, libelle: string, versLaPortee: string}} renvoi
 */
export function afficherLeRenvoi(element, renvoi) {
  if (!element) return;

  const phrase = libelleDuRenvoi(renvoi);
  element.replaceChildren();

  if (!phrase) {
    element.hidden = true;
    return;
  }

  element.hidden = false;

  const texte = document.createElement('span');
  texte.className = 'list-renvoi-texte';
  texte.textContent = phrase;

  // Un bouton NU : aucun attribut d'état ARIA. Voir l'en-tête de ce bloc.
  const bouton = document.createElement('button');
  bouton.type = 'button';
  // `.btn-link` — l'action en ligne du dépôt, et non une seconde rédaction :
  // celle-ci avait été écrite, et son survol mesurait 2,58:1 en thème sombre.
  bouton.className = 'btn-link';
  bouton.dataset.action = 'allerALaPortee';
  bouton.dataset.arg = renvoi.versLaPortee;
  bouton.textContent = `Voir « ${renvoi.libelle} »`;

  element.append(texte, bouton);
}

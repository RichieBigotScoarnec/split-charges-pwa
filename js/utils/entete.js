/**
 * FairSplit — L'en-tête se compacte quand il a quitté l'écran
 *
 * Mesuré sur un écran de 390 × 844 : **294 px avant le premier contenu, 35 %
 * de l'écran**, et rien d'épinglé au défilement — passé le premier écran, on
 * ne savait plus quel mois on lisait. Le découpage en onglets a alourdi ce
 * coût : changer d'onglet remonte en haut, donc ces 294 px se repaient à
 * chaque fois.
 *
 * Ce module ne fait qu'une chose : poser `data-defile="true"` sur `<body>`
 * quand l'en-tête est entièrement sorti de l'écran, et l'y retirer quand il
 * revient. **C'est `onglets.css` qui décide de ce que cela change**, et
 * seulement en dessous de 900 px — au-delà, la page tient en colonnes et
 * l'en-tête n'est pas un péage.
 *
 * ## Pourquoi observer l'en-tête plutôt qu'écouter le défilement
 *
 * Un écouteur `scroll` se déclenche à chaque image et demande d'être bridé ;
 * `IntersectionObserver` ne rapporte qu'aux passages de seuil, et le
 * navigateur le calcule hors du fil principal. Le dépôt emploie déjà cet
 * idiome dans `barre-solde.js`.
 *
 * Aucun élément-repère n'est ajouté au balisage : c'est l'en-tête lui-même
 * qu'on observe. Il quitte l'écran exactement au moment où l'on veut basculer,
 * et un repère de plus serait un élément de plus à tenir juste.
 *
 * ## Le repli
 *
 * Sans `IntersectionObserver` — navigateur ancien, banc d'essai sans DOM
 * complet — l'état reste « pas compact » : l'écran garde la disposition de
 * repos, qui est complète. Un en-tête trop grand se lit ; un mois disparu, non.
 */

/** L'attribut que la feuille de style interroge */
export const ATTRIBUT = 'defile';

/** Observateur en cours, pour ne jamais en laisser deux derrière soi */
let observateur = null;

/**
 * L'en-tête est-il sorti de l'écran ?
 *
 * Rendue à part parce que c'est la seule décision du module, et que l'inverser
 * compacterait l'en-tête exactement quand on le regarde.
 *
 * Une entrée absente ou illisible vaut « visible » : le défaut sûr est l'état
 * de repos, qui n'escamote rien.
 *
 * @param {Array<{isIntersecting: boolean}>} entrees
 * @returns {boolean}
 */
export function enteteSorti(entrees) {
  if (!Array.isArray(entrees) || entrees.length === 0) return false;
  return entrees.every(entree => entree && entree.isIntersecting === false);
}

/**
 * Pose ou retire l'état compact
 *
 * @param {boolean} compact
 * @param {Document} [racine=document]
 * @returns {void}
 */
export function marquerLeDefilement(compact, racine = document) {
  const corps = racine.body;
  if (!corps) return;
  if (compact) corps.dataset[ATTRIBUT] = 'true';
  else delete corps.dataset[ATTRIBUT];
}

/**
 * Fait suivre à l'écran la visibilité de l'en-tête
 *
 * @param {Object} [options]
 * @param {Function} [options.Observateur] - Injectable pour les bancs d'essai
 * @returns {boolean} L'observation est-elle en place ?
 */
export function suivreLEntete({ Observateur } = {}) {
  arreterDeSuivre();

  const entete = document.querySelector('#mainApp > header');
  if (!entete) return false;

  const Classe = Observateur
    || (typeof window !== 'undefined' ? window.IntersectionObserver : undefined);

  if (typeof Classe !== 'function') {
    marquerLeDefilement(false);
    return false;
  }

  observateur = new Classe((entrees) => {
    marquerLeDefilement(enteteSorti(entrees));
  });

  observateur.observe(entete);

  // L'observateur ne rapporte qu'au prochain cycle d'affichage. D'ici là,
  // l'état de repos est le bon : on ouvre l'application en haut de page.
  marquerLeDefilement(false);
  return true;
}

/**
 * Cesse d'observer
 *
 * @returns {void}
 */
export function arreterDeSuivre() {
  if (!observateur) return;
  observateur.disconnect();
  observateur = null;
}

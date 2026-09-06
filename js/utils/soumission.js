/**
 * FairSplit — Un appui, une écriture
 *
 * Rien n'empêchait d'entrer deux fois dans une écriture. Sur une connexion
 * lente, `dbPush` met le temps qu'il met : la modale reste ouverte, le bouton
 * reste actif, rien ne bouge — et le second appui est le réflexe naturel. Deux
 * charges identiques partaient alors en base, et le bilan comptait la dépense
 * deux fois.
 *
 * Le défaut a été mesuré sur la saisie rapide, où le second appel franchissait
 * toute la validation et atteignait l'écriture. Il a été corrigé là, et là
 * seulement : les trois formulaires complets — charge variable, charge fixe,
 * remboursement — sont restés sans garde, alors qu'ils écrivent de la même
 * façon et ferment leur modale seulement après. Un loyer de 900 € compté deux
 * fois pèse plus lourd qu'un café.
 *
 * D'où ce verrou partagé, plutôt qu'un quatrième drapeau recopié. Il est nommé
 * par formulaire : deux modales différentes n'ont pas à s'attendre l'une
 * l'autre, et la saisie rapide ouverte pendant qu'une charge fixe part en base
 * doit rester utilisable.
 *
 * `finally` relâche toujours : une écriture qui échoue — et `dbPush` passe par
 * `borner()`, qui rejette au bout du délai — ne laisse pas le formulaire mort
 * pour le reste de la session.
 */

/** Les écritures en vol, par formulaire */
const enVol = new Set();

/**
 * Une écriture est-elle déjà partie pour ce formulaire ?
 *
 * @param {string} cle - Nom du formulaire
 * @returns {boolean}
 */
export function ecritureEnCours(cle) {
  return enVol.has(cle);
}

/**
 * N'exécute l'action que si la précédente a rendu la main
 *
 * @param {string} cle - Nom du formulaire, pour ne verrouiller que lui
 * @param {Function} action - L'écriture à protéger
 * @returns {Promise<boolean>} L'action a-t-elle été exécutée ?
 */
export async function uneSeuleFois(cle, action) {
  if (enVol.has(cle)) return false;

  enVol.add(cle);
  try {
    await action();
    return true;
  } finally {
    enVol.delete(cle);
  }
}

/**
 * Relâche un verrou sans passer par l'action
 *
 * Appelé au nettoyage d'un module : une écriture interrompue par une
 * déconnexion ne doit pas laisser le formulaire mort pour la session suivante.
 *
 * @param {string} cle - Nom du formulaire
 * @returns {void}
 */
export function relacher(cle) {
  enVol.delete(cle);
}

/**
 * Le bouton dit que l'écriture est partie, le temps qu'elle dure
 *
 * Le verrou seul empêche la charge en double sans rien montrer : le bouton
 * reste actif, l'appui ne produit rien, et le silence est indiscernable d'une
 * panne. C'est d'ailleurs le silence qui faisait appuyer une seconde fois.
 *
 * Rend une fonction qui remet le bouton dans son état d'origine — libellé
 * compris, faute de quoi « Enregistrement… » resterait à l'écran.
 *
 * @param {HTMLButtonElement|null} bouton
 * @param {string} [pendant] - Libellé affiché pendant l'écriture
 * @returns {Function} À rappeler pour rétablir le bouton
 */
export function occuperLeBouton(bouton, pendant = 'Enregistrement…') {
  if (!bouton) return () => {};

  const libelle = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = pendant;

  return () => {
    bouton.disabled = false;
    bouton.textContent = libelle;
  };
}

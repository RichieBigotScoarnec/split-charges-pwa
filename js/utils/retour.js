/**
 * FairSplit — Le geste « retour » referme, il ne quitte pas
 *
 * Mesuré avant correction : après trois changements d'onglet et l'ouverture de
 * plusieurs modales, `history.length` valait toujours 2, `location.hash` était
 * vide, et un `goBack()` sortait de l'application. Rien de ce que fait
 * l'utilisateur n'était inscrit dans l'historique.
 *
 * Or sur Android le retour — bouton, balayage depuis le bord, barre de
 * navigation — est le geste le plus utilisé du système. Dans une PWA
 * installée, on l'emploie pour refermer une boîte de dialogue ou revenir à
 * l'écran précédent. Ici il fermait l'application entière, sans avertissement,
 * potentiellement en pleine saisie. Et plus sournois : la personne apprend à
 * ne plus s'en servir, donc à ne fermer les modales que par « Annuler »,
 * qu'elle doit d'abord trouver.
 *
 * ## Le modèle retenu
 *
 * Une pile de « couches » : chaque chose qu'on peut refermer y pousse une
 * entrée d'historique. Le retour dépile la dernière et la referme.
 *
 *     modale ouverte      → retour la referme
 *     onglet ≠ le premier → retour ramène au premier
 *     rien d'ouvert       → retour quitte, comme n'importe quelle page
 *
 * Les onglets ne poussent qu'UNE entrée, quel que soit le nombre de
 * changements : sans cela, dix allers-retours entre Bilan et Charges
 * exigeraient dix retours pour sortir, et le geste deviendrait une punition.
 *
 * ## Le piège
 *
 * Fermer par un bouton doit aussi retirer l'entrée d'historique — sinon la
 * pile grossit et le retour ne fait plus rien de visible pendant plusieurs
 * appuis. On appelle donc `history.back()` en fermeture ordinaire, et le
 * drapeau `retourProvoque` empêche le gestionnaire de refermer une seconde
 * fois ce qui l'est déjà.
 */

/** La pile des couches ouvertes, du plus ancien au plus récent */
const couches = [];

/**
 * Un `history.back()` que NOUS avons déclenché
 *
 * Le `popstate` qui en découle ne doit rien refermer : la couche est déjà
 * partie. Sans ce drapeau, fermer une modale par son bouton refermerait aussi
 * la couche du dessous — c'est-à-dire ramènerait à l'onglet Bilan.
 */
let retourProvoque = false;

/** Le gestionnaire, posé une seule fois */
let branche = false;

/**
 * Y a-t-il quelque chose à refermer ?
 * @returns {boolean}
 */
export function coucheOuverte() {
  return couches.length > 0;
}

/**
 * Les noms des couches ouvertes, du plus ancien au plus récent
 * @returns {Array<string>}
 */
export function couchesOuvertes() {
  return couches.map(couche => couche.nom);
}

/**
 * Déclare une couche refermable, et inscrit le retour qui la fermera
 *
 * Ré-ouvrir une couche déjà empilée ne pousse rien : `showManageModal` se
 * re-rend après chaque ajout, et chaque rendu rappellerait cette fonction.
 *
 * @param {string} nom - Identifiant de la couche (celui de la modale, ou 'onglet')
 * @param {Function} fermer - Ce qu'il faut faire quand le retour survient
 */
export function empilerCouche(nom, fermer) {
  if (!nom || typeof fermer !== 'function') return;
  if (couches.some(couche => couche.nom === nom)) return;

  couches.push({ nom, fermer });

  // `pushState` et non un fragment d'URL : l'adresse ne doit pas changer.
  // Elle porte `?sandbox=1`, `?emulator=1`, `?diag=1` — des drapeaux que la
  // configuration relit, et qu'un fragment ajouté à chaque modale rendrait
  // illisibles dans la barre d'adresse comme dans un partage.
  try {
    history.pushState({ fairsplitCouche: nom }, '');
  } catch {
    // Un navigateur qui refuse `pushState` — quota d'entrées atteint — ne doit
    // pas empêcher la modale de s'ouvrir. On retire la couche : sans entrée
    // d'historique, il n'y aura pas de `popstate`, et la fermeture ordinaire
    // ne doit donc pas non plus appeler `history.back()`.
    couches.pop();
  }
}

/**
 * Retire une couche fermée autrement que par le retour
 *
 * Appelée par la fermeture ordinaire — bouton, Échap, clic sur le voile.
 *
 * @param {string} nom - Identifiant de la couche
 */
export function depilerCouche(nom) {
  const rang = couches.findIndex(couche => couche.nom === nom);
  if (rang === -1) return;

  // Seule la couche du sommet correspond à la dernière entrée d'historique.
  // Fermer une couche enfouie — cas qui ne se produit pas aujourd'hui, mais
  // que rien n'interdit — ne doit pas consommer l'entrée d'une autre.
  const auSommet = rang === couches.length - 1;
  couches.splice(rang, 1);

  if (!auSommet) return;

  retourProvoque = true;
  try {
    history.back();
  } catch {
    retourProvoque = false;
  }
}

/**
 * Branche le geste retour
 *
 * Un seul écouteur, posé une fois : `initializeAppData()` rejoue à chaque
 * reconnexion sans rechargement, et un second gestionnaire dépilerait deux
 * couches par appui.
 *
 * @returns {boolean} A-t-on branché quelque chose ?
 */
export function initRetour() {
  if (branche) return false;
  branche = true;

  window.addEventListener('popstate', () => {
    // Le `popstate` de notre propre `history.back()` : la couche est déjà
    // retirée, il n'y a rien à refermer.
    if (retourProvoque) {
      retourProvoque = false;
      return;
    }

    const couche = couches.pop();
    if (couche) couche.fermer();
  });

  return true;
}

/**
 * Remet la pile à zéro, sans toucher à l'historique
 *
 * Réservé aux tests et à la déconnexion : après un changement de compte, les
 * couches d'avant ne désignent plus rien.
 */
export function viderCouches() {
  couches.length = 0;
  retourProvoque = false;
}

/**
 * FairSplit — Ce qu'un rejeu de file a le devoir de dire
 *
 * `rejouerFileDAttente()` rend quatre nombres, et chacun commande un message
 * différent. Deux endroits l'appellent — `app.js` à chaque reconnexion,
 * `auth.js` une fois les données chargées — et chacun rédigeait les siens.
 *
 * Ils avaient divergé, sur le message qui compte le plus : `app.js` ne lisait
 * pas `refusees`. Une saisie que le serveur refusera **toujours** est écartée
 * de la file, mais le miroir la porte encore — elle reste donc à l'écran. Sans
 * un mot, le foyer voit sa dépense, la croit enregistrée, et elle n'existe
 * nulle part. Le commentaire de `db.js` promet pourtant que « l'appelant
 * apprend qu'elle n'ira pas plus loin » : la promesse n'était tenue que par un
 * appelant sur deux, et c'était le plus rare des deux qui la tenait.
 *
 * C'est le défaut de `normalizePair`, de `resolveShareMode` et
 * d'`ecartAuHabituel`, dans un registre non monétaire : deux rédactions du même
 * message finissent par ne plus dire la même chose. Ce module est la seule.
 *
 * Il ne fait que du texte : aucun toast, aucune base, aucun DOM. Les appelants
 * choisissent le canal — c'est ce qui le rend éprouvable.
 */

/**
 * Les messages qu'un bilan de rejeu commande
 *
 * ## Pourquoi le silence est la règle
 *
 * Une reconnexion se produit à chaque sortie de veille. Une confirmation à
 * chacune ferait de ce message un bruit de fond, et c'est justement le cas où
 * il compte qu'on cesserait de voir. Une case sans objet vaut donc `null`, et
 * l'appelant n'affiche rien.
 *
 * ## Pourquoi `erreur` conditionne le message « restantes »
 *
 * Il distingue « on a essayé et ça a résisté » de « on n'a pas encore
 * essayé » — la session n'est pas toujours rétablie quand la liaison
 * s'établit. Sans cette nuance, chaque ouverture avec une file non vide
 * annoncerait un échec inexistant.
 *
 * @param {Object} bilan - Sortie de `rejouerFileDAttente()`
 * @param {number} [bilan.envoyees] - Saisies parties
 * @param {number} [bilan.restantes] - Saisies encore en file
 * @param {string|null} [bilan.erreur] - Motif de l'arrêt, s'il y en a eu un
 * @param {Array<Object>} [bilan.refusees] - Saisies écartées définitivement
 * @returns {{succes: string|null, refus: string|null, restant: string|null}}
 */
export function annoncesDuRejeu(bilan) {
  const envoyees = Number.isFinite(bilan?.envoyees) ? bilan.envoyees : 0;
  const restantes = Number.isFinite(bilan?.restantes) ? bilan.restantes : 0;
  const refusees = Array.isArray(bilan?.refusees) ? bilan.refusees.length : 0;

  return {
    succes: envoyees > 0
      ? (envoyees === 1 ? '1 saisie hors ligne enregistrée' : `${envoyees} saisies hors ligne enregistrées`)
      : null,

    // Une saisie que le serveur refusera toujours ne « reste » pas : elle est
    // perdue, et le dire est la seule chose honnête à faire. La confondre avec
    // une saisie en attente promettrait un envoi qui n'arrivera jamais.
    refus: refusees > 0
      ? (refusees === 1
        ? '1 saisie refusée par la base — à ressaisir'
        : `${refusees} saisies refusées par la base — à ressaisir`)
      : null,

    restant: restantes > 0 && bilan?.erreur
      ? (restantes === 1
        ? '1 saisie reste sur cet appareil'
        : `${restantes} saisies restent sur cet appareil`)
      : null
  };
}

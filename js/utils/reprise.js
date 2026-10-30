/**
 * FairSplit — Écouler la file, et sortir du hors-ligne
 *
 * Trois gestes qui vivaient dans `app.js` et `auth.js`, deux fichiers qu'aucun
 * test ne monte : le premier s'auto-initialise à l'import, le second est le hub
 * qui démarre les vingt-deux modules. Ce qu'ils portent n'était donc éprouvé
 * que par des contrôles qui LISENT LEUR SOURCE — et une lecture de source
 * mesure la forme du câblage, jamais son effet.
 *
 * Mesuré : supprimer le bloc `if (refus) { toast.error(refus); … }` d'`app.js`
 * laissait les 2 378 contrôles verts. Or ce bloc EST le correctif que le commit
 * précédent annonce — sans lui, une saisie que le serveur refusera toujours est
 * écartée de la file en silence, tout en restant à l'écran par le miroir. Le
 * foyer la voit, la croit enregistrée, elle n'existe nulle part.
 *
 * Le comportement est donc ici, dans un module qui se monte avec trois doubles.
 * `app.js` et `auth.js` ne gardent que le fil : quel geste, à quel moment.
 *
 * Ce module ne calcule rien : il compose `rejouerFileDAttente`,
 * `annoncesDuRejeu` et le bandeau.
 */

import { rejouerFileDAttente, saisiesEnAttente } from '../db.js';
import { toast } from '../components/toast.js';
import { refreshConnectionBanner } from './connection-banner.js';
import { annoncesDuRejeu } from './rejeu-annonce.js';
import { noter } from './diagnostics.js';
import { warn, error as logError } from './debug.js';

/**
 * Envoie les saisies gardées sur l'appareil, à la reconnexion
 *
 * Ne recharge pas la page et ne redemande rien : les modules affichent déjà ces
 * saisies, `db.js` les leur ayant appliquées à la lecture. Le rejeu ne fait que
 * rendre vrai côté serveur ce qui est vrai à l'écran depuis la coupure.
 *
 * Le silence est la règle quand la file est vide : une reconnexion se produit à
 * chaque sortie de veille, et un message à chacune finirait par masquer le seul
 * qui compte. C'est `annoncesDuRejeu` qui décide de ce silence, et elle seule.
 *
 * @returns {Promise<void>}
 */
export async function synchroniserLesSaisies() {
  const bilan = await rejouerFileDAttente();
  const { envoyees, restantes, erreur, refusees = [] } = bilan;
  const { succes, refus, restant } = annoncesDuRejeu(bilan);

  if (succes) {
    toast.success(succes);
    noter('hors-ligne', 'file rejouée', { envoyees, restantes, refusees: refusees.length });
  }

  // Une saisie que le serveur refusera toujours ne « reste » pas : elle est
  // perdue, et le dire est la seule chose honnête à faire. C'est le message que
  // ce chemin-ci ne portait pas, alors que c'est LUI qui court le plus — il
  // part à chaque reconnexion, quand celui du chargement ne part qu'une fois.
  if (refus) {
    toast.error(refus);
    logError('⚠️ Saisies refusées définitivement :', refusees);
  }

  if (restant) {
    // La file résiste : le dire, plutôt que laisser le bandeau disparaître avec
    // la reconnexion en emportant le compte des saisies restées à quai.
    toast.error(restant);
    logError('❌ Rejeu incomplet :', erreur);
  }

  refreshConnectionBanner(true, restantes);
}

/**
 * Ce qu'une reprise autonome de liaison doit déclencher
 *
 * `.info/connected` de Firebase peut rester FAUX alors que la base répond
 * parfaitement. C'est arrivé, et l'application est restée bloquée hors ligne
 * pendant des heures : aucun événement de connexion ne venait, donc rien ne
 * refermait le bandeau ni ne vidait la file. `db.js` sonde donc la base de
 * lui-même, à intervalles croissants, et appelle ce rappel quand une lecture
 * aboutit enfin.
 *
 * Les deux gestes comptent, et pour des raisons différentes : refermer le
 * bandeau dit au foyer qu'il est de nouveau en ligne, écouler la file rend
 * vraies les saisies qu'il a faites entre-temps. N'en faire qu'un laisserait
 * soit un bandeau qui ment, soit des saisies qui n'existent que sur l'appareil.
 *
 * @returns {Promise<void>}
 */
export async function surRepriseDeLiaison() {
  refreshConnectionBanner(true, saisiesEnAttente());
  await synchroniserLesSaisies();
}

/**
 * Écoule la file une fois les données chargées
 *
 * Le jumeau de `synchroniserLesSaisies`, à trois différences près, toutes
 * voulues :
 *
 *   - il se tait tout de suite quand la file est vide, sans appeler le rejeu —
 *     c'est l'immense majorité des ouvertures ;
 *   - il ne touche pas au bandeau : à cet instant la liaison vient d'être
 *     établie par Firebase lui-même, qui l'a déjà rafraîchi ;
 *   - il journalise en `warn`, ce chemin n'étant pas une panne.
 *
 * Il part au chargement des données, une seule fois par ouverture. L'autre part
 * à chaque reconnexion.
 *
 * @returns {Promise<void>}
 */
export async function ecoulerLesSaisiesGardees() {
  if (saisiesEnAttente() === 0) return;

  const bilan = await rejouerFileDAttente();
  const { erreur, refusees = [] } = bilan;
  const { succes, refus, restant } = annoncesDuRejeu(bilan);

  if (succes) toast.success(succes);

  // Une saisie que le serveur refusera toujours ne « reste » pas : elle est
  // perdue, et le dire est la seule chose honnête à faire.
  if (refus) {
    toast.error(refus);
    warn('⚠️ Saisies refusées définitivement :', refusees);
  }

  if (restant) {
    toast.error(restant);
    warn('⚠️ Rejeu incomplet :', erreur);
  }
}

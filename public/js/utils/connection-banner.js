/**
 * FairSplit — Signalement d'une base injoignable
 *
 * Deux pannes signalées en production venaient d'un bouclier de navigateur qui
 * bloquait l'accès à la base. Le plus grave n'était pas le blocage : c'était le
 * silence.
 *
 * Firebase résout les lectures depuis son cache local quand il ne joint pas le
 * serveur. Un mois sans données et un mois qu'on ne peut pas lire se
 * ressemblent alors trait pour trait : toutes les étapes d'initialisation se
 * déclarent réussies, l'écran affiche un mois vide parfaitement crédible, et
 * les saisies partent dans une file d'attente qui ne se videra jamais. Rien à
 * l'écran ne le dit.
 *
 * `navigator.onLine` n'aide pas : le réseau fonctionne, seul le domaine de la
 * base est refusé. Seul l'état `.info/connected` de Firebase fait foi.
 *
 * Le bandeau nomme la cause la plus probable. Un bloqueur de contenu n'est pas
 * un cas exotique, et personne ne fera spontanément le lien entre « mes
 * salaires ne s'enregistrent pas » et « mon navigateur protège ma vie
 * privée ».
 */

import { noter } from './diagnostics.js';

/**
 * Délai avant affichage, en millisecondes
 *
 * Firebase annonce « déconnecté » le temps d'établir sa liaison : afficher
 * aussitôt ferait clignoter le bandeau à chaque ouverture. Une coupure réelle,
 * elle, dure.
 */
const DELAI_AVANT_ALERTE_MS = 8000;

/** Minuterie en cours, pour l'annuler dès que la liaison s'établit */
let minuterie = null;

/** Le journal ne doit retenir qu'une entrée par bascule, pas une par appel */
let dernierEtat = null;

/**
 * Réagit à un changement d'état de la liaison
 *
 * @param {boolean} connecte - La base est-elle joignable ?
 * @returns {void}
 */
export function refreshConnectionBanner(connecte) {
  if (connecte !== dernierEtat) {
    noter('liaison', connecte ? 'base joignable' : 'base injoignable');
    dernierEtat = connecte;
  }

  if (connecte) {
    if (minuterie) {
      window.clearTimeout(minuterie);
      minuterie = null;
    }
    basculer(false);
    return;
  }

  if (minuterie) return;
  minuterie = window.setTimeout(() => {
    minuterie = null;
    basculer(true);
    noter('liaison', 'bandeau « base injoignable » affiché');
  }, DELAI_AVANT_ALERTE_MS);
}

/**
 * Repart sur un délai neuf au retour de l'application au premier plan
 *
 * Un téléphone qui se met en veille gèle la page et coupe la liaison. Au
 * réveil, Firebase se reconnecte — c'est normal, et ça prend un instant. Or la
 * temporisation, elle, a couru pendant la veille : le bandeau s'affichait donc
 * au retour, annonçant une panne là où il n'y avait qu'une reconnexion.
 *
 * Un bandeau qui crie au loup finit par ne plus être lu, ce qui lui retire
 * exactement ce pour quoi il existe.
 *
 * @returns {void}
 */
export function initConnectionBanner() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    if (minuterie) {
      window.clearTimeout(minuterie);
      minuterie = null;
    }
    basculer(false);

    // Toujours coupée selon Firebase : la temporisation recommence, au lieu de
    // se conclure sur du temps passé en veille.
    if (dernierEtat === false) refreshConnectionBanner(false);
  });
}

/**
 * Affiche ou masque le bandeau
 * @param {boolean} visible - Faut-il le montrer ?
 * @returns {void}
 */
function basculer(visible) {
  const bandeau = document.getElementById('offlineBanner');
  if (bandeau) bandeau.hidden = !visible;
}

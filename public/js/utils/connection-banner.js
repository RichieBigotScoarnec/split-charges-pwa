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
 *
 * Depuis que les saisies sont gardées sur l'appareil et rejouées à la
 * reconnexion, le bandeau annonce autre chose : non plus une perte, mais une
 * attente, avec son compte. « 3 saisies conservées sur cet appareil » se
 * vérifie d'un coup d'œil ; « vos saisies ne sont pas enregistrées », qui
 * serait devenu faux, aurait appris à ne plus lire le bandeau.
 */

import { noter } from './diagnostics.js';
import { FIREBASE_CONFIG } from '../config.js';

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
 * @param {number} [enAttente] - Saisies gardées sur l'appareil, non encore parties
 * @returns {void}
 */
export function refreshConnectionBanner(connecte, enAttente = 0) {
  if (connecte !== dernierEtat) {
    noter('liaison', connecte ? 'base joignable' : 'base injoignable');
    dernierEtat = connecte;
  }

  // Le compte se rafraîchit même quand le bandeau est déjà affiché : une
  // saisie de plus pendant la coupure doit se voir sans attendre la
  // reconnexion, sinon le bandeau dit « 3 » alors qu'il y en a cinq.
  ecrireAttente(enAttente);

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
    noter('liaison', 'bandeau hors ligne affiché', { enAttente });
    sonderLaBase();
  }, DELAI_AVANT_ALERTE_MS);
}

/**
 * Délai du sondage, en millisecondes — au-delà, l'hôte est tenu pour muet
 */
const DELAI_SONDAGE_MS = 8000;

/**
 * Demande à la base si elle est joignable en HTTPS ordinaire
 *
 * Realtime Database parle d'abord par WebSocket. Quand `.info/connected` reste
 * faux, on ne sait pas distinguer deux causes qui n'ont rien à voir : l'hôte
 * est hors d'atteinte, ou bien il répond très bien en HTTPS et c'est le seul
 * WebSocket qui est bloqué — ce que font couramment un réseau d'entreprise, un
 * pare-feu, ou certains opérateurs mobiles.
 *
 * Une requête sans jeton doit être refusée : un `401` est donc une **bonne**
 * nouvelle, il prouve que l'hôte répond. Une erreur réseau, elle, prouve qu'il
 * ne répond pas du tout. Aucune donnée ne transite : `shallow=true` sur la
 * racine, sans authentification, ne peut rien rendre.
 *
 * @returns {Promise<void>} Ne lève jamais, ne bloque rien
 */
async function sonderLaBase() {
  const base = FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL;
  if (!base || typeof fetch !== 'function') return;

  const debut = Date.now();
  const abandon = typeof AbortController === 'function' ? new AbortController() : null;
  const minuteurSondage = abandon
    ? window.setTimeout(() => abandon.abort(), DELAI_SONDAGE_MS)
    : null;

  try {
    const reponse = await fetch(`${base}/.json?shallow=true`, {
      method: 'GET',
      cache: 'no-store',
      signal: abandon ? abandon.signal : undefined
    });

    noter('liaison', 'sondage HTTPS : la base répond', {
      statut: reponse.status,
      ms: Date.now() - debut,
      lecture: 'un 401 est attendu et prouve que l\'hôte est joignable'
    });
  } catch (erreur) {
    noter('liaison', 'sondage HTTPS : aucune réponse', {
      motif: erreur?.name === 'AbortError' ? `abandon après ${DELAI_SONDAGE_MS / 1000} s` : (erreur?.message || String(erreur)),
      ms: Date.now() - debut
    });
  } finally {
    if (minuteurSondage) window.clearTimeout(minuteurSondage);
  }
}

/**
 * Met à jour le seul compte, sans toucher à l'affichage du bandeau
 *
 * Une saisie faite pendant la coupure ne change pas l'état de la liaison : il
 * n'y a donc aucun événement de connexion pour rafraîchir le bandeau, et il
 * annoncerait « 3 saisies » alors qu'il y en a cinq. Un compte faux dans un
 * bandeau censé rassurer vaut moins que pas de compte du tout.
 *
 * @param {number} enAttente
 * @returns {void}
 */
export function majSaisiesEnAttente(enAttente) {
  ecrireAttente(enAttente);
}

/**
 * Écrit ce que le bandeau dit des saisies en attente
 *
 * `textContent`, jamais `innerHTML` : le nombre vient du code, mais la règle
 * ne souffre pas d'exception — c'est ainsi qu'on finit par y injecter autre
 * chose.
 *
 * @param {number} enAttente
 * @returns {void}
 */
function ecrireAttente(enAttente) {
  const zone = document.getElementById('offlineBannerAttente');
  if (!zone) return;

  const nombre = Number.isFinite(enAttente) ? Math.max(0, Math.trunc(enAttente)) : 0;

  // La phrase est écrite en entier ici, verbe de fin compris. Le balisage n'en
  // portait que le début, et la suite — « et partiront dès que… » — restait au
  // pluriel : « 1 saisie est conservée sur cet appareil et partiront ». Une
  // phrase coupée en deux entre deux fichiers finit toujours par se
  // désaccorder ; celle-ci l'a fait dès la première mise en service.
  const fin = 'dès que la base sera de nouveau joignable.';

  if (nombre === 0) {
    zone.textContent = `vos saisies sont conservées sur cet appareil et partiront ${fin}`;
    return;
  }

  zone.textContent = nombre === 1
    ? `1 saisie est conservée sur cet appareil et partira ${fin}`
    : `${nombre} saisies sont conservées sur cet appareil et partiront ${fin}`;
}

/**
 * Branche le bandeau, et repart sur un délai neuf au retour au premier plan
 *
 * Un téléphone qui se met en veille gèle la page et coupe la liaison. Au
 * réveil, Firebase se reconnecte — c'est normal, et ça prend un instant. Or la
 * temporisation, elle, a couru pendant la veille : le bandeau s'affichait donc
 * au retour, annonçant une panne là où il n'y avait qu'une reconnexion.
 *
 * Un bandeau qui crie au loup finit par ne plus être lu, ce qui lui retire
 * exactement ce pour quoi il existe.
 *
 * @param {Function|null} [retenter] - Sait redemander une liaison ; rend une promesse de booléen
 * @returns {void}
 */
export function initConnectionBanner(retenter = null) {
  reprise = typeof retenter === 'function' ? retenter : null;

  // Le gestionnaire est une fonction nommée du module, jamais une fermeture
  // fabriquée à l'appel : le DOM ignore un enregistrement identique, si bien
  // qu'appeler cette fonction deux fois ne pose qu'un seul écouteur. C'est ce
  // qui évite ici le travers qui avait fini par produire trois soumissions pour
  // une pression dans la saisie rapide — et non un `removeEventListener`, qui
  // serait sans effet et donnerait à croire qu'il protège de quelque chose.
  document.addEventListener('visibilitychange', surRetourAuPremierPlan);

  // « Réessayer » : le mode hors ligne se soigne tout seul, mais ses délais
  // s'espacent jusqu'à cinq minutes. Quelqu'un qui vient de rétablir son réseau
  // n'a aucune raison d'attendre, et un bouton qui rend la main tout de suite
  // vaut mieux qu'une explication sur la patience.
  const bouton = document.getElementById('offlineBannerReessayer');
  if (bouton) bouton.addEventListener('click', surClicReessayer);
}

/**
 * Le retour de l'application au premier plan
 *
 * Un téléphone en veille gèle la page et coupe la liaison ; au réveil, la
 * reconnexion est normale et prend un instant. La temporisation, elle, a couru
 * pendant la veille : sans cette remise à zéro, le bandeau s'affichait au
 * retour, annonçant une panne là où il n'y avait qu'une reconnexion.
 *
 * Et l'on retente pour de bon : revenir sur l'application est précisément le
 * moment où l'on veut savoir, le réseau ayant pu redevenir joignable pendant
 * que l'écran était éteint.
 *
 * @returns {void}
 */
function surRetourAuPremierPlan() {
  if (document.visibilityState !== 'visible') return;

  if (minuterie) {
    window.clearTimeout(minuterie);
    minuterie = null;
  }
  basculer(false);

  if (dernierEtat === false) {
    refreshConnectionBanner(false);
    if (reprise) reprise();
  }
}

/** Le clic sur « Réessayer », nommé pour ne jamais s'empiler */
function surClicReessayer(evenement) {
  surReessayer(evenement.currentTarget);
}

/**
 * La fonction qui sait retenter une liaison, fournie par l'appelant
 *
 * Ce module ne connaît pas la base et n'a pas à la connaître : il est chargé
 * par des bancs d'essai qui n'ont ni Firebase ni stockage. L'appelant, lui, a
 * les deux.
 */
let reprise = null;

/**
 * Le geste « Réessayer », avec ce qu'il faut de retour à l'écran
 *
 * Un bouton qui ne dit rien pendant cinq secondes est indiscernable d'un bouton
 * mort — la panne exacte signalée sur le bouton de recherche de lieu, en son
 * temps.
 *
 * @param {HTMLElement} bouton
 * @returns {Promise<void>}
 */
async function surReessayer(bouton) {
  if (!reprise || bouton.disabled) return;

  const origine = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Essai…';

  let rétablie;
  try {
    rétablie = await reprise();
  } catch {
    // Une reprise qui lève n'est pas une reprise : elle vaut un échec, et le
    // bouton doit le dire plutôt que rester figé sur « Essai… ».
    rétablie = false;
  }

  // Rétablie, le bandeau disparaît de lui-même : rien à réafficher.
  if (rétablie) return;

  bouton.textContent = 'Toujours rien';
  window.setTimeout(() => {
    bouton.disabled = false;
    bouton.textContent = origine;
  }, 2500);
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

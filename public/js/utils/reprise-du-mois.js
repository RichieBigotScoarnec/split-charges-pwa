/**
 * FairSplit — Ce que le mois affiché attend du retour du réseau
 *
 * Deux choses peuvent rester en suspens sur le mois à l'écran, et le retour du
 * réseau les règle toutes les deux par le même geste, une relecture fraîche :
 *
 *   - une RECONDUCTION qui n'a pas été tentée, parce qu'elle se serait fondée
 *     sur le miroir ;
 *   - un mois ILLISIBLE, jamais lu sur cet appareil.
 *
 * Elles ne disent pas la même chose à l'écran, d'où deux états. Un mois marqué
 * est toujours celui qu'on regarde : `applyRecurringCharges` et `loadPeriodData`
 * refont ces marques à chaque ouverture de mois.
 *
 * Tout vit en mémoire, à dessein. Une page fermée pendant l'attente n'a rien
 * perdu : la reconduction se rejoue à la prochaine ouverture, et une marque
 * persistée n'apprendrait rien de plus que ce que la base dira alors.
 *
 * ## LE CHARGEUR QUI ÉCHOUE VIDE L'ÉTAT
 *
 * Sans cela, la liste gardait les charges du mois d'avant sous le nom du mois
 * demandé, et le bilan calculait dessus : un solde exact, pour un autre mois.
 * Le chargeur ne se contente pas de vider, parce qu'une liste vide est un mois
 * où il n'y a rien à payer : `estIllisible` permet aux listes de dire le
 * contraire.
 */

import { getState, setState } from '../state.js';
import { toast } from '../components/toast.js';
import { formatPeriod } from './date.js';
import { annoncerReconductionEnAttente } from './connection-banner.js';
import { error as logError } from './debug.js';

/** Le mois dont la reconduction attend le réseau */
let reconduction = null;

/** Le mois qu'aucun chargeur n'a pu lire */
let illisible = null;

/** Le mois dont la relecture est tombée dans une nouvelle coupure */
let relecture = null;

/**
 * Note qu'un mois attend sa reconduction, et l'écran le dit
 *
 * @param {string} mois - Clé de période
 * @returns {void}
 */
export function mettreEnAttente(mois) {
  reconduction = mois;
  annoncerReconductionEnAttente(formatPeriod(mois));
}

/**
 * Plus rien n'attend, ou ce n'est plus à cet appel d'en parler
 * @returns {void}
 */
export function leverLAttente() {
  reconduction = null;
  annoncerReconductionEnAttente(null);
}

/**
 * Ce mois a-t-il été déclaré illisible ?
 *
 * @param {string} mois - Clé de période
 * @returns {boolean}
 */
export function estIllisible(mois) {
  return Boolean(mois) && illisible === mois;
}

/**
 * Une nouvelle tentative de lecture commence : le mois n'est plus jugé
 * @returns {void}
 */
export function oublierLIllisible() {
  illisible = null;
}

/**
 * Le mois à relire au retour du réseau, s'il y en a un
 *
 * Le rendre l'EFFACE, et c'est ce qui protège des deux portes de reprise : une
 * reconnexion annoncée et une reprise autonome peuvent se suivre de près, et
 * chacune relirait tout. Une relecture qui échoue encore pose une marque neuve.
 *
 * @returns {string|null}
 */
export function prendreLeMoisARelire() {
  const mois = reconduction || illisible || relecture;
  const annonce = Boolean(reconduction);
  reconduction = null;
  illisible = null;
  relecture = null;
  if (annonce) annoncerReconductionEnAttente(null);
  return mois;
}

/**
 * La relecture n'a rien relu : la reprendre à la prochaine reconnexion
 *
 * Mesuré sur une connexion lente : la liaison revient, le mois est relu, la
 * reconduction écrit bien le loyer — et la liaison retombe pendant la relecture
 * de la liste, que le miroir sert alors dans son état d'avant la copie. L'écran
 * annonçait « Aucune charge fixe » au-dessus d'une base qui en portait une, et
 * plus rien ne relisait : la marque avait été consommée.
 *
 * Silencieuse : rien n'attend, il n'y a qu'un écran à rafraîchir.
 *
 * @param {string} mois - Clé de période
 * @returns {void}
 */
export function relireAuRetour(mois) {
  relecture = mois;
}

/**
 * Un chargeur a échoué : l'écran ne garde rien d'un autre mois
 *
 * Les trois chargeurs passent ici : trois rédactions du même repli finiraient
 * par ne plus vider la même chose. Le message ne part qu'une fois par mois
 * illisible, sans quoi le même échec le dirait trois fois de suite.
 *
 * @param {Object} echec
 * @param {string} echec.mois - Clé de période
 * @param {string} echec.collection - Clé d'état : `fixedCharges`, `variableCharges`, `reimbursements`
 * @param {Function} echec.rendre - Le rendu de la collection
 * @returns {void}
 */
export function viderApresEchec({ mois, collection, rendre }) {
  // Le mois a changé pendant la lecture : c'est un autre chargement qui décide.
  if (getState('currentPeriod') !== mois) return;

  setState(`deleted.${collection}`, []);
  setState(collection, []);

  if (illisible !== mois) {
    illisible = mois;
    toast.error(`${formatPeriod(mois)} n'est pas disponible pour l'instant : ses charges n'ont pas pu être lues`);
  }

  // Rendre la main à l'appelant quoi qu'il arrive : l'étape suivante de
  // l'initialisation n'a pas à payer un rendu qui lève.
  try {
    rendre();
  } catch (erreur) {
    logError(`❌ Rendu impossible après l'échec de ${collection} :`, erreur);
  }
}

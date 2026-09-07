/**
 * FairSplit — Ce que l'écran dit d'un mois qui n'est pas celui d'aujourd'hui
 *
 * ## Deux informations, et le badge les confondait
 *
 * L'application affichait, sous le sélecteur de mois, une rangée portant
 * « 📁 Mois archivé — modifiable ». Elle tenait ensemble deux choses de nature
 * différente :
 *
 *   - « archivé » est un **état**. Il doit rester constatable à tout moment :
 *     une charge saisie dans le mauvais mois se repère à ça ;
 *   - « modifiable » est une **levée de malentendu**. Rien n'empêche de
 *     corriger un mois passé, et c'est voulu — l'instantané de salaires par
 *     période rend la correction sûre. On la lit une fois en arrivant.
 *
 * La rangée coûtait **28 px de premier écran** — 20 px de ligne de texte plus
 * 8 px de marge, mesuré à 320 px. L'état tient désormais dans le libellé du
 * mois, pour zéro pixel ; la levée de malentendu part dans un toast.
 *
 * ## Pourquoi ce module existe, plutôt que deux comparaisons en ligne
 *
 * `period.js` demandait « ce mois est-il celui d'aujourd'hui ? » avec sa propre
 * comparaison, et annonçait « archivé » dès que la réponse était non — donc
 * aussi sur un mois **à venir**. Mesuré le 2026-09-07 : « octobre 2026 »
 * s'affichait comme archivé.
 *
 * `utils/date.js` exporte pourtant `etatDuMois`, qui rend les trois états et
 * que le bilan comme le rapport lisent déjà. C'était le défaut `normalizePair`
 * dans sa forme habituelle : une grandeur calculée à deux endroits, et c'est la
 * seconde rédaction qui se trompe. Tout ce module passe par `etatDuMois`, et
 * n'en refait aucune part.
 */

import { etatDuMois } from './date.js';

/**
 * Le marqueur d'un mois révolu
 *
 * Exporté plutôt qu'écrit deux fois : le libellé le pose, les contrôles le
 * cherchent.
 */
export const MARQUEUR_REVOLU = '📁';

/** Ce que le toast dit en arrivant sur un mois révolu */
export const LEVEE_DU_MALENTENDU = '📁 Mois archivé — modifiable';

/**
 * Ce mois est-il derrière nous ?
 *
 * @param {string} mois - AAAA-MM
 * @param {string} moisReel - AAAA-MM du calendrier
 * @returns {boolean} Faux pour le mois en cours, pour un mois à venir, et pour
 *   toute valeur qu'`etatDuMois` ne sait pas lire.
 */
export function estRevolu(mois, moisReel) {
  return etatDuMois(mois, moisReel) === 'revolu';
}

/**
 * Le libellé d'un mois, marqué s'il est révolu
 *
 * Le marqueur précède le nom plutôt que de le suivre : dans un `<select>`
 * fermé, la fin du texte est ce qui se rogne en premier quand la place manque,
 * et un marqueur rogné ne dit plus rien.
 *
 * @param {string} libelle - Le nom du mois, déjà formaté
 * @param {string} mois - AAAA-MM
 * @param {string} moisReel - AAAA-MM du calendrier
 * @returns {string}
 */
export function libelleMarque(libelle, mois, moisReel) {
  if (typeof libelle !== 'string' || !libelle) return libelle;
  return estRevolu(mois, moisReel) ? `${MARQUEUR_REVOLU} ${libelle}` : libelle;
}

/**
 * Faut-il lever le malentendu maintenant ?
 *
 * **Une fois par excursion dans le passé, pas une fois par mois traversé.**
 * Reculer d'août à juillet puis à juin est un seul voyage : trois messages
 * empilés pour trois flèches seraient du bruit, et ce dépôt a déjà payé la
 * leçon des messages qui s'empilent.
 *
 * La règle est donc une TRANSITION, pas un état : on annonce en *entrant* dans
 * le passé, c'est-à-dire quand le mois quitté n'était pas lui-même révolu.
 *
 * Le premier affichage compte comme une entrée : `precedent` vaut alors `null`,
 * et si l'application ouvrait un jour directement sur un mois passé — ce
 * qu'elle ne fait pas aujourd'hui, `initPeriod` posant toujours le mois réel —
 * le message serait dit. C'est le comportement voulu, et il est écrit ici
 * plutôt que d'être découvert le jour où un raccourci d'URL choisit le mois.
 *
 * @param {string|null} precedent - Le mois quitté, ou `null` au premier rendu
 * @param {string} nouveau - Le mois affiché maintenant
 * @param {string} moisReel - AAAA-MM du calendrier
 * @returns {boolean}
 */
export function doitLeverLeMalentendu(precedent, nouveau, moisReel) {
  if (!estRevolu(nouveau, moisReel)) return false;
  return !estRevolu(precedent, moisReel);
}

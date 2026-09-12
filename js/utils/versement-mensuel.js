/**
 * FairSplit — Le versement qui se fait tout seul, chaque mois
 *
 * Décider de mettre 150 € de côté chaque mois, c'est décider une fois. Le
 * versement à deux a supprimé le calcul de tête et la double saisie, mais il
 * restait un geste à refaire douze fois par an — et un geste qu'on oublie ne se
 * signale nulle part : la cagnotte prend simplement du retard, et le rattrapage
 * se découvre à l'échéance.
 *
 * Une enveloppe peut donc porter un versement mensuel, repris de lui-même à
 * l'ouverture d'un mois neuf. C'est le même mécanisme que la reconduction des
 * charges fixes, et les mêmes garanties : **une seule fois par mois**, et
 * **jamais un autre mois que le mois courant** — ni en arrière, ni en avant.
 *
 * ## La clé EST l'empreinte
 *
 * La reconduction réserve son tour par une `transaction` sur
 * `periods/{mois}/reconductedFrom` : sans cela, deux téléphones ouvrant
 * l'application le même matin copient chacun les charges, et le mois se
 * retrouve en double.
 *
 * Ici, rien à réserver. Le versement automatique est écrit sous une clé
 * **déterministe** — `auto-2026-09-vous` — et non sous une clé poussée. Deux
 * appels concurrents écrivent donc au même endroit la même chose : le second
 * recouvre le premier au lieu de s'y ajouter. C'est plus simple qu'une
 * transaction, et c'est plus sûr : il n'y a pas d'empreinte à rendre si
 * l'écriture échoue.
 *
 * Cette clé sert aussi de mémoire. Retirer un versement automatique est une
 * suppression douce : l'entrée reste, sa clé aussi, et le mois n'est donc pas
 * réalimenté à la prochaine ouverture. Sans elle, retirer un versement le
 * ferait revenir — le défaut exact que `reconductedFrom` existe pour empêcher.
 *
 * Aucune base, aucun DOM, aucun réseau.
 */

import { parseMontant } from './montant.js';

/** Format d'une clé de mois : AAAA-MM */
const CLE_MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Plafond d'un versement mensuel, aligné sur celui d'un budget d'enveloppe */
const MONTANT_MAX = 10000000;

/** Ce que « qui verse » peut valoir dans un versement mensuel */
export const AUTEURS_MENSUELS = Object.freeze(['vous', 'conjointe', 'deux']);

/**
 * La clé sous laquelle un versement automatique s'écrit
 *
 * Déterministe, et c'est tout son intérêt : elle rend l'écriture idempotente et
 * tient lieu d'empreinte. Le préfixe la distingue d'une clé poussée par
 * Firebase, qui commence toujours par `-`.
 *
 * @param {string} mois - AAAA-MM
 * @param {'vous'|'conjointe'} auteur - Celui à qui la ligne est attribuée
 * @returns {string}
 */
export function cleVersementAuto(mois, auteur) {
  return `auto-${mois}-${auteur}`;
}

/**
 * Les deux clés qu'un mois peut porter pour une enveloppe
 *
 * Les deux, quel que soit le réglage : un foyer qui passe de « à deux » à
 * « moi seul » en cours d'année ne doit pas se voir réalimenter un mois déjà
 * alimenté sous l'autre forme.
 *
 * @param {string} mois - AAAA-MM
 * @returns {string[]}
 */
export function clesDuMois(mois) {
  return [cleVersementAuto(mois, 'vous'), cleVersementAuto(mois, 'conjointe')];
}

/**
 * Le versement mensuel d'une enveloppe, sous une forme exploitable
 *
 * `null` dès qu'un des deux champs manque : un montant sans destinataire ne
 * peut pas s'écrire — les règles exigent un auteur — et un destinataire sans
 * montant ne veut rien dire. Rendre une forme à moitié lisible ferait porter la
 * décision plus loin, à un endroit qui ne saurait plus quoi en faire.
 *
 * @param {*} brut - Valeur lue en base, donc non fiable
 * @returns {{montant: number, auteur: string}|null}
 */
export function versementMensuelLisible(brut) {
  if (!brut || typeof brut !== 'object') return null;

  const montant = parseMontant(brut.montant);
  if (!Number.isFinite(montant) || montant <= 0 || montant > MONTANT_MAX) return null;

  if (!AUTEURS_MENSUELS.includes(brut.auteur)) return null;

  return { montant: Math.round(montant * 100) / 100, auteur: brut.auteur };
}

/**
 * Faut-il alimenter cette enveloppe pour ce mois, et de combien ?
 *
 * Six raisons de ne rien faire, et chacune écarte un cas où l'écriture serait
 * fausse plutôt que seulement inutile :
 *
 *   1. les mois ne sont pas lisibles — on ne sait pas de quoi on parle ;
 *   2. **le mois visé n'est pas le mois courant.** Ouvrir un autre mois est une
 *      consultation, pas une reprise d'activité. Vers le passé, y déverser un
 *      versement réécrirait l'histoire d'un pot dont le contenu a déjà servi à
 *      juger une échéance. Vers l'avenir — le sélecteur propose un mois
 *      d'avance — cela remplissait le pot d'un mois qui n'a pas commencé, et
 *      `acquisSurObjectif` comme `etatProvision` présentent ce contenu comme de
 *      l'argent qui existe : CONSULTER déplaçait de l'argent. La reconduction
 *      des charges fixes fait de même vers l'avenir et l'assume, mais une
 *      charge reconduite est une dépense PRÉVUE, affichée comme prévue, là où
 *      un versement est un mouvement CONSTATÉ ;
 *   3. l'enveloppe ne porte pas de versement mensuel exploitable ;
 *   4. elle est close — on n'alimente pas un pot qu'on a fermé ;
 *   5. le mois est hors de sa fenêtre : avant son début, ou après son échéance.
 *      Une cagnotte « Vacances 2027 » ne doit pas continuer d'être alimentée en
 *      2028 parce que personne n'a pensé à retirer le réglage ;
 *   6. le mois porte déjà une des deux clés automatiques. C'est vrai aussi
 *      quand le versement a été RETIRÉ depuis : la suppression est douce, la
 *      clé demeure, et le retrait tient.
 *
 * @param {Object} params
 * @param {Object} params.enveloppe - Enveloppe normalisée
 * @param {string} params.cible - Le mois à alimenter, AAAA-MM
 * @param {string} params.moisCourant - Le mois calendaire, AAAA-MM
 * @param {Array<string>} params.clesExistantes - Clés déjà présentes sous
 *        `versements/{enveloppe}` — les clés BRUTES, et non des versements
 *        normalisés : une entrée abîmée disparaîtrait de la forme normalisée et
 *        ferait réalimenter un mois qui l'est déjà.
 * @returns {{montant: number, auteur: string, date: string}|null}
 */
export function planVersementMensuel({ enveloppe, cible, moisCourant, clesExistantes } = {}) {
  if (!CLE_MOIS.test(cible || '') || !CLE_MOIS.test(moisCourant || '')) return null;
  if (cible !== moisCourant) return null;

  if (!enveloppe || typeof enveloppe !== 'object') return null;
  if (enveloppe.cloturee === true) return null;

  const reglage = versementMensuelLisible(enveloppe.versementMensuel);
  if (!reglage) return null;

  // Les bornes se comparent au mois, jamais au jour : un versement mensuel
  // appartient au mois entier, et une échéance au 29 août n'ampute pas août.
  const debut = typeof enveloppe.debut === 'string' ? enveloppe.debut.slice(0, 7) : '';
  const fin = typeof enveloppe.fin === 'string' ? enveloppe.fin.slice(0, 7) : '';
  if (CLE_MOIS.test(debut) && cible < debut) return null;
  if (CLE_MOIS.test(fin) && cible > fin) return null;

  const deja = new Set(Array.isArray(clesExistantes) ? clesExistantes : []);
  if (clesDuMois(cible).some(cle => deja.has(cle))) return null;

  // Le premier du mois, et non le jour où l'application est ouverte : un
  // versement mensuel appartient à son mois, pas à la date où quelqu'un a
  // pensé à lancer l'application. Ouvrir le 17 ne doit pas dater du 17 une
  // décision prise pour tout le mois.
  return { ...reglage, date: `${cible}-01` };
}

/**
 * FairSplit — Ce qui reste à passer ce mois-ci
 *
 * L'application répond à « combien avons-nous dépensé ». Elle ne répondait pas
 * à « combien reste-t-il à passer », alors que la donnée est là depuis la
 * reconduction : au premier du mois, les charges fixes récurrentes sont déjà
 * inscrites, chacune à son quantième — un loyer prélevé le 5 le reste. Le
 * bilan les comptait toutes comme acquises sans jamais dire lesquelles étaient
 * encore devant.
 *
 * D'où l'écart qu'on ne pouvait pas lire : au 3 du mois, le solde annonce
 * 1 240 € de charges dont 900 ne sont pas encore sortis du compte.
 *
 * Ce module ne fait que du calcul : aucune base, aucun DOM.
 */

import { dateDuJour } from './date.js';

/**
 * Combien de charges à venir sont nommées
 *
 * Au-delà, la ligne cesse d'être lisible d'un coup d'œil et redevient la liste
 * qui existe déjà plus bas. Le compte total, lui, est toujours donné.
 */
export const PROCHAINES_NOMMEES = 3;

/**
 * Le montant d'une charge, ou zéro
 *
 * Même règle que `computeSummary` : un montant inexploitable vaut zéro, jamais
 * NaN. Une seule charge sans montant rendait autrefois le bilan entier égal à
 * NaN, et il n'y a pas de raison que le prévisionnel se laisse piéger de la
 * même façon.
 *
 * @param {Object} charge
 * @returns {number}
 */
function montant(charge) {
  return Number.isFinite(charge?.amount) ? charge.amount : 0;
}

/**
 * La date déclarée d'une charge, si elle en porte une
 *
 * `date` seulement, jamais `timestamp` : celui-ci est l'instant d'écriture en
 * base, donc toujours dans le passé. Une charge qui ne déclare pas de date ne
 * peut pas être annoncée comme à venir — l'affirmer serait inventer.
 *
 * @param {Object} charge
 * @returns {string|null} AAAA-MM-JJ, ou null
 */
function dateDeclaree(charge) {
  const date = charge?.date;
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * Partage les charges entre ce qui est passé et ce qui reste à venir
 *
 * Aucun cas particulier selon le mois consulté, et ce n'est pas un oubli : la
 * comparaison des dates suffit aux trois situations. Un mois révolu n'a plus
 * rien devant lui, un mois à venir a tout devant lui, et le mois en cours se
 * partage — c'est le même calcul.
 *
 * Les dates sont comparées comme des chaînes : AAAA-MM-JJ se classe dans
 * l'ordre chronologique, ce qui évite de fabriquer des `Date` et le fuseau qui
 * vient avec.
 *
 * @param {Object} params
 * @param {Array<Object>} [params.fixedCharges] - Charges fixes de la période
 * @param {Array<Object>} [params.variableCharges] - Charges variables de la période
 * @param {string} [params.aujourdhui] - AAAA-MM-JJ ; le jour de l'appareil par défaut
 * @returns {{passe: number, aVenir: number, total: number, nombreAVenir: number,
 *   prochaines: Array<{description: string, amount: number, date: string}>}}
 */
export function previsionnelDuMois({ fixedCharges, variableCharges, aujourdhui } = {}) {
  const jour = typeof aujourdhui === 'string' && aujourdhui ? aujourdhui : dateDuJour();

  const charges = [
    ...(Array.isArray(fixedCharges) ? fixedCharges : []),
    ...(Array.isArray(variableCharges) ? variableCharges : [])
  ].filter(charge => charge && !charge.deleted);

  const aVenirCharges = [];
  let passe = 0;
  let aVenir = 0;

  for (const charge of charges) {
    const date = dateDeclaree(charge);

    // Strictement après aujourd'hui : ce qui tombe le jour même est réputé
    // passé. Un prélèvement du 12 consulté le 12 n'est plus une prévision, et
    // l'annoncer comme tel ferait attendre une sortie déjà faite.
    if (date && date > jour) {
      aVenir += montant(charge);
      aVenirCharges.push(charge);
    } else {
      passe += montant(charge);
    }
  }

  aVenirCharges.sort(parDatePuisLibelle);

  return {
    passe,
    aVenir,
    total: passe + aVenir,
    nombreAVenir: aVenirCharges.length,
    prochaines: aVenirCharges.slice(0, PROCHAINES_NOMMEES).map(charge => ({
      description: typeof charge.description === 'string' ? charge.description : '',
      amount: montant(charge),
      date: dateDeclaree(charge)
    }))
  };
}

/**
 * La plus proche d'abord ; à date égale, l'ordre alphabétique
 *
 * Sans le second critère, deux charges du même jour changeraient de place
 * d'un rendu à l'autre — l'ordre des clés Firebase n'est pas stable, et la
 * ligne se réécrirait sous les yeux sans que rien n'ait changé.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
function parDatePuisLibelle(a, b) {
  const dateA = dateDeclaree(a) || '';
  const dateB = dateDeclaree(b) || '';
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;

  return String(a.description || '').localeCompare(String(b.description || ''), 'fr');
}

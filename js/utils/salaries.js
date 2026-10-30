/**
 * FairSplit - Résolution des salaires d'une période
 *
 * Les salaires étaient stockés globalement, alors que toute l'application
 * calcule un prorata historique mois par mois : consulter le bilan de mars
 * le recalculait avec les salaires d'aujourd'hui. Une augmentation réécrivait
 * silencieusement l'historique de toutes les périodes archivées, pourtant
 * annoncées « lecture seule ».
 *
 * Chaque période porte désormais son propre instantané de salaires
 * (periods/{uid}/{YYYY-MM}/salaries). Le nœud global salaries/{uid} reste la
 * valeur courante, servant de défaut aux périodes qui n'ont pas encore
 * d'instantané.
 */

import { parseMontant } from './montant.js';

/**
 * Normalise un couple de salaires en nombres finis positifs
 *
 * Les revenus complémentaires — allocations, loyers perçus, activité annexe —
 * sont portés par le même instantané que les salaires : ils appartiennent au
 * même mois et se lisent d'un seul coup. Absents des données antérieures, ils
 * valent zéro, ce qui laisse le calcul inchangé.
 *
 * @param {*} raw - Valeur brute (peut venir de Firebase, donc non fiable)
 * @returns {{vous: number, conjointe: number, extraVous: number, extraConjointe: number}|null} null si inexploitable
 */
export function normalizeSalaries(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const toNumber = (value) => {
    const n = parseMontant(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  return {
    vous: toNumber(raw.vous),
    conjointe: toNumber(raw.conjointe),
    extraVous: toNumber(raw.extraVous),
    extraConjointe: toNumber(raw.extraConjointe)
  };
}

/**
 * Assiette du prorata : ce dont chacun dispose réellement pour payer
 *
 * Le partage au prorata répond à une question de capacité contributive. Un
 * conjoint au salaire modeste mais percevant des allocations conséquentes se
 * voyait attribuer une part trop faible, parce que seul le salaire comptait.
 *
 * @param {*} salaries - Instantané de revenus, éventuellement partiel
 * @returns {{vous: number, conjointe: number, total: number}} Assiette par personne
 */
export function resolveIncomeBase(salaries) {
  const toNumber = (value) => {
    const n = parseMontant(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const vous = toNumber(salaries?.vous) + toNumber(salaries?.extraVous);
  const conjointe = toNumber(salaries?.conjointe) + toNumber(salaries?.extraConjointe);

  return { vous, conjointe, total: vous + conjointe };
}

/** Les quatre revenus que porte un instantané */
const CLES_REVENUS = ['vous', 'conjointe', 'extraVous', 'extraConjointe'];

/**
 * Détermine les salaires applicables à une période
 *
 * L'instantané de la période fait foi dès qu'il existe. À défaut, on retombe
 * sur les salaires globaux courants — cas d'une période créée avant la mise
 * en place des instantanés, ou d'un mois encore vierge.
 *
 * **Un instantané partiel ne fait foi que pour les clés qu'il porte.** Les
 * autres retombent sur les valeurs globales, exactement comme si l'instantané
 * n'existait pas du tout.
 *
 * L'écriture est partielle à dessein : `period.js` n'envoie que le champ
 * modifié, pour qu'une saisie faite sur un téléphone n'emporte pas celle que
 * l'autre vient de faire. Le prix en était payé ici : dès que la première
 * saisie du mois créait le nœud, les trois autres revenus valaient zéro et ne
 * retombaient plus sur rien.
 *
 * Ce n'était pas un affichage inexact, c'était le prorata qui basculait.
 * Mesuré : globaux 2500/1800, on corrige son seul salaire à 2600, l'assiette
 * du mois devient 2600 / 0 — la conjointe est réputée sans revenu, elle ne
 * doit plus rien, et un solde à zéro est un état parfaitement crédible que
 * rien à l'écran ne vient contredire.
 *
 * Le repli vaut sur la valeur globale du moment, comme pour un mois sans
 * instantané : c'est la seule valeur que l'application détienne, et cette
 * approximation est déjà celle qu'elle assume ailleurs.
 *
 * @param {*} periodSalaries - Instantané lu sous periods/{période}/salaries
 * @param {*} globalSalaries - Salaires globaux courants
 * @returns {{salaries: {vous: number, conjointe: number, extraVous: number, extraConjointe: number}, fromSnapshot: boolean}}
 */
export function resolveSalaries(periodSalaries, globalSalaries) {
  // Forme complète même en dernier recours : un consommateur qui déstructure
  // extraVous ne doit pas recevoir undefined selon le chemin emprunté.
  const globaux = normalizeSalaries(globalSalaries)
    || { vous: 0, conjointe: 0, extraVous: 0, extraConjointe: 0 };

  const instantane = normalizeSalaries(periodSalaries);
  if (!instantane) return { salaries: globaux, fromSnapshot: false };

  // `normalizeSalaries` rend zéro pour une clé absente comme pour un zéro
  // saisi : la présence se lit sur la valeur brute, jamais sur la normalisée.
  const salaries = {};
  for (const cle of CLES_REVENUS) {
    salaries[cle] = Object.hasOwn(periodSalaries, cle) ? instantane[cle] : globaux[cle];
  }

  return { salaries, fromSnapshot: true };
}

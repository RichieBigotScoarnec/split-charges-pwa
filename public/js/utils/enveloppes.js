import { parseMontant } from './montant.js';

/**
 * L'enveloppe transversale, et ce qu'elle n'est pas
 *
 * Une catégorie répond à « qu'est-ce que c'est ? » — des courses, de l'essence.
 * Une enveloppe répond à « à quoi ça se rattache ? » — cette semaine de
 * vacances, ce déménagement, ce chantier. Les deux coexistent sur la même
 * charge : le plein d'essence de la route des vacances reste de l'essence.
 *
 * D'où « transversale » : l'enveloppe traverse les catégories, et traverse
 * aussi les mois. Une semaine de vacances à cheval sur juillet et août est une
 * seule enveloppe, pas deux.
 *
 * Ce qu'une enveloppe ne fait pas, et ne doit jamais faire : changer le solde.
 * Rattacher une charge à « Vacances » ne modifie ni son montant, ni son payeur,
 * ni sa répartition. C'est une étiquette de lecture, pas un mécanisme de
 * partage. `tests/utils/enveloppes.test.js` le vérifie en repassant les mêmes
 * charges dans `computeSummary`, avec et sans enveloppe.
 *
 * Ce fichier ne contient que des fonctions pures : le module `envelopes.js`
 * s'occupe de la base et de l'écran.
 */

/** Longueur maximale d'un libellé, alignée sur les règles de sécurité */
const LONGUEUR_LIBELLE = 100;

/** Plafond d'un budget d'enveloppe, aligné sur `categoryBudgets` */
const BUDGET_MAX = 10000000;

/** Format d'une date d'enveloppe : AAAA-MM-JJ */
const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Remet une enveloppe lue en base dans une forme exploitable
 *
 * Les données arrivent de Firebase telles qu'elles y ont été écrites, par une
 * version de l'application qui n'est pas forcément celle qui les relit. Une
 * enveloppe sans `id` ou sans `label` ne peut désigner personne : elle est
 * écartée plutôt que rendue à moitié, car une entrée à moitié valide se propage
 * ensuite dans les listes déroulantes et les totaux.
 *
 * Les champs facultatifs absents valent `null`, jamais `undefined` : Firebase
 * refuse `undefined` à l'écriture, et le tri en aurait fait un cas particulier.
 *
 * @param {*} brut - Entrée telle que lue en base
 * @returns {{id: string, label: string, icon: string, budget: number|null, debut: string|null, fin: string|null, cloturee: boolean}|null}
 */
export function normaliserEnveloppe(brut) {
  if (!brut || typeof brut !== 'object') return null;

  const id = typeof brut.id === 'string' ? brut.id.trim() : '';
  const label = typeof brut.label === 'string' ? brut.label.trim() : '';
  if (!id || !label) return null;

  return {
    id,
    label: label.slice(0, LONGUEUR_LIBELLE),
    icon: typeof brut.icon === 'string' && brut.icon ? brut.icon : '🧳',
    budget: budgetLisible(brut.budget),
    debut: dateLisible(brut.debut),
    fin: dateLisible(brut.fin),
    cloturee: brut.cloturee === true
  };
}

/**
 * Normalise une liste entière, en écartant les entrées inexploitables
 *
 * @param {*} liste - Nœud `envelopes` tel que lu en base
 * @returns {Array<Object>} Enveloppes exploitables, dans l'ordre d'origine
 */
export function normaliserEnveloppes(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.map(normaliserEnveloppe).filter(Boolean);
}

/**
 * Un budget, s'il en porte un
 *
 * Zéro est une valeur légitime — une enveloppe qu'on veut suivre sans rien y
 * autoriser — mais elle est indiscernable de « pas de budget » une fois écrite.
 * On retient donc `null` pour l'absence et on n'accepte que le strictement
 * positif : une jauge sur zéro n'apprend rien, et « 0 € dépensés sur 0 € »
 * afficherait un dépassement dès le premier centime.
 *
 * @param {*} valeur - Montant saisi ou lu
 * @returns {number|null} Budget exploitable, ou null
 */
export function budgetLisible(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const montant = parseMontant(valeur);
  if (!Number.isFinite(montant) || montant <= 0 || montant > BUDGET_MAX) return null;
  return montant;
}

/**
 * Une date de fenêtre, si elle est écrite au bon format
 *
 * @param {*} valeur - Date lue ou saisie
 * @returns {string|null} AAAA-MM-JJ, ou null
 */
export function dateLisible(valeur) {
  if (typeof valeur !== 'string') return null;
  const propre = valeur.trim();
  return FORMAT_DATE.test(propre) ? propre : null;
}

/**
 * Une fenêtre est-elle cohérente ?
 *
 * Une seule des deux bornes suffit : « à partir du 1er juillet » est une
 * intention claire. Les deux à l'envers ne l'est pas, et enfermerait
 * silencieusement l'enveloppe sur un intervalle vide.
 *
 * @param {string|null} debut
 * @param {string|null} fin
 * @returns {boolean}
 */
export function fenetreCoherente(debut, fin) {
  const d = dateLisible(debut);
  const f = dateLisible(fin);
  if (!d || !f) return true;
  return d <= f;
}

/**
 * Les enveloppes encore ouvertes
 *
 * Une enveloppe close reste consultable — les vacances de l'an dernier ont eu
 * lieu — mais n'a plus à encombrer la liste au moment de saisir une dépense.
 * Sans cette distinction, la seule façon de désencombrer serait de supprimer,
 * donc de perdre le rattachement des charges passées.
 *
 * @param {Array<Object>} enveloppes
 * @returns {Array<Object>}
 */
export function enveloppesOuvertes(enveloppes) {
  return (Array.isArray(enveloppes) ? enveloppes : []).filter(e => e && !e.cloturee);
}

/**
 * Retrouve une enveloppe par son identifiant
 *
 * @param {Array<Object>} enveloppes
 * @param {string} id
 * @returns {Object|null}
 */
export function enveloppeParId(enveloppes, id) {
  if (!id) return null;
  return (Array.isArray(enveloppes) ? enveloppes : []).find(e => e && e.id === id) || null;
}

/**
 * Les charges rattachées à une enveloppe
 *
 * Les charges supprimées sont écartées : la suppression est douce, l'entrée
 * reste en base avec `deleted: true` pour la corbeille, mais elle ne doit plus
 * peser dans un total.
 *
 * @param {Array<Object>} charges - Charges fixes et variables confondues
 * @param {string} id - Identifiant d'enveloppe
 * @returns {Array<Object>}
 */
export function chargesDeLEnveloppe(charges, id) {
  if (!id) return [];
  return (Array.isArray(charges) ? charges : [])
    .filter(charge => charge && !charge.deleted && charge.envelope === id);
}

/**
 * Somme des charges rattachées à une enveloppe
 *
 * @param {Array<Object>} charges
 * @param {string} id
 * @returns {number} Total, en euros
 */
export function totalEnveloppe(charges, id) {
  return chargesDeLEnveloppe(charges, id).reduce(
    (somme, charge) => somme + (Number.isFinite(charge.amount) ? charge.amount : 0),
    0
  );
}

/** Format d'une clé de période : AAAA-MM */
const CLE_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Rassemble les charges d'une enveloppe sur toute sa durée
 *
 * L'écran de gestion ne comptait que le mois consulté, et le disait
 * honnêtement — « 320 € ce mois-ci ». Mais c'est l'inverse du besoin : une
 * enveloppe existe précisément pour traverser les mois, et le seul chiffre
 * qu'on lui demande — ce qu'ont coûté les vacances en tout — était le seul
 * qu'on ne pouvait pas obtenir. Son budget, comparé à un total mensuel, se
 * mesurait donc au mauvais nombre.
 *
 * Les charges supprimées sont écartées : elles ne comptent pas dans le solde,
 * elles ne doivent pas compter ici non plus.
 *
 * @param {Object} periods - Nœud `periods` complet, tel que lu en base
 * @param {string} id - Identifiant de l'enveloppe
 * @returns {Array<Object>} Charges, chacune portant sa période et son origine
 */
export function chargesDeLEnveloppeTousMois(periods, id) {
  if (!periods || typeof periods !== 'object' || !id) return [];

  const retenues = [];

  for (const [periode, contenu] of Object.entries(periods)) {
    if (!CLE_PERIODE.test(periode) || !contenu || typeof contenu !== 'object') continue;

    for (const collection of ['fixedCharges', 'variableCharges']) {
      const noeud = contenu[collection];
      if (!noeud || typeof noeud !== 'object') continue;

      for (const [cle, charge] of Object.entries(noeud)) {
        if (!charge || typeof charge !== 'object') continue;
        if (charge.deleted) continue;
        if (charge.envelope !== id) continue;

        retenues.push({
          ...charge,
          id: cle,
          periode,
          fixe: collection === 'fixedCharges'
        });
      }
    }
  }

  // Du plus récent au plus ancien : on regarde d'abord ce qu'on vient de
  // dépenser. À défaut de date, la période sert de repère.
  return retenues.sort((a, b) => {
    const cleA = a.date || `${a.periode}-00`;
    const cleB = b.date || `${b.periode}-00`;
    return cleB.localeCompare(cleA);
  });
}

/**
 * Ce qu'a coûté une enveloppe, et où elle en est de son budget
 *
 * @param {Array<Object>} charges - Charges de l'enveloppe, tous mois confondus
 * @param {number|null} budget - Budget déclaré, ou null
 * @returns {{total: number, nombre: number, mois: number, reste: number|null, part: number|null, depasse: boolean}}
 */
export function bilanEnveloppe(charges, budget) {
  const liste = Array.isArray(charges) ? charges : [];

  const total = liste.reduce(
    (somme, charge) => somme + (Number.isFinite(charge.amount) ? charge.amount : 0),
    0
  );

  const mois = new Set(liste.map(charge => charge.periode).filter(Boolean)).size;

  const budgetUtile = Number.isFinite(budget) && budget > 0 ? budget : null;

  return {
    total,
    nombre: liste.length,
    mois,
    reste: budgetUtile === null ? null : budgetUtile - total,
    // Bornée à 100 % pour la barre : au-delà, c'est le dépassement qui le dit,
    // pas une barre qui sortirait de son cadre.
    part: budgetUtile === null ? null : Math.min(100, Math.round((total / budgetUtile) * 100)),
    depasse: budgetUtile !== null && total > budgetUtile
  };
}

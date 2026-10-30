/**
 * FairSplit - Format Utilities
 * @description Fonctions de formatage (devise, nombres)
 */

import { getState } from '../state.js';
import { memberLabel } from './members.js';

/**
 * Format amount as currency (EUR)
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount || 0);
}

/**
 * Un pourcentage de VARIATION : signé, au dixième
 *
 * `toFixed(1)` rend « 231.2 », avec un point décimal — au milieu d'un écran où
 * tous les montants s'écrivent « 1 259,97 € ». Le raisonnement était juste et
 * consigné dans `trends.js`, mais il n'avait jamais quitté ce fichier : vingt-
 * sept autres sites continuaient d'écrire « 2909.02 € » et « 38.2 % », dont
 * les cartes de conseil du bilan — c'est-à-dire l'endroit précis où
 * l'application prétend au conseil financier. Un point décimal anglais dans un
 * montant en euros signale l'amateurisme plus sûrement qu'un défaut de calcul.
 *
 * La fabrique vit donc ici, avec `formatCurrency`, et non chez l'un de ses
 * appelants. Septième occurrence du défaut de `normalizePair` refermée de la
 * même façon : une seule fabrique, chez tout le monde.
 *
 * @param {number} valeur - En pourcentage, déjà multiplié par cent
 * @returns {string} Par exemple « +12,3 % »
 */
export function pourcentageDeVariation(valeur) {
  const signe = valeur > 0 ? '+' : '';
  return `${signe}${Number(valeur || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} %`;
}

/**
 * Un pourcentage de PART : entier, sans signe
 *
 * Une part se lit à l'unité près — « 38 % de vos revenus » —, là où une
 * variation mérite son dixième. Deux mesures différentes, deux fabriques ;
 * mais une seule par mesure. Le rapport mensuel écrivait « 38.2 % » quand le
 * panneau des tendances affichait « 38 % » pour ce même taux d'effort : deux
 * formats et deux précisions pour un seul chiffre, à un onglet d'écart.
 *
 * @param {number} valeur - En pourcentage, déjà multiplié par cent
 * @returns {string} Par exemple « 38 % »
 */
export function pourcentageDePart(valeur) {
  return `${Math.round(Number(valeur) || 0)} %`;
}

/** Caractères à neutraliser, et leur entité */
const ENTITES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/**
 * Neutralise une chaîne destinée à être injectée en HTML
 *
 * L'implémentation précédente passait par `textContent` puis `innerHTML`. La
 * sérialisation d'un nœud texte n'échappe que `&`, `<` et `>` : les guillemets
 * en ressortaient intacts. C'est sans conséquence dans un contenu d'élément —
 * et c'était la justification retenue — mais la moitié des appels injectent le
 * résultat dans un attribut : `aria-label="Modifier ${escapeHtml(description)}"`.
 * Une description contenant un guillemet refermait donc l'attribut et en
 * ouvrait d'autres sur la même balise. Un échappement qui dépend du contexte
 * d'appel n'en est pas un : les cinq caractères sont traités ici.
 *
 * `0` et `false` étaient par ailleurs rendus comme une chaîne vide, la garde
 * portant sur la fausseté et non sur l'absence.
 *
 * @param {*} unsafe - Valeur à échapper
 * @returns {string} Chaîne sûre en contenu comme en attribut
 */
export function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe).replace(/[&<>"']/g, (caractere) => ENTITES[caractere]);
}

/**
 * Formate le nom du payeur pour affichage
 * @param {string} paidBy - Valeur du payeur ('vous', 'conjointe', 'joint')
 * @returns {string} Nom lisible
 */
export function formatPaidBy(paidBy) {
  // Sept appelants passent par ici : c'est le seul endroit ou une cle de
  // stockage devient un libelle. Les prenoms y sont donc resolus une fois.
  return memberLabel(paidBy, getState('members'));
}

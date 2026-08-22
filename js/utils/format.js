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

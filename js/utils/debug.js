/**
 * FairSplit - Système de logging par niveaux
 * @description Centralise tous les logs de l'application
 *
 * Niveaux :
 *   1 = ERROR  — erreurs critiques uniquement
 *   2 = WARN   — warnings + erreurs
 *   3 = INFO   — infos + warnings + erreurs
 *   4 = DEBUG  — tout (dev)
 *
 * Le fichier prescrivait de passer à 1 avant un déploiement, et est resté à 4
 * en production : la console recevait tout, y compris les coordonnées GPS et
 * l'état complet de la saisie rapide. Le niveau 2 conserve ce qui sert
 * réellement après coup — avertissements et erreurs, « Charge invalide
 * ignorée » en tête — et tait le reste. Le journal de diagnostic, lui, garde
 * sa trace complète et se consulte par ?diag=1.
 *
 * Passer à 4 pour développer.
 */

const CURRENT_LEVEL = 2;

/**
 * Log niveau INFO (3)
 * @param {string} message
 * @param {...*} args - Données supplémentaires optionnelles
 */
export function log(message, ...args) {
  if (CURRENT_LEVEL >= 3) {
    args.length > 0 ? console.log(message, ...args) : console.log(message);
  }
}

/**
 * Log niveau WARN (2)
 * @param {string} message
 * @param {...*} args
 */
export function warn(message, ...args) {
  if (CURRENT_LEVEL >= 2) {
    args.length > 0 ? console.warn(message, ...args) : console.warn(message);
  }
}

/**
 * Log niveau ERROR (1) — toujours affiché
 * @param {string} message
 * @param {...*} args
 */
export function error(message, ...args) {
  args.length > 0 ? console.error(message, ...args) : console.error(message);
}

// ===== MODULE : REPORT DU SOLDE ENTRE MOIS =====
//
// Sans report, un mois non soldé s'évapore : août se termine avec 500 € dus,
// septembre repart de zéro et la dette n'apparaît plus nulle part. Le couple
// qui ne règle pas ses comptes tous les mois perd la trace de ce qu'il se doit.
//
// Le report est une politique comptable, pas un choix mensuel : il vaut pour
// tous les mois ou pour aucun, et se règle une fois. Il est désactivé par
// défaut — l'activer change la lecture de tous les mois passés, ce qui doit
// rester une décision explicite.

import { setState, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { computeBalanceChain } from '../utils/calculations.js';
import { log, warn } from '../utils/debug.js';

/** Chemin du réglage en base — global, hors des périodes */
const SETTING_PATH = 'carryOverEnabled';

/**
 * Initialise le module de report
 *
 * Le réglage est lu avant tout calcul : afficher un bilan sans report puis le
 * corriger une seconde plus tard ferait clignoter le solde.
 *
 * @returns {Promise<void>}
 */
export async function initCarryOver() {
  const toggle = document.getElementById('carryOverToggle');

  try {
    const { dbGet } = await import('../db.js');
    const enabled = (await dbGet(SETTING_PATH)) === true;
    setState('carryOverEnabled', enabled);
    if (toggle) toggle.checked = enabled;
  } catch (error) {
    // Sans réglage lisible, on retombe sur le comportement historique.
    warn('⚠️ Réglage du report illisible, report désactivé :', error);
    setState('carryOverEnabled', false);
    if (toggle) toggle.checked = false;
  }

  window.toggleCarryOver = toggleCarryOver;
  log('🔗 Report du solde initialisé');
}

/**
 * Active ou désactive le report, puis recalcule le bilan affiché
 *
 * Appelé par la délégation `data-on-change`, qui transmet la valeur de
 * l'élément — inutilisable pour une case à cocher. On relit donc l'état réel
 * de la case.
 *
 * @returns {Promise<void>}
 */
export async function toggleCarryOver() {
  const toggle = document.getElementById('carryOverToggle');
  if (!toggle) return;

  const enabled = toggle.checked;
  setState('carryOverEnabled', enabled);

  try {
    const { dbSet } = await import('../db.js');
    await dbSet(SETTING_PATH, enabled);
  } catch (error) {
    warn('⚠️ Report non enregistré :', error);
    toast.error('Réglage non enregistré');
  }

  await refreshCarryOver();

  const { calculateSummary } = await import('./summary.js');
  calculateSummary();

  toast.info(enabled
    ? 'Report activé : les soldes non réglés passent au mois suivant'
    : 'Report désactivé : chaque mois repart de zéro');
}

/**
 * Recalcule le report applicable à la période courante
 *
 * Le report d'un mois ne dépend que des mois qui le précèdent : il suffit de
 * le recalculer au changement de période, pas à chaque charge ajoutée. Une
 * seule lecture suffit — le nœud `periods` porte l'historique complet.
 *
 * @returns {Promise<number>} Le report appliqué, nul si la fonction est inactive
 */
export async function refreshCarryOver() {
  if (!getState('carryOverEnabled')) {
    setState('carryOver', 0);
    return 0;
  }

  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    setState('carryOver', 0);
    return 0;
  }

  try {
    const { dbGet } = await import('../db.js');
    const [periods, globalSalaries] = await Promise.all([
      dbGet('periods'),
      dbGet('salaries')
    ]);

    const chain = computeBalanceChain(periods, {
      shareMode: getState('shareMode') || 'prorata',
      customPercents: getState('customPercents') || { vous: 50, conjointe: 50 },
      globalSalaries
    });

    // Un mois encore absent de la base n'a pas d'entrée : son report est
    // alors le total du dernier mois qui le précède.
    const carry = chain.has(currentPeriod)
      ? chain.get(currentPeriod).carry
      : lastTotalBefore(chain, currentPeriod);

    setState('carryOver', carry);
    return carry;
  } catch (error) {
    // Un report indisponible ne doit pas priver du bilan du mois : on retombe
    // sur le comportement sans report plutôt que de ne rien afficher.
    warn('⚠️ Report du solde indisponible, bilan calculé sans report :', error);
    setState('carryOver', 0);
    return 0;
  }
}

/**
 * Total cumulé du dernier mois antérieur à une période donnée
 * @param {Map<string, {total: number}>} chain - Chaîne des soldes, ordre chronologique
 * @param {string} period - Période de référence (AAAA-MM)
 * @returns {number} Le total à reporter, 0 si aucun mois antérieur
 */
function lastTotalBefore(chain, period) {
  let carry = 0;
  for (const [key, value] of chain) {
    if (key >= period) break;
    carry = value.total;
  }
  return carry;
}

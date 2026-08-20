// ===== MODULE : RECONDUCTION DES CHARGES RÉCURRENTES =====
//
// Les charges fixes portent depuis toujours un indicateur `recurring`, activé
// par défaut, et le code savait déjà les recopier d'un mois sur l'autre. Mais
// rien ne déclenchait jamais cette copie :
//
//   — la bannière « Nouveau mois détecté » n'était affichée par aucun chemin
//     de code, et ses trois boutons appelaient des fonctions absentes de
//     `window` ;
//   — le bouton de reconduction manuelle, #reconductPeriodBtn, n'existait pas
//     dans le HTML ;
//   — la proposition automatique exigeait de consulter un mois passé pendant
//     les trois premiers jours du mois courant, un cas de figure improbable.
//
// Chaque mois, il fallait donc ressaisir le loyer. La reconduction se fait
// désormais d'elle-même, à l'ouverture d'un mois neuf.

import { getState } from '../state.js';
import { getFirebaseDatabase } from '../firebase-init.js';
import { getDataPath } from '../db.js';
import { toast } from '../components/toast.js';
import { getCurrentPeriod, formatPeriod } from '../utils/date.js';
import { planRecurrence } from '../utils/recurrence.js';
import { log, error as logError } from '../utils/debug.js';

let database = null;

/**
 * Initialise le module de reconduction
 */
export function initReconduction() {
  database = getFirebaseDatabase();
  log('🔁 Reconduction des charges récurrentes initialisée');
}

/**
 * Reconduit les charges récurrentes dans la période affichée, si nécessaire
 *
 * Appelée à chaque ouverture de mois. Elle n'écrit qu'une seule fois par mois
 * cible : l'empreinte `reconductedFrom` part dans la même écriture atomique
 * que les charges. Sans cette empreinte, supprimer une charge reconduite la
 * ferait réapparaître à la prochaine ouverture du mois.
 *
 * @returns {Promise<number>} Nombre de charges reconduites
 */
export async function applyRecurringCharges() {
  if (!database) return 0;

  const target = getState('currentPeriod');
  if (!target) return 0;

  try {
    const { dbGet } = await import('../db.js');
    const periods = await dbGet('periods');

    const plan = planRecurrence({
      target,
      currentMonth: getCurrentPeriod(),
      periods
    });
    if (!plan) return 0;

    const updates = {};

    for (const charge of plan.charges) {
      const key = database.ref().push().key;
      updates[getDataPath(`periods/${target}/fixedCharges/${key}`)] = {
        ...charge,
        timestamp: Date.now()
      };
    }

    // L'empreinte dans la même écriture que les charges : une reconduction
    // partiellement appliquée se rejouerait sinon indéfiniment.
    updates[getDataPath(`periods/${target}/reconductedFrom`)] = plan.source;

    await database.ref().update(updates);

    const { loadFixedCharges } = await import('./fixed-charges.js');
    await loadFixedCharges();

    const { calculateSummary } = await import('./summary.js');
    calculateSummary();

    const nombre = plan.charges.length;
    toast.info(`${nombre} charge${nombre > 1 ? 's' : ''} fixe${nombre > 1 ? 's' : ''} reconduite${nombre > 1 ? 's' : ''} depuis ${formatPeriod(plan.source)}`);
    log(`🔁 ${nombre} charge(s) reconduite(s) de ${plan.source} vers ${target}`);

    return nombre;
  } catch (error) {
    // Un mois sans reconduction reste utilisable : on saisit à la main.
    logError('❌ Reconduction impossible :', error);
    return 0;
  }
}

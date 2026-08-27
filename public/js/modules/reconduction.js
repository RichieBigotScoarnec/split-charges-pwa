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
import { reporterDansLaPeriode } from '../utils/date.js';
import { toast } from '../components/toast.js';
import { getCurrentPeriod, formatPeriod } from '../utils/date.js';
import { planRecurrence } from '../utils/recurrence.js';
import { log, error as logError } from '../utils/debug.js';

let database = null;


/**
 * Initialise le module de reconduction
 */
export function initReconduction() {
  // applyRecurringCharges obtient la base elle-même : cette fonction ne sert
  // plus qu'à la trace de démarrage, et l'ordre des étapes ne la contraint pas.
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
 * @param {Object} [options]
 * @param {Object} [options.historique] - Le nœud `periods` lu dans la MÊME
 *   séquence. Omis, la fonction lit elle-même.
 * @returns {Promise<number>} Nombre de charges reconduites
 */
export async function applyRecurringCharges({ historique } = {}) {
  // La référence est obtenue ici plutôt que d'être héritée d'initReconduction.
  // Celle-ci s'exécutait après le chargement du mois : `database` était encore
  // nulle au moment de l'appel, la fonction sortait sans rien dire, et la
  // reconduction ne se déclenchait jamais au démarrage -- seulement si l'on
  // changeait de mois à la main. Ne pas dépendre d'un ordre d'initialisation
  // vaut mieux que de le documenter.
  database = database || getFirebaseDatabase();
  if (!database) return 0;

  const target = getState('currentPeriod');
  if (!target) return 0;

  try {
    const { dbGet } = await import('../db.js');
    const periods = historique === undefined ? await dbGet('periods') : historique;

    const plan = planRecurrence({
      target,
      currentMonth: getCurrentPeriod(),
      periods
    });
    if (!plan) return 0;

    // Réserver l'empreinte avant de copier quoi que ce soit.
    //
    // Lire « pas encore reconduit » puis écrire n'est pas atomique : deux
    // appels concurrents passent tous deux la vérification et copient chacun
    // les charges. Le cas n'est pas théorique — deux téléphones ouvrant
    // l'application le même matin suffisent, et le mois se retrouve avec
    // chaque charge fixe en double.
    //
    // `transaction` tranche côté serveur : un seul appel obtient la marque.
    const empreinte = database.ref(getDataPath(`periods/${target}/reconductedFrom`));
    const reservation = await empreinte.transaction(
      actuel => (actuel === null ? plan.source : undefined));

    if (!reservation.committed) {
      log(`🔁 Reconduction vers ${target} déjà réservée par un autre appel`);
      return 0;
    }

    const updates = {};

    for (const charge of plan.charges) {
      const key = database.ref().push().key;
      // La date suit le mois, en gardant son quantième : un loyer prélevé le 5
      // reste prélevé le 5. Recopiée telle quelle, la date de janvier ferait
      // afficher « 5 janv. » sur la charge de février — une charge qui dit
      // appartenir à un mois où elle ne figure pas.
      const date = reporterDansLaPeriode(charge.date, target);
      updates[getDataPath(`periods/${target}/fixedCharges/${key}`)] = {
        ...charge,
        // `null` supprimerait la clé, ce qui est le bon comportement pour une
        // charge d'avant ce champ : mieux vaut aucune date qu'une date d'un
        // autre mois.
        ...(date ? { date } : { date: null }),
        timestamp: Date.now()
      };
    }

    // Les charges variables reconduites repartent **sans leur montant**.
    //
    // Une charge variable est par définition d'un montant qui change : l'essence,
    // la cantine, le panier de la semaine. La recopier avec son chiffre
    // inventerait de l'argent — et pas seulement à l'écran de celui qui ouvre
    // l'application : le solde est partagé, et il serait faux pour les deux
    // jusqu'à ce que quelqu'un corrige. Dans une application dont tout l'objet
    // est un solde exact, c'est le défaut le plus cher qu'on puisse introduire.
    //
    // Zéro ne fausse rien : `calculations.js` le compte pour zéro, et la ligne
    // se signale « à compléter » dans la liste.
    for (const charge of plan.variables || []) {
      const key = database.ref().push().key;
      const date = reporterDansLaPeriode(charge.date, target);
      updates[getDataPath(`periods/${target}/variableCharges/${key}`)] = {
        ...charge,
        amount: 0,
        ...(date ? { date } : { date: null }),
        timestamp: Date.now()
      };
    }

    // Le mois naissant fige le mode de partage qui lui est appliqué.
    //
    // `calculations.js` lit déjà `period.shareMode || shareMode` — « un mois
    // peut avoir figé son propre mode de partage » — mais personne n'écrivait
    // jamais ce champ, et les règles l'auraient refusé. Le repli était donc
    // toujours pris : toute la chaîne de report se rejouait avec le mode du
    // jour. Mesuré : un juillet réglé, remboursé et clos ressuscitait une
    // dette de 125 € le jour où le foyer décidait de passer au 50-50 — pour
    // l'avenir, croyait-il.
    //
    // L'empreinte part dans la même écriture atomique que les charges : un
    // mois reconduit porte le mode sous lequel il l'a été.
    const modeDuMois = getState('shareMode');
    if (modeDuMois) {
      updates[getDataPath(`periods/${target}/shareMode`)] = modeDuMois;

      // Les pourcentages FONT PARTIE du mode « custom ».
      //
      // Figer le mode seul ne protégeait rien sur celui-là : les pourcentages
      // restaient globaux, donc au présent. Passer de 70/30 à 60/40 « pour
      // l'avenir » rouvrait un mois déjà soldé et remboursé — 100 € mesurés,
      // reportés ensuite de mois en mois.
      //
      // Le prorata n'en a pas besoin (ses paramètres sont les salaires, que
      // `backfillPeriodSalaries` fige déjà) et le 50-50 n'a rien à figer.
      if (modeDuMois === 'custom') {
        const parts = getState('customPercents');
        const vous = Number(parts?.vous);
        const conjointe = Number(parts?.conjointe);
        // Les règles exigent une somme de 100 : une paire hors-somme serait
        // refusée APRÈS le toast de succès, et rendrait l'empreinte.
        if (Number.isFinite(vous) && Number.isFinite(conjointe) && vous + conjointe === 100) {
          updates[getDataPath(`periods/${target}/customPercents`)] = { vous, conjointe };
        }
      }
    }

    // Rendre l'empreinte si la copie échoue.
    //
    // L'empreinte était posée avant la copie et n'était jamais reprise. Une
    // coupure ou un refus de règle entre les deux lignes laissait le mois
    // marqué « reconduit » sans une seule charge — et `planRecurrence` s'y
    // arrête pour de bon : « Déjà reconduit : l'empreinte fait foi, même si
    // les charges ont depuis été supprimées ». Aucune réouverture ne
    // réessayait, et rien à l'écran ne le disait : le loyer disparaissait du
    // mois, définitivement, en silence.
    //
    // La rendre remet le mois dans l'état où la transaction l'a trouvé, donc
    // reconductible à la prochaine ouverture. Si cette écriture-là échoue
    // aussi — la liaison est coupée, c'est le cas probable — le mois reste
    // marqué : on ne peut pas faire mieux depuis l'appareil, mais l'erreur
    // d'origine remonte au lieu d'être avalée.
    try {
      await database.ref().update(updates);
    } catch (echec) {
      await empreinte.set(null).catch(() => {});
      throw echec;
    }

    const { loadFixedCharges } = await import('./fixed-charges.js');
    await loadFixedCharges();

    const { calculateSummary } = await import('./summary.js');
    calculateSummary();

    const nombre = plan.charges.length;
    toast.info(`${nombre} charge${nombre > 1 ? 's' : ''} fixe${nombre > 1 ? 's' : ''} reconduite${nombre > 1 ? 's' : ''} depuis ${formatPeriod(plan.source)}`);
    log(`🔁 ${nombre} charge(s) reconduite(s) de ${plan.source} vers ${target}`);

    return nombre;
  } catch (error) {
    // Un mois sans reconduction reste utilisable : on saisit à la main. Mais
    // il faut le dire — un mois qui devait s'ouvrir avec le loyer et qui
    // s'ouvre vide se lit comme un mois où il n'y a rien à payer.
    logError('❌ Reconduction impossible :', error);
    toast.error('Charges fixes non reconduites — elles le seront à la prochaine ouverture du mois');
    return 0;
  }
}

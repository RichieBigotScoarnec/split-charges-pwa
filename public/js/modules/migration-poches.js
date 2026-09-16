/**
 * FairSplit — Les dépenses personnelles rejoignent leur poche
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION RÉPARE, ET POURQUOI ELLE VIT DANS L'APPLICATION
 *
 * Le lot P1a a posé `household/personnel/{qui}` et son mur : le propriétaire
 * toujours, l'autre seulement sous aval. Il n'a déplacé AUCUNE donnée — les
 * dépenses `perimetre: 'solo'` sont restées sous `periods/`, donc lisibles par
 * l'autre personne sans aucun aval. La réalité était l'inverse de la crainte :
 * ce qu'on croyait exposé était protégé, ce qu'on saisissait réellement ne
 * l'était pas.
 *
 * C'est ce que ce module termine. Il ne peut pas être un script hors ligne, et
 * c'est structurel : **personne n'a le droit d'écrire dans la poche de
 * l'autre.** Aucun compte ne peut donc migrer les deux. Chaque compte déplace
 * les SIENNES, à l'ouverture, et l'autre fera de même — un mois où l'un des
 * deux n'ouvre pas l'application laisse simplement ses dépenses là où elles
 * étaient, c'est-à-dire dans l'état d'avant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS PROPRIÉTÉS QUE CE MODULE TIENT
 *
 * 1. **Atomique par charge.** `{ destination: charge, origine: null }` part en
 *    une seule mise à jour multi-chemins : `update` applique tout ou rien. En
 *    deux écritures, un échec entre les deux laisserait la charge comptée deux
 *    fois — dans les deux poches — ou perdue.
 * 2. **Idempotente.** Elle lit le nœud COMMUN, jamais le nœud fusionné : une
 *    charge déjà déplacée n'y est plus, donc rien à faire. Relancer la
 *    migration à chaque ouverture ne coûte qu'une lecture.
 * 3. **Elle ne migre que ce dont le propriétaire est établi.** `perimetre.js`
 *    tient qu'une charge solo dont le payeur n'est pas une personne du foyer
 *    n'a pas de propriétaire ; `cheminDeLaCharge` lui rend alors le chemin
 *    commun, et le déplacement est vide. Aucun traitement spécial : le cas ne
 *    se distingue pas d'une charge commune, et c'est la bonne lecture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET DEUX ÉTATS OÙ ELLE NE FAIT RIEN, À DESSEIN
 *
 * Hors ligne, `dbGet` ne lève pas : il sert le miroir. Une migration décidée
 * sur une valeur mémorisée déplacerait des charges d'après un instantané
 * périmé, et `dbUpdate` la mettrait en file — donc appliquerait plus tard une
 * décision prise sur de vieilles données. Même chose quand des écritures
 * attendent encore de partir : l'appareil et la base ne sont pas d'accord.
 *
 * Dans les deux cas on renonce en le journalisant. La migration se retentera à
 * la prochaine ouverture, et l'état d'attente est exactement l'état d'avant.
 */

import { getState } from '../state.js';
import { log, warn } from '../utils/debug.js';
import { noter } from '../utils/diagnostics.js';
import { EMPLACEMENTS } from '../utils/confidentialite.js';
import { proprietaireDuSolo } from '../utils/perimetre.js';
import { cheminDeLaCharge } from '../poches.js';

/** Les deux collections de charges d'une période */
const COLLECTIONS = Object.freeze(['fixedCharges', 'variableCharges']);

/** Format d'une clé de période : AAAA-MM */
const CLE_PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Les écritures qui sortent MES dépenses personnelles du commun
 *
 * Fonction pure, et c'est ce qui la rend vérifiable : c'est la partie où une
 * erreur coûterait de l'historique.
 *
 * @param {Object} params
 * @param {Object} params.commun - Nœud `periods` COMMUN, tel que lu en base
 * @param {string} params.moi - Emplacement du compte connecté
 * @returns {{ecritures: Object, nombre: number, restantes: number}}
 *   `restantes` : les dépenses personnelles de l'autre, qu'on voit dans le
 *   commun et qu'on n'a pas le droit de déplacer.
 */
export function planMigration({ commun, moi }) {
  const ecritures = {};
  let restantes = 0;

  if (!commun || typeof commun !== 'object' || !moi) {
    return { ecritures, nombre: 0, restantes };
  }

  for (const [periode, contenu] of Object.entries(commun)) {
    if (!CLE_PERIODE.test(periode) || !contenu || typeof contenu !== 'object') continue;

    for (const collection of COLLECTIONS) {
      const charges = contenu[collection];
      if (!charges || typeof charges !== 'object') continue;

      for (const [id, charge] of Object.entries(charges)) {
        if (!charge || typeof charge !== 'object') continue;

        const proprietaire = proprietaireDuSolo(charge);
        if (!proprietaire) continue;

        if (proprietaire !== moi) {
          restantes += 1;
          continue;
        }

        const destination = cheminDeLaCharge(charge, { periode, collection, id });
        // Le chemin se DÉRIVE ; l'origine, elle, est celle où l'on a trouvé la
        // charge — dans le commun, par construction de la lecture.
        const origine = `periods/${periode}/${collection}/${id}`;
        if (destination === origine) continue;

        ecritures[destination] = charge;
        ecritures[origine] = null;
      }
    }
  }

  return { ecritures, nombre: Object.keys(ecritures).length / 2, restantes };
}

/**
 * Déplace mes dépenses personnelles vers ma poche, si besoin
 *
 * @returns {Promise<number>} Nombre de charges déplacées
 */
export async function migrerMaPoche() {
  // LU SANS REPLI, et c'est délibéré. `normaliserEmplacement` rend `vous` pour
  // toute valeur inconnue — le bon comportement partout ailleurs, où un repli
  // ne coûte qu'un libellé. Ici il déciderait DANS QUELLE POCHE atterrit une
  // dépense : un état incomplet enverrait les dépenses de l'un chez l'autre.
  // Ne pas savoir de qui elles sont est une raison de ne rien déplacer.
  const moi = getState('emplacementCourant');
  if (!EMPLACEMENTS.includes(moi)) {
    warn(`[Migration] emplacement inconnu (${JSON.stringify(moi)}) — rien n'est déplacé`);
    return 0;
  }

  const { dbGet, dbUpdate, liaisonRompue, saisiesEnAttente } = await import('../db.js');

  if (liaisonRompue() || saisiesEnAttente() > 0) {
    // Voir « deux états où elle ne fait rien » en tête de fichier.
    noter('migration', 'migration des poches différée', {
      motif: liaisonRompue() ? 'liaison rompue' : 'écritures en attente',
      enAttente: saisiesEnAttente()
    });
    log('📦 Migration des poches différée : l\'appareil et la base ne sont pas d\'accord');
    return 0;
  }

  const commun = await dbGet('periods');
  const { ecritures, nombre, restantes } = planMigration({ commun, moi });

  if (nombre === 0) {
    if (restantes > 0) {
      log(`📦 ${restantes} dépense(s) personnelle(s) de l'autre encore dans le commun`);
    }
    return 0;
  }

  await dbUpdate(undefined, ecritures);

  log(`📦 ${nombre} dépense(s) personnelle(s) déplacée(s) dans votre poche`);
  noter('migration', 'poches personnelles migrées', { nombre, restantes });

  return nombre;
}

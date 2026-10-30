/**
 * FairSplit — Enregistrer la MODIFICATION d'une charge, là où elle doit vivre
 *
 * Les deux formulaires — charges variables, charges fixes — portaient chacun
 * leur copie du même geste : chercher l'ancienne charge, demander la bascule
 * de poche, écrire. Deux rédactions d'un geste qui décide où vit l'argent
 * finissent par ranger différemment la même charge (règles 2 et 4). Elles
 * vivent ici, une fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'UNE MODIFICATION PEUT DÉPLACER
 *
 *   - la POCHE, quand « perso » change (P1b) : le geste se DEMANDE, parce que
 *     décocher « perso » par mégarde publie une dépense ;
 *   - le MOIS, quand le mois de la date change (2026-10-29) : la date saisie
 *     EST la demande, un toast nomme le mois d'arrivée.
 *
 * ⟲ Le second était un choix inverse jusqu'au 2026-10-29 — « la charge reste
 * dans son mois, même si sa date change ; un déplacement doit se demander, pas
 * se subir ». Révoqué sur mesure : une charge de 182 € datée du 1er novembre
 * pesait sur octobre, parce que l'ajout rangeait par la date et la
 * modification par l'écran. Le grief d'origine — la charge disparaît de la
 * liste affichée — est tenu par le toast, qui dit où elle est partie.
 *
 * Les deux peuvent arriver ensemble : UNE confirmation, UNE écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HORS LIGNE, UN DÉPLACEMENT EST REFUSÉ — EN LE DISANT
 *
 * Une écriture multi-chemins vise la racine, et `operationRejouable` refuse de
 * la différer. La découper en deux écritures mises en file la rendrait non
 * atomique : un rejeu interrompu laisserait la charge deux fois, ou nulle part.
 * Le refus est donc juste ; ce qui manquait, c'est de le dire avant d'avoir
 * demandé quoi que ce soit.
 */

import { getState } from '../state.js';
import { toast } from '../components/toast.js';
import { showConfirmModal, TON } from '../components/modal.js';
import { cheminDeLaCharge, ecrituresDuDeplacement, lirePeriodes } from '../poches.js';
import { questionDeBascule } from '../utils/bascule-poche.js';
import { emplacementOppose, EMPLACEMENTS } from '../utils/confidentialite.js';
import { normaliserEmplacement } from '../utils/members.js';
import { estSolo, proprietaireDuSolo } from '../utils/perimetre.js';
import { getCurrentPeriod } from '../utils/date.js';
import {
  periodeDeDestination, messageDuDeplacement, avertissementDeReconduction
} from '../utils/changement-de-mois.js';
import { ecartLaisseParLaCorrection } from '../utils/correction-retroactive.js';
import { warn } from '../utils/debug.js';

/**
 * Ce que la reconduction dira du déplacement d'une charge fixe, ou rien
 *
 * Lu AVANT l'écriture : c'est le mois tel que la reconduction le trouverait
 * sans cette charge. Une lecture impossible ne bloque pas l'enregistrement —
 * l'avertissement est un renseignement, pas une garde.
 *
 * @returns {Promise<string|null>}
 */
async function ceQueDiraLaReconduction({ charge, id, origine, cible }) {
  try {
    const { dbGet, cheminDuPersonnel } = await import('../db.js');
    // Sans repli, comme `reconduction.js` : une poche devinée ferait lire
    // l'empreinte de l'autre.
    const brut = getState('emplacementCourant');
    const moi = EMPLACEMENTS.includes(brut) ? brut : null;
    const empreintePersonnelle = moi && proprietaireDuSolo(charge) === moi
      ? await dbGet(cheminDuPersonnel(moi, `periods/${cible}/reconductedFrom`))
      : null;

    return avertissementDeReconduction({
      charge, id, origine, cible,
      moisCourant: getCurrentPeriod(),
      periods: await lirePeriodes(),
      moi,
      empreintePersonnelle
    });
  } catch (erreur) {
    warn('[Édition] Reconduction non consultée :', erreur?.message || erreur);
    return null;
  }
}

/**
 * Écrit la modification d'une charge existante, dans le mois et la poche où
 * elle doit vivre
 *
 * @param {Object} params
 * @param {'variableCharges'|'fixedCharges'} params.collection
 * @param {string} params.id
 * @param {Object} params.chargeData - La charge telle que le formulaire la rend
 * @param {string} params.periode - Le mois où elle vit, c'est-à-dire le mois affiché
 * @returns {Promise<{ecrit: boolean, periodeCible?: string, avertissement?: string|null}>}
 */
export async function ecrireUneModification({ collection, id, chargeData, periode }) {
  const { dbUpdate, liaisonRompue } = await import('../db.js');

  const ancienne = (getState(collection) || []).find(c => c.id === id);
  // Sans l'ancienne, on ne sait pas si la DATE a changé : déplacer à l'aveugle
  // reviendrait au critère « le mois où elle vit », refusé.
  const periodeCible = ancienne
    ? periodeDeDestination({ ancienne, nouvelleDate: chargeData.date, periodeActuelle: periode })
    : periode;

  const deplacement = ancienne && ecrituresDuDeplacement({
    avant: ancienne, apres: chargeData, periode, periodeCible, collection, id
  });

  if (!deplacement) {
    await dbUpdate(cheminDeLaCharge(chargeData, { periode, collection, id }), chargeData);
    toast.success('Charge modifiée');
    return { ecrit: true, periodeCible: periode, avertissement: null };
  }

  if (liaisonRompue()) {
    toast.error('Hors ligne : une charge ne change ni de mois ni de poche sans réseau. '
      + 'Rien n\'a été modifié.');
    return { ecrit: false };
  }

  // LA BASCULE « perso » SE DEMANDE — et seulement elle. Comparée au même
  // mois, pour qu'un changement de date seul ne la déclenche pas.
  const changeDePoche = cheminDeLaCharge(ancienne, { periode, collection, id })
    !== cheminDeLaCharge(chargeData, { periode, collection, id });

  if (changeDePoche) {
    const accepte = await showConfirmModal(questionDeBascule({
      versLePersonnel: estSolo(chargeData),
      autre: emplacementOppose(normaliserEmplacement(getState('emplacementCourant'))),
      members: getState('members'),
      description: chargeData.description,
      montant: chargeData.amount
    }), { libelle: 'Déplacer', ton: TON.NORMAL });
    // Refusé, RIEN n'est écrit : appliquer les autres champs en laissant la
    // case où elle était rendrait un formulaire qui obéit à moitié.
    if (!accepte) {
      toast.info('Rien n\'a été modifié');
      return { ecrit: false };
    }
  }

  const avertissement = collection === 'fixedCharges' && periodeCible !== periode
    ? await ceQueDiraLaReconduction({ charge: chargeData, id, origine: periode, cible: periodeCible })
    : null;

  // ATOMIQUE : en deux écritures, un échec laisserait la charge à deux
  // endroits — comptée deux fois — ou à aucun.
  await dbUpdate(undefined, deplacement);
  // Dit tout de suite, avant le rechargement : si celui-ci échouait, l'écran ne
  // doit pas annoncer une erreur de sauvegarde sur une écriture réussie.
  toast.success(messageDuDeplacement(periodeCible));
  return { ecrit: true, periodeCible, avertissement };
}

/**
 * Dit ce qu'un déplacement laisse derrière lui — APRÈS le recalcul du bilan
 *
 * Après, parce que l'écart d'un mois soldé se lit sur `dernierSolde`, que le
 * bilan recalculé vient de poser. Le succès, lui, est dit dès l'écriture.
 *
 * @param {Object} params
 * @param {{periodeCible: string, avertissement: string|null}} params.resultat
 * @param {string} params.periode - Le mois où la charge vivait
 * @param {number} params.soldeAvant - `dernierSolde` relevé avant l'écriture
 * @returns {void}
 */
export function signalerLaModification({ resultat, periode, soldeAvant }) {
  if (resultat.periodeCible === periode) return;

  if (resultat.avertissement) toast.warning(resultat.avertissement);

  // Le mois qu'on quitte a pu être soldé. Report activé, l'écart rejoint la
  // chaîne ; désactivé, il reste là-bas, et rien d'autre ne le dirait.
  const ecart = ecartLaisseParLaCorrection({
    periode,
    moisCourant: getCurrentPeriod(),
    reportActif: Boolean(getState('carryOverEnabled')),
    soldeAvant,
    soldeApres: getState('dernierSolde')
  });
  if (ecart) toast.info(ecart);
}

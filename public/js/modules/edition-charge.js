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
 * UNE CONSÉQUENCE SUR L'ARGENT SE CONFIRME AVANT, JAMAIS APRÈS
 *
 * Vu à l'écran le 2026-11-01, en bac à sable : un abonnement d'octobre redaté
 * au 05/11, novembre déjà reconduit — deux exemplaires en novembre, 8 € au lieu
 * de 4 €. Un message a paru PUIS disparu, sans rien demander : il arrivait
 * après l'écriture. Un déplacement qui crée un doublon, prive un mois de sa
 * reconduction ou laisse un écart sur un mois soldé se CONFIRME désormais
 * avant — même patron que la bascule « perso ». Annuler n'écrit rien. Sans
 * conséquence, aucune modale : une modale à chaque déplacement deviendrait du
 * bruit qu'on valide sans lire.
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
import { getCurrentPeriod, formatPeriod } from '../utils/date.js';
import {
  periodeDeDestination, messageDuDeplacement, avertissementDeReconduction, questionDuDeplacement
} from '../utils/changement-de-mois.js';
import { ecartLaisseParLaCorrection } from '../utils/correction-retroactive.js';
import { warn } from '../utils/debug.js';
import { soldeDuMoisAffiche } from './summary.js';

/**
 * Ce que la reconduction dira du déplacement d'une charge fixe, ou rien
 *
 * Lu AVANT l'écriture : c'est le mois tel que la reconduction le trouverait
 * sans cette charge. Une lecture impossible n'est PAS un « rien à signaler » :
 * elle devient elle-même une conséquence, et la modale le dit (règle 1).
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
    return `Ce que ce déplacement fera à la reconduction de ${formatPeriod(cible)} `
      + 'n\'a pas pu être vérifié.';
  }
}

/**
 * Les conséquences d'un changement de mois sur l'argent, AVANT l'écriture
 *
 * Deux familles, une phrase chacune :
 *   - la reconduction du mois d'arrivée (charges fixes seulement) : doublon
 *     probable, ou mois qui ne recevra plus ses charges récurrentes ;
 *   - l'écart laissé sur le mois QUITTÉ, passé, report désactivé.
 *
 * Le solde du mois quitté « sans la charge » vient de `soldeDuMoisAffiche`, la
 * fabrique que lit aussi le bilan : deux calculs du même solde finiraient par
 * diverger (règle 2).
 *
 * @returns {Promise<string[]>}
 */
async function consequencesDuDeplacement({ collection, id, chargeData, periode, periodeCible }) {
  const consequences = [];

  if (collection === 'fixedCharges') {
    const reconduction = await ceQueDiraLaReconduction({
      charge: chargeData, id, origine: periode, cible: periodeCible
    });
    if (reconduction) consequences.push(reconduction);
  }

  const restantes = (getState(collection) || []).filter(c => c.id !== id);
  const ecart = ecartLaisseParLaCorrection({
    periode,
    moisCourant: getCurrentPeriod(),
    reportActif: Boolean(getState('carryOverEnabled')),
    soldeAvant: soldeDuMoisAffiche(),
    soldeApres: soldeDuMoisAffiche({ [collection]: restantes })
  });
  if (ecart) consequences.push(ecart);

  return consequences;
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
 * @returns {Promise<{ecrit: boolean}>}
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
    return { ecrit: true };
  }

  if (liaisonRompue()) {
    toast.error('Hors ligne : une charge ne change ni de mois ni de poche sans réseau. '
      + 'Rien n\'a été modifié.');
    return { ecrit: false };
  }

  // La bascule « perso » se demande toujours. Comparée au même mois, pour
  // qu'un changement de date seul ne la déclenche pas.
  const changeDePoche = cheminDeLaCharge(ancienne, { periode, collection, id })
    !== cheminDeLaCharge(chargeData, { periode, collection, id });

  const consequences = periodeCible !== periode
    ? await consequencesDuDeplacement({ collection, id, chargeData, periode, periodeCible })
    : [];

  // UNE question, même quand poche et conséquences se cumulent.
  if (changeDePoche || consequences.length > 0) {
    const question = changeDePoche
      ? [questionDeBascule({
        versLePersonnel: estSolo(chargeData),
        autre: emplacementOppose(normaliserEmplacement(getState('emplacementCourant'))),
        members: getState('members'),
        description: chargeData.description,
        montant: chargeData.amount
      }), ...consequences].join(' ')
      : questionDuDeplacement({
        description: chargeData.description,
        montant: chargeData.amount,
        cible: periodeCible,
        consequences
      });

    const accepte = await showConfirmModal(question, { libelle: 'Déplacer', ton: TON.NORMAL });
    // Refusé, RIEN n'est écrit : ni le mois, ni la poche, ni les autres champs.
    // Un formulaire qui appliquerait le reste obéirait à moitié.
    if (!accepte) {
      toast.info('Rien n\'a été modifié');
      return { ecrit: false };
    }
  }

  // ATOMIQUE : en deux écritures, un échec laisserait la charge à deux
  // endroits — comptée deux fois — ou à aucun.
  await dbUpdate(undefined, deplacement);
  // Dit tout de suite, avant le rechargement : si celui-ci échouait, l'écran ne
  // doit pas annoncer une erreur de sauvegarde sur une écriture réussie.
  toast.success(messageDuDeplacement(periodeCible));
  return { ecrit: true };
}

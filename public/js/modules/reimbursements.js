// ===== MODULE : GESTION DES REMBOURSEMENTS =====
// Fonctionnalités : add, delete, render

import { setState, getState } from '../state.js';
import { collectDeleted } from '../utils/soft-delete.js';
import { refreshTrashButton } from './trash.js';
import { REIMBURSEMENT_DIRECTIONS } from '../config.js';
// Les règles de saisie vivent dans utils/validation.js : réécrites dans
// chaque formulaire, elles avaient divergé.
import { validateChargeAmount } from '../utils/validation.js';
import { directionLabel, memberLabel } from '../utils/members.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal, showConfirmModal } from '../components/modal.js';
import { formatCurrency, escapeHtml } from '../utils/format.js';
import { calculateSummary } from './summary.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { exigerElement } from '../utils/diagnostics.js';
import { parseMontant } from '../utils/montant.js';
import { formatDate, dateDuJour, dateDeLaCharge, dateSaisissable } from '../utils/date.js';
import { trierParDate } from '../utils/tri.js';
import { uneSeuleFois, occuperLeBouton } from '../utils/soumission.js';
import { ecouterUneFois } from '../utils/ecouteur.js';

/**
 * Initialise le module de gestion des remboursements
 */
/**
 * Show add reimbursement modal
 */
export function showAddReimbursementModal() {
  const formEl = document.getElementById('reimbursementForm');
  if (formEl) formEl.reset();

  const idEl = document.getElementById('reimbursementId');
  if (idEl) idEl.value = '';

  const dateEl = document.getElementById('reimbursementDate');
  if (dateEl) dateEl.value = dateDuJour();

  accorderModale(false);
  showModal('modalAddReimbursement');
}

/**
 * Accorde le titre et le bouton au geste en cours
 *
 * @param {boolean} edition - Vrai si un remboursement existant est rouvert
 * @returns {void}
 */
function accorderModale(edition) {
  const titre = document.getElementById('modalAddReimbursementTitle');
  if (titre) titre.textContent = edition ? 'Modifier Remboursement' : 'Ajouter Remboursement';

  const bouton = document.getElementById('saveReimbursement');
  if (bouton) bouton.textContent = edition ? 'Enregistrer' : 'Ajouter';
}

/**
 * Rouvre un remboursement pour le corriger
 *
 * Le module n'exposait que la suppression : une erreur de montant ou de sens
 * obligeait à supprimer puis resaisir. Or un remboursement déplace le solde —
 * s'en défaire pour le refaire est précisément le geste où l'on se trompe.
 *
 * @param {string} reimbursementId - Identifiant du remboursement
 * @returns {void}
 */
export function editReimbursement(reimbursementId) {
  const reimbursements = getState('reimbursements') || [];
  const reimb = reimbursements.find(r => r.id === reimbursementId);

  if (!reimb) {
    toast.error('Remboursement introuvable');
    return;
  }

  document.getElementById('reimbursementId').value = reimb.id;
  document.getElementById('reimbursementDirection').value = reimb.direction || '';
  document.getElementById('reimbursementAmount').value = reimb.amount;
  document.getElementById('reimbursementNote').value = reimb.note || '';

  // Les remboursements d'avant ce champ n'ont qu'un horodatage : le repli évite
  // qu'une simple correction de montant ne les redate d'aujourd'hui.
  const dateEl = document.getElementById('reimbursementDate');
  if (dateEl) dateEl.value = dateSaisissable(reimb);

  accorderModale(true);
  showModal('modalAddReimbursement');
}

export function initReimbursements() {
  log('📦 Initialisation module remboursements');

  // Listener sur le bouton d'ajout
  const addBtn = exigerElement('addReimbursementBtn', 'ouvrir l\'ajout de remboursement');
  if (addBtn) {
    ecouterUneFois(addBtn, 'click', showAddReimbursementModal);
  }

  // Listener sur le formulaire de sauvegarde
  const saveBtn = exigerElement('saveReimbursement', 'enregistrer un remboursement');
  if (saveBtn) {
    ecouterUneFois(saveBtn, 'click', saveReimbursement);
  }

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.editReimbursement = editReimbursement;
  window.deleteReimbursement = deleteReimbursement;
  window.settleBalance = settleBalance;

  log('✅ Module remboursements initialisé');
}

/**
 * Charge les remboursements depuis Firebase pour la période actuelle
 *
 * @param {Object} [instantaneDuMois] - Nœud `periods/{mois}` déjà lu dans ce
 *   geste. OPTIONNEL : l'omettre coûte une lecture, jamais un chiffre faux.
 */
export async function loadReimbursements(instantaneDuMois) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    warn('⚠️ Pas de période active, chargement remboursements ignoré');
    return;
  }

  try {
    // Use dbGet from db.js which handles UID-scoped paths
    const { dbGet } = await import('../db.js');
    const reimbursements = instantaneDuMois === undefined
      ? await dbGet(`periods/${currentPeriod}/reimbursements`)
      : (instantaneDuMois?.reimbursements ?? null);

    if (reimbursements) {
      // Filtrer les remboursements non supprimés
      const activeReimbursements = Object.entries(reimbursements)
        .filter(([_, reimb]) => !reimb.deleted)
        .map(([id, reimb]) => ({ id, ...reimb }));

      // Le nœud complet est déjà lu : recueillir les entrées supprimées
      // ici évite une seconde lecture pour la corbeille.
      setState('deleted.reimbursements', collectDeleted(reimbursements));
      setState('reimbursements', activeReimbursements);
      log(`📊 ${activeReimbursements.length} remboursements chargés`);
    } else {
      setState('deleted.reimbursements', []);
      setState('reimbursements', []);
      log('📊 Aucun remboursement pour cette période');
    }

    renderReimbursements();
    // Le nombre d'éléments supprimés vient de changer.
    refreshTrashButton();
  } catch (error) {
    logError('❌ Erreur chargement remboursements :', error);
    toast.error('Erreur de chargement des remboursements');
  }
}

/**
 * Sauvegarde un remboursement (ajout uniquement, pas d'édition)
 *
 * Le corps de l'écriture vit dans `enregistrerReimbursement`. Cette enveloppe ne fait que la
 * protéger : sur une connexion lente, la modale reste ouverte et le bouton
 * actif le temps que `dbPush` réponde, et le second appui — le réflexe
 * naturel devant un écran qui ne bouge pas — écrivait une seconde ligne.
 */
export async function saveReimbursement() {
  const bouton = document.getElementById('saveReimbursement');
  const rendreLeBouton = occuperLeBouton(bouton);

  try {
    await uneSeuleFois('remboursement', enregistrerReimbursement);
  } finally {
    rendreLeBouton();
  }
}

/**
 * Sauvegarde un remboursement (ajout uniquement, pas d'édition) — le corps, sans la garde
 */
async function enregistrerReimbursement() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const reimbursementId = document.getElementById('reimbursementId')?.value || '';
  const direction = document.getElementById('reimbursementDirection').value;
  const amount = parseMontant(document.getElementById('reimbursementAmount').value);
  const note = document.getElementById('reimbursementNote').value.trim();
  // La date du transfert, pas celle de sa saisie. `timestamp` ne dit que la
  // seconde, et rien ne l'affichait : plusieurs remboursements dans le mois
  // étaient indiscernables.
  const date = document.getElementById('reimbursementDate')?.value || dateDuJour();

  // Validation
  if (!direction) {
    toast.error('Direction requise');
    return;
  }

  const montantValide = validateChargeAmount(amount);
  if (!montantValide.valid) {
    toast.error(montantValide.error);
    return;
  }

  try {
    const reimbursementData = {
      direction,
      amount,
      note: note || '',
      date,
      timestamp: Date.now(),
      deleted: false
    };

    const { dbPush, dbUpdate } = await import('../db.js');

    if (reimbursementId) {
      await dbUpdate(`periods/${currentPeriod}/reimbursements/${reimbursementId}`, reimbursementData);
      toast.success('Remboursement modifié');
    } else {
      await dbPush(`periods/${currentPeriod}/reimbursements`, reimbursementData);
      toast.success('Remboursement ajouté');
    }

    // Mettre à jour le state local
    await loadReimbursements();
    closeModal('modalAddReimbursement', true);

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    logError('❌ Erreur sauvegarde remboursement :', error);
    toast.error('Erreur de sauvegarde');
  }
}

/**
 * Enregistre un remboursement soldant exactement le déséquilibre du mois.
 *
 * Sans cette action, régler ses comptes demandait de lire le solde, ouvrir le
 * formulaire, recopier le montant à la virgule près et choisir le bon sens —
 * quatre occasions de se tromper pour une opération dont l'application connaît
 * déjà tous les termes.
 *
 * Le sens découle du signe du solde : un solde positif signifie que la
 * conjointe doit de l'argent, c'est donc elle qui verse.
 *
 * Le geste tient une promesse en toutes lettres — « le solde du mois reviendra
 * à zéro » — et c'est elle qui commande le reste : le montant écrit est celui
 * qu'on a fait confirmer, et il est vérifié contre une relecture COMPLÈTE
 * juste avant l'écriture. Hors ligne, cette vérification est impossible : le
 * geste est refusé, la saisie ordinaire restant disponible.
 *
 * @returns {Promise<void>}
 */
export async function settleBalance() {
  // Un règlement enregistre un remboursement du montant exact du solde. Deux
  // déclenchements -- un double clic, ou deux téléphones affichant le même
  // solde -- en enregistrent deux : le solde bascule alors du même montant
  // dans l'autre sens. Le verrou écarte le double clic ; la relecture du
  // solde juste avant l'écriture réduit la fenêtre entre deux appareils.
  if (reglementEnCours) {
    log('💸 Règlement déjà en cours, second déclenchement ignoré');
    return;
  }
  reglementEnCours = true;

  try {
    await reglerLeSolde();
  } finally {
    reglementEnCours = false;
  }
}

/** Un règlement est-il déjà en cours dans cette session ? */
let reglementEnCours = false;

/**
 * Ce que dit le refus hors ligne
 *
 * Nommé une fois : les deux contrôles doivent dire la même chose, et le second
 * est celui qu'on lira le plus rarement — donc celui dont le message dériverait.
 * Le formulaire ordinaire, lui, reste disponible et se met en file : ce qui est
 * refusé ici, c'est la promesse « le solde reviendra à zéro », pas la saisie.
 */
const MESSAGE_HORS_LIGNE =
  'Règlement impossible hors ligne — le solde ne peut pas être vérifié. '
  + 'Utilisez « Ajouter un remboursement ».';

/**
 * Le remboursement qu'exige un solde : son montant et son sens
 *
 * Un seul endroit décide, pour que le montant écrit et le montant confirmé ne
 * puissent pas diverger. Le sens découle du signe : un solde positif signifie
 * que la conjointe doit de l'argent, c'est donc elle qui verse.
 *
 * @param {number} solde
 * @returns {{amount: number, direction: string}}
 */
function reglementPour(solde) {
  return {
    amount: Math.round(Math.abs(solde) * 100) / 100,
    direction: solde > 0
      ? REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU
      : REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER
  };
}

/**
 * Relit tout ce dont le solde dépend, d'un seul instantané
 *
 * Le solde d'un mois est une fonction de six choses : ses charges fixes, ses
 * charges variables, ses remboursements, ses salaires, son mode de partage et
 * ses pourcentages — plus le report des mois qui le précèdent. Ne rafraîchir
 * que les remboursements, c'est recalculer un solde à partir d'un mélange de
 * deux instants.
 *
 * `loadPeriodData` ferait tout cela, mais elle vide la recherche, réécrit les
 * champs de revenus et **écrit** : elle reconduit les charges récurrentes. Un
 * règlement n'a rien à reconduire.
 *
 * Deux lectures pour le geste entier, et l'instantané circule ensuite en
 * paramètre — c'est le patron déjà posé pour l'ouverture et le changement de
 * mois.
 *
 * @param {string} currentPeriod
 * @returns {Promise<number>} Le solde, recalculé sur des données du même instant
 */
async function relireLeSolde(currentPeriod) {
  const { dbGet } = await import('../db.js');
  const [instantane, globalSalaries] = await Promise.all([
    dbGet('periods'),
    dbGet('salaries')
  ]);

  const moisAffiche = instantane && typeof instantane === 'object'
    ? instantane[currentPeriod] : null;

  const { appliquerLesTermesDuMois } = await import('./period.js');
  appliquerLesTermesDuMois(moisAffiche, globalSalaries);

  const { loadVariableCharges } = await import('./variable-charges.js');
  const { loadFixedCharges } = await import('./fixed-charges.js');
  await loadVariableCharges(moisAffiche);
  await loadFixedCharges(moisAffiche);
  await loadReimbursements(moisAffiche);

  // Le report dépend des mois PRÉCÉDENTS : l'instantané les porte tous.
  const { refreshCarryOver } = await import('./carry-over.js');
  await refreshCarryOver({ historique: instantane, salairesGlobaux: globalSalaries });

  return calculateSummary({ historique: instantane }).balance;
}

/**
 * Corps du règlement, protégé par le verrou ci-dessus
 * @returns {Promise<void>}
 */
async function reglerLeSolde() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  // Le solde affiché fait foi : une seule source, pas de calcul dupliqué.
  const { balance } = calculateSummary();
  const { amount, direction } = reglementPour(balance);

  // En deçà du centime, il n'y a rien à régler et l'écriture serait du bruit.
  if (amount < 0.01) {
    toast.info('Les comptes sont déjà équilibrés');
    return;
  }

  const { liaisonRompue } = await import('../db.js');
  // Courtoisie : éviter de faire confirmer un geste qu'on refusera ensuite.
  // Ce n'est PAS le contrôle qui décide — la liaison peut se rompre pendant
  // que la confirmation est à l'écran. Celui qui décide est plus bas.
  if (liaisonRompue()) {
    toast.error(MESSAGE_HORS_LIGNE);
    return;
  }

  const directionText = directionLabel(direction, getState('members'), REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER);

  const confirmed = await showConfirmModal(
    `Enregistrer un règlement de ${formatCurrency(amount)} (${directionText}) ? Le solde du mois reviendra à zéro.`
  );
  if (!confirmed) return;

  try {
    // Relire AVANT d'écrire : l'autre personne a pu régler, ou saisir une
    // dépense, pendant que la confirmation était à l'écran. Tout ce dont le
    // solde dépend est relu, pas seulement les remboursements — sans quoi une
    // charge ajoutée en face resterait invisible et le contrôle ne contrôlerait
    // que le sixième du problème.
    const soldeFrais = await relireLeSolde(currentPeriod);

    // Le contrôle qui décide, et il vient APRÈS les lectures.
    //
    // `dbGet` ne lève pas quand la liaison est rompue : il sert le miroir. Une
    // relecture hors ligne rend donc les valeurs de la dernière connexion,
    // et le « solde vérifié » n'aurait rien vérifié. Pire, `dbPush` mettrait
    // l'écriture en file et rendrait la main : l'application annoncerait
    // « Solde réglé » pour un règlement qui partira plus tard, calculé sur un
    // solde périmé.
    if (liaisonRompue()) {
      toast.error(MESSAGE_HORS_LIGNE);
      return;
    }

    if (Math.abs(soldeFrais) < 0.01) {
      toast.info("Le solde vient d'être réglé — rien à faire");
      return;
    }

    // Le solde a bougé pendant la confirmation. Écrire le montant d'avant
    // laisserait le mois déséquilibré de la différence, en ayant promis
    // « le solde reviendra à zéro » ; écrire le montant d'après enregistrerait
    // une somme que personne n'a validée. On rend donc la main : l'écran
    // affiche désormais le solde à jour, et un second appui le règle.
    const { amount: montantFrais, direction: sensFrais } = reglementPour(soldeFrais);
    if (montantFrais !== amount || sensFrais !== direction) {
      toast.warning(`Le solde a changé — il est maintenant de ${formatCurrency(montantFrais)}`);
      return;
    }

    const { dbPush } = await import('../db.js');

    await dbPush(`periods/${currentPeriod}/reimbursements`, {
      direction: sensFrais,
      amount: montantFrais,
      note: 'Règlement du solde',
      date: dateDuJour(),
      timestamp: Date.now(),
      deleted: false
    });

    await loadReimbursements();
    calculateSummary();
    toast.success('Solde réglé');
  } catch (err) {
    logError('❌ Erreur règlement du solde :', err);
    toast.error('Erreur de sauvegarde');
  }
}

/**
 * Supprime un remboursement (soft delete)
 * @param {string} reimbursementId - ID du remboursement à supprimer
 */
export async function deleteReimbursement(reimbursementId) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const reimbursements = getState('reimbursements') || [];
  const reimbursement = reimbursements.find(r => r.id === reimbursementId);

  if (!reimbursement) {
    toast.error('Remboursement introuvable');
    return;
  }

  const directionText = directionLabel(
      reimbursement.direction, getState('members'), REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER);

  const confirmed = await showConfirmModal(`Supprimer le remboursement ${directionText} de ${formatCurrency(reimbursement.amount)} ?`);
  if (!confirmed) return;

  try {
    // Use dbUpdate from db.js which handles UID-scoped paths
    const { dbUpdate } = await import('../db.js');

    // Soft delete
    await dbUpdate(`periods/${currentPeriod}/reimbursements/${reimbursementId}`, { deleted: true });

    // Mettre à jour le state local
    await loadReimbursements();
    toast.success('Remboursement supprimé', {
      onUndo: async () => {
        await dbUpdate(`periods/${currentPeriod}/reimbursements/${reimbursementId}`, { deleted: false });
        await loadReimbursements();
        calculateSummary();
        toast.success('Suppression annulée');
      }
    });

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    logError('❌ Erreur suppression remboursement :', error);
    toast.error('Erreur de suppression');
  }
}

/**
 * Affiche la liste des remboursements dans le DOM
 */
export function renderReimbursements() {
  const reimbursements = getState('reimbursements') || [];
  const listElement = document.getElementById('reimbursementsList');
  const totalElement = document.getElementById('reimbursementsTotal');

  if (!listElement) {
    warn('⚠️ Element #reimbursementsList introuvable');
    return;
  }

  // Vider la liste
  listElement.innerHTML = '';

  if (reimbursements.length === 0) {
    listElement.innerHTML = '<p class="empty-state">Aucun remboursement pour cette période</p>';
    if (totalElement) totalElement.textContent = formatCurrency(0);
    return;
  }

  // Calculer les totaux par direction
  let totalYouToPartner = 0;
  let totalPartnerToYou = 0;

  // Une somme ne dépend pas de l'ordre : ce passage-ci n'a pas à être trié.
  reimbursements.forEach(reimb => {
    if (reimb.direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER) {
      totalYouToPartner += reimb.amount;
    } else {
      totalPartnerToYou += reimb.amount;
    }
  });

  // Afficher les remboursements
  // Le plus récent d'abord : rien n'était trié, les remboursements sortaient
  // dans l'ordre des clés Firebase.
  trierParDate(reimbursements).forEach(reimb => {
    const reimbDiv = document.createElement('div');
    reimbDiv.className = 'reimbursement-item';

    const directionIcon = reimb.direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER
      ? '→'
      : '←';
    const directionText = directionLabel(
        reimb.direction, getState('members'), REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER);
    const directionClass = reimb.direction === REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER
      ? 'direction-you-to-partner'
      : 'direction-partner-to-you';

    reimbDiv.innerHTML = `
      <div class="reimbursement-info">
        <span class="reimbursement-direction ${directionClass}">
          ${directionIcon} ${escapeHtml(directionText)}
        </span>
        ${(() => {
          const jour = formatDate(dateDeLaCharge(reimb));
          return jour ? `<span class="charge-date">${escapeHtml(jour)}</span>` : '';
        })()}
        ${reimb.note ? `<span class="reimbursement-note">${escapeHtml(reimb.note)}</span>` : ''}
      </div>
      <div class="reimbursement-actions">
        <span class="reimbursement-amount">${formatCurrency(reimb.amount)}</span>
        <button class="btn-icon" data-action="editReimbursement" data-arg="${escapeHtml(reimb.id)}" aria-label="Modifier ce remboursement">
          ✏️
        </button>
        <button class="btn-icon btn-delete" data-action="deleteReimbursement" data-arg="${escapeHtml(reimb.id)}" aria-label="Supprimer ce remboursement">
          🗑️
        </button>
      </div>
    `;
    listElement.appendChild(reimbDiv);
  });

  // Ce bloc récapitule des transferts déjà effectués, pas une dette : la dette
  // est l'affaire du bilan. Les libellés disaient « Vous devez » là où le
  // montant représentait ce que vous aviez versé — l'inverse, et en
  // contradiction avec le solde affiché plus haut.
  const netAmount = totalYouToPartner - totalPartnerToYou;
  if (totalElement) {
    // Le libellé nommait « Conjointe » alors que l'écran entier porte les
    // prénoms depuis leur mise en place : ce bloc était le dernier à parler
    // d'une personne que l'application n'appelle plus ainsi.
    const nomConjointe = escapeHtml(memberLabel('conjointe', getState('members')));

    if (netAmount > 0) {
      totalElement.innerHTML = `Net versé à ${nomConjointe} : <strong>${formatCurrency(netAmount)}</strong>`;
      totalElement.className = 'reimbursements-total you-owe';
    } else if (netAmount < 0) {
      totalElement.innerHTML = `Net reçu de ${nomConjointe} : <strong>${formatCurrency(Math.abs(netAmount))}</strong>`;
      totalElement.className = 'reimbursements-total partner-owes';
    } else {
      totalElement.innerHTML = 'Transferts équilibrés';
      totalElement.className = 'reimbursements-total balanced';
    }
  }
}


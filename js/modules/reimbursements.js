// ===== MODULE : GESTION DES REMBOURSEMENTS =====
// Fonctionnalités : add, delete, render

import { setState, getState } from '../state.js';
import { collectDeleted } from '../utils/soft-delete.js';
import { refreshTrashButton } from './trash.js';
import { REIMBURSEMENT_DIRECTIONS } from '../config.js';
// Les règles de saisie vivent dans utils/validation.js : réécrites dans
// chaque formulaire, elles avaient divergé.
import { validateChargeAmount } from '../utils/validation.js';
import { directionLabel, memberLabel, normaliserEmplacement } from '../utils/members.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal, showConfirmModal, TON } from '../components/modal.js';
import { formatCurrency, escapeHtml } from '../utils/format.js';
import { calculateSummary } from './summary.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { exigerElement } from '../utils/diagnostics.js';
import { parseMontant } from '../utils/montant.js';
import {
  formatDate, dateDuJour, dateDeLaCharge, dateSaisissable,
  periodeDeLaDate, formatPeriod
} from '../utils/date.js';
import { trierParDate } from '../utils/tri.js';
import { uneSeuleFois, occuperLeBouton } from '../utils/soumission.js';
import { ecouterUneFois } from '../utils/ecouteur.js';
import { lirePeriodes } from '../poches.js';
import { consequenceDuReglement } from '../utils/phrase-reglement.js';

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

  // Le règlement du solde a sa modale depuis qu'il porte un montant libre :
  // son bouton de validation se câble ici, comme celui du formulaire ordinaire.
  const validerBtn = exigerElement('reglerSoldeValider', 'enregistrer un règlement du solde');
  if (validerBtn) {
    ecouterUneFois(validerBtn, 'click', confirmerLeReglement);
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
      // L'édition ne déplace pas le versement, pour la même raison que les
      // charges : c'est un choix, pas une contrainte technique.
      // Cf. `variable-charges.js`.
      await dbUpdate(`periods/${currentPeriod}/reimbursements/${reimbursementId}`, reimbursementData);
      toast.success('Remboursement modifié');
    } else {
      // La date décide du mois, comme pour une charge variable. Un versement
      // pèse directement sur le solde : rangé dans le mauvais mois, il fausse
      // deux soldes à la fois — celui qu'il quitte et celui qu'il n'a pas
      // rejoint. Cf. `periodeDeLaDate`.
      const periodeCible = periodeDeLaDate(reimbursementData.date) || currentPeriod;
      await dbPush(`periods/${periodeCible}/reimbursements`, reimbursementData);
      toast.success(
        periodeCible === currentPeriod
          ? 'Remboursement ajouté'
          : `Remboursement ajouté en ${formatPeriod(periodeCible)}, sa date`
      );
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
 * Ouvre le règlement du solde : une saisie pré-remplie du montant exact.
 *
 * Sans cette action, régler ses comptes demandait de lire le solde, ouvrir le
 * formulaire, recopier le montant à la virgule près et choisir le bon sens —
 * quatre occasions de se tromper pour une opération dont l'application connaît
 * déjà tous les termes.
 *
 * Le sens découle du signe du solde : un solde positif signifie que la
 * conjointe doit de l'argent, c'est donc elle qui verse. Le MONTANT, lui, est
 * modifiable depuis ce lot : on rembourse rarement au centime, et un paiement
 * partiel obligeait jusqu'ici à retrouver une autre carte et un autre bouton.
 *
 * Ce que la promesse est devenue : « le solde du mois reviendra à zéro » ne
 * peut plus être écrit en dur, puisqu'un versement partiel ou un trop-versé ne
 * la tiennent pas. Elle est désormais RECALCULÉE à chaque frappe, co-visible
 * avec le champ — c'est `consequenceDuReglement` qui la rédige, et c'est aussi
 * la seule protection contre la faute de frappe. Hors ligne, la vérification
 * du solde est impossible : le geste est refusé, la saisie ordinaire restant
 * disponible.
 *
 * @returns {Promise<void>}
 */
export async function settleBalance() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  // Le solde affiché fait foi : une seule source, pas de calcul dupliqué.
  const { balance } = calculateSummary();
  const { amount } = reglementPour(balance);

  // En deçà du centime, il n'y a rien à régler et l'écriture serait du bruit.
  if (amount < 0.01) {
    toast.info('Les comptes sont déjà équilibrés');
    return;
  }

  const { liaisonRompue } = await import('../db.js');
  // Courtoisie : éviter d'ouvrir une saisie qu'on refusera ensuite. Ce n'est
  // PAS le contrôle qui décide — la liaison peut se rompre pendant que la
  // modale est à l'écran. Celui qui décide est dans `ecrireLeReglement`.
  if (liaisonRompue()) {
    toast.error(MESSAGE_HORS_LIGNE);
    return;
  }

  ouvrirLaModaleDeReglement(balance, currentPeriod);
}

/**
 * Une écriture de règlement est-elle déjà partie ?
 *
 * LE VERROU A SUIVI L'ÉCRITURE, et c'est le lot du montant libre qui l'a
 * déplacé. Il gardait l'ouverture du geste, parce que l'ouverture ALLAIT
 * jusqu'à l'écriture : une question fermée, puis un `dbPush`. Depuis qu'une
 * modale de saisie s'intercale, garder l'ouverture ne garderait plus rien —
 * elle rend la main dès que la modale est à l'écran, et deux appuis sur le
 * bouton de validation passeraient tous les deux.
 *
 * Il garde donc `confirmerLeReglement`, où le second appui coûte vraiment
 * quelque chose : deux versements du même montant font basculer le solde du
 * même montant dans l'autre sens. Rouvrir la modale deux fois, à l'inverse, ne
 * coûte rien — `empilerCouche` est idempotente et le rendu repart du même état.
 */
let reglementEnCours = false;

/**
 * Ce que dit le refus hors ligne
 *
 * Nommé une fois : les deux contrôles doivent dire la même chose, et le second
 * est celui qu'on lira le plus rarement — donc celui dont le message dériverait.
 * Le formulaire ordinaire, lui, reste disponible et se met en file : ce qui est
 * refusé ici, c'est la PHRASE DE CONSÉQUENCE — « le solde reviendra à zéro »,
 * « il restera X à régler » —, pas la saisie. Une phrase calculée sur le
 * miroir de la dernière connexion serait une promesse faite sur un solde
 * périmé, et c'est très exactement ce que ce geste vend.
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
  // L'instantané est FUSIONNÉ ici, et c'est ce qui compte : il est ensuite
  // passé aux trois chargeurs. Le lire par `dbGet` rendrait une liste sans
  // personnel par ce chemin d'appel, et avec par l'autre — la même grandeur,
  // deux valeurs, selon la façon dont on y arrive.
  const [instantane, globalSalaries] = await Promise.all([
    lirePeriodes(),
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

/** Le solde sur lequel la phrase affichée a été calculée, et le mois qu'il solde */
let soldeAffiche = 0;
let moisDuReglement = null;

/**
 * Remplit et ouvre la modale de règlement
 *
 * @param {number} solde - Solde CUMULÉ du mois, report inclus
 * @param {string} periode - Le mois que ce règlement solde
 * @returns {void}
 */
function ouvrirLaModaleDeReglement(solde, periode) {
  soldeAffiche = solde;
  moisDuReglement = periode;

  const { amount, direction } = reglementPour(solde);

  // LE TITRE NOMME LE MOIS, et ce n'est pas décoratif : un règlement appartient
  // au mois AFFICHÉ, celui qu'il solde, et non au mois de sa date. Saisi le
  // 3 septembre sur août, il est rangé en août et la liste l'y montre daté du
  // 03/09 — sans le titre, rien à l'écran ne dirait quel mois on solde.
  const titre = document.getElementById('modalReglerSoldeTitre');
  if (titre) titre.textContent = `Régler ${formatPeriod(periode)}`;

  // Le sens est dit, jamais offert au choix : il découle du signe du solde.
  // Le rendre modifiable ouvrirait un versement qui AGGRAVE l'écart, et
  // aucune des trois phrases ne saurait l'appeler un règlement.
  const sens = document.getElementById('reglerSoldeSens');
  if (sens) {
    const qui = directionLabel(direction, getState('members'), REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER);
    sens.textContent = '';
    const fort = document.createElement('strong');
    fort.textContent = qui;
    sens.append('Versement ', fort);
  }

  const avertissement = document.getElementById('reglerSoldeAvertissement');
  if (avertissement) {
    avertissement.textContent = '';
    avertissement.hidden = true;
  }

  const champ = document.getElementById('reglerSoldeMontant');
  if (champ) {
    // LA VIRGULE, et pas le point de `toFixed`. `parseMontant` lit les deux —
    // ce n'est donc pas une question de relecture — mais le champ est un texte
    // qu'on CORRIGE : « 66.94 » y côtoierait les « 66,94 € » de tout l'écran,
    // et le premier geste serait de le retaper.
    champ.value = amount.toFixed(2).replace('.', ',');

    ecouterUneFois(champ, 'input', rafraichirLaConsequence);

    // L'écouteur est armé AVANT l'appel synchrone ci-dessous, et c'est ce qui
    // le désarme : sans cela, le premier appui de la personne DANS le champ
    // resélectionnerait tout, alors qu'on touche un champ pour y placer son
    // curseur. Il ne sert que tant que la préparation n'a pas abouti.
    champ.addEventListener('focus', () => preparerLeChamp(champ), { once: true });
  }

  rafraichirLaConsequence();
  showModal('modalReglerSolde');

  // ─────────────────────────────────────────────────────────────────────
  // ICI, ET PAS DANS UN ÉCOUTEUR SEUL — mesuré le 2026-09-17.
  //
  // `showModal` pose le focus dans un `setTimeout(…, 100)`, donc HORS de la
  // tâche du geste. Tant que la sélection n'était accrochée qu'à l'événement
  // `focus`, tout le geste tenait à ce focus différé : neutralisé — et c'est
  // ce que fait Safari iOS d'un `focus()` programmatique hors geste, ce que
  // ferait aussi un tiers qui prend le focus —, le relevé rend exactement le
  // symptôme constaté à l'écran, `sel = 6..6`, curseur en fin, rien de
  // sélectionné.
  //
  // La préparation est donc posée ici, SYNCHRONE, dans la même tâche que
  // l'ouverture. `showModal` verra le focus dans la modale au bout de ses
  // 100 ms et n'y touchera pas — c'est sa garde `focusDejaPose`, et elle est
  // tenue par ses propres contrôles.
  //
  // Trois occasions, UNE SEULE rédaction : cet appel, le focus différé s'il
  // aboutit, et à défaut le premier appui de la personne. Aucune ne peut
  // laisser le champ à moitié prêt, parce qu'aucune ne fait autre chose que
  // `preparerLeChamp`.
  if (champ) preparerLeChamp(champ);
}

/**
 * Met le champ en état de RECEVOIR : focalisé, contenu sélectionné
 *
 * Une frappe doit REMPLACER le montant pré-rempli, pas s'y ajouter — sans
 * cela, taper « 70 » sur « 150,00 » donne « 150,0070 », et le paiement partiel
 * redevient le geste pénible que le montant libre devait supprimer.
 *
 * Idempotente : `focus()` sur un élément déjà focalisé ne fait rien et n'émet
 * aucun événement, et re-sélectionner une sélection entière ne change rien.
 * C'est ce qui autorise les trois déclencheurs.
 *
 * @param {HTMLInputElement} champ
 * @returns {void}
 */
function preparerLeChamp(champ) {
  champ.focus();
  champ.select();
}

/**
 * Recalcule la phrase de conséquence, et gouverne le bouton
 *
 * Elle est co-visible avec le champ et se recalcule à chaque frappe : c'est la
 * SEULE protection contre la faute de frappe, aucun plafond n'étant posé sur
 * le trop-versé. Un plafond refuserait un geste légitime, et un refus
 * n'apprend rien ; « Il restera 1 233,06 € à régler » se lit tout seul.
 *
 * @returns {{issue: string, valide: boolean, phrase: string, montant: number,
 *   resteCentimes: number|null}} Le verdict qui vient d'être affiché
 */
function rafraichirLaConsequence() {
  const champ = document.getElementById('reglerSoldeMontant');
  const ligne = document.getElementById('reglerSoldeConsequence');
  const bouton = document.getElementById('reglerSoldeValider');

  const verdict = consequenceDuReglement({
    saisie: champ ? champ.value : '',
    solde: soldeAffiche,
    members: getState('members'),
    moi: normaliserEmplacement(getState('emplacementCourant'))
  });

  if (ligne) {
    ligne.textContent = verdict.phrase;
    ligne.dataset.issue = verdict.issue;
  }
  if (bouton) bouton.disabled = !verdict.valide;

  return verdict;
}

/**
 * Enregistre le versement saisi, après avoir relu le solde
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ DANS LA RELECTURE, ET POURQUOI
 *
 * Tant que le montant était imposé, le contrôle comparait le montant FRAIS au
 * montant confirmé : deux grandeurs de même nature. Le montant étant désormais
 * saisi, cette comparaison n'a plus d'objet — un versement de 70 € reste
 * 70 € quoi qu'ait fait le solde. Ce qu'il faut comparer est le SOLDE relu au
 * solde sur lequel la phrase a été affichée : c'est lui, et lui seul, qui rend
 * la phrase vraie ou fausse.
 *
 * Et le remède n'est plus de rendre la main. Rien n'est écrit, la modale RESTE
 * ouverte avec le montant saisi, la phrase est recalculée sur le solde frais,
 * un avertissement dit ce qui a bougé, et un second appui décide. Fermer
 * ferait retaper un montant que personne n'a contesté.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EST EXPORTÉE
 *
 * Le bouton l'appelle, et rien d'autre dans l'application. L'export sert au
 * banc d'essai : un `click()` rend la main avant que la chaîne asynchrone soit
 * finie, et attendre « assez longtemps » est exactement la forme de mesure qui
 * rend un contrôle vert sans rien avoir observé. Un cas tient séparément que
 * le BOUTON mène bien ici — l'export ne dispense pas de le prouver.
 *
 * @returns {Promise<void>}
 */
export async function confirmerLeReglement() {
  // Deux appuis -- un double clic, ou une relecture qui prend son temps -- en
  // enregistreraient deux : le solde basculerait alors du même montant dans
  // l'autre sens. Le verrou écarte le second ; la relecture du solde juste
  // avant l'écriture réduit la fenêtre entre deux appareils.
  if (reglementEnCours) {
    log('💸 Règlement déjà en cours, second appui ignoré');
    return;
  }
  reglementEnCours = true;

  const bouton = document.getElementById('reglerSoldeValider');
  const rendreLeBouton = occuperLeBouton(bouton);

  try {
    await ecrireLeReglement();
  } finally {
    rendreLeBouton();
    reglementEnCours = false;
    // Le bouton reprend l'état que dit la phrase : `occuperLeBouton` le
    // réactive toujours, y compris quand la saisie est devenue illisible.
    rafraichirLaConsequence();
  }
}

/**
 * Le corps de l'écriture, protégé par le verrou ci-dessus
 * @returns {Promise<void>}
 */
async function ecrireLeReglement() {
  const currentPeriod = moisDuReglement;
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  // La saisie est relue ici, pas mémorisée à la frappe : entre la dernière
  // frappe et l'appui, rien d'autre ne la touche, et une seconde copie de la
  // valeur serait une seconde source du montant écrit.
  const verdict = rafraichirLaConsequence();
  if (!verdict.valide) return;

  const montant = Math.round(verdict.montant * 100) / 100;

  const { liaisonRompue } = await import('../db.js');
  if (liaisonRompue()) {
    toast.error(MESSAGE_HORS_LIGNE);
    return;
  }

  try {
    // Relire AVANT d'écrire : l'autre personne a pu régler, ou saisir une
    // dépense, pendant que la modale était à l'écran. Tout ce dont le solde
    // dépend est relu, pas seulement les remboursements — sans quoi une charge
    // ajoutée en face resterait invisible et le contrôle ne contrôlerait que le
    // sixième du problème.
    const soldeFrais = await relireLeSolde(currentPeriod);

    // Le contrôle qui décide, et il vient APRÈS les lectures.
    //
    // `dbGet` ne lève pas quand la liaison est rompue : il sert le miroir. Une
    // relecture hors ligne rend donc les valeurs de la dernière connexion, et
    // le « solde vérifié » n'aurait rien vérifié. Pire, `dbPush` mettrait
    // l'écriture en file et rendrait la main : l'application annoncerait
    // « Versement enregistré » pour un règlement qui partira plus tard,
    // calculé sur un solde périmé.
    if (liaisonRompue()) {
      toast.error(MESSAGE_HORS_LIGNE);
      return;
    }

    if (Math.abs(soldeFrais) < 0.01) {
      // Plus rien à régler : la modale n'a plus d'objet, elle se ferme.
      fermerLaModaleDeReglement();
      toast.info("Le solde vient d'être réglé — rien à faire");
      return;
    }

    // Le solde a bougé pendant la saisie. La phrase affichée décrivait un autre
    // monde : écrire maintenant tiendrait une promesse qui n'a jamais été
    // faite. On ne ferme pas pour autant — le montant saisi reste bon, c'est
    // sa conséquence qui a changé.
    if (Math.round(soldeFrais * 100) !== Math.round(soldeAffiche * 100)) {
      soldeAffiche = soldeFrais;
      annoncerLeSoldeChange(soldeFrais);
      rafraichirLaConsequence();
      return;
    }

    const { direction } = reglementPour(soldeFrais);
    const { dbPush } = await import('../db.js');

    // LE MOIS AFFICHÉ, PAS CELUI DE LA DATE. Un règlement solde le mois qu'on
    // regarde : rangé au mois de sa date, il quitterait le solde qu'il éteint
    // pour en fausser un autre. C'est l'inverse de la règle du formulaire
    // « + Ajouter », qui range par `periodeDeLaDate` — et c'est voulu : là-bas
    // on saisit un virement, ici on solde un mois.
    await dbPush(`periods/${currentPeriod}/reimbursements`, {
      direction,
      amount: montant,
      note: 'Règlement du solde',
      date: dateDuJour(),
      timestamp: Date.now(),
      deleted: false
    });

    fermerLaModaleDeReglement();
    await loadReimbursements();
    calculateSummary();
    toast.success('Versement enregistré');
  } catch (err) {
    logError('❌ Erreur règlement du solde :', err);
    toast.error('Erreur de sauvegarde');
  }
}

/**
 * Dit ce que le solde est devenu, sans effacer ce qui est saisi
 *
 * @param {number} soldeFrais
 * @returns {void}
 */
function annoncerLeSoldeChange(soldeFrais) {
  const montant = formatCurrency(reglementPour(soldeFrais).amount);
  const message = `Le solde a changé — il est maintenant de ${montant}. `
    + 'Vérifiez le montant, puis appuyez à nouveau.';

  const zone = document.getElementById('reglerSoldeAvertissement');
  if (zone) {
    zone.textContent = message;
    zone.hidden = false;
  }
  toast.warning(message);
}

/**
 * Referme la modale et oublie le mois qu'elle soldait
 * @returns {void}
 */
function fermerLaModaleDeReglement() {
  moisDuReglement = null;
  closeModal('modalReglerSolde', false);
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

  const confirmed = await showConfirmModal(
    `Supprimer le remboursement ${directionText} de ${formatCurrency(reimbursement.amount)} ?`,
    { libelle: 'Supprimer', ton: TON.DESTRUCTIF }
  );
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
    listElement.innerHTML = '<p class="empty-state">Aucun remboursement pour cette période'
      + '<small>Les virements que vous vous faites l\'un à l\'autre pour solder'
      + ' le mois. Ce ne sont pas des dépenses : ils ne comptent que dans le'
      + ' solde.</small></p>';
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


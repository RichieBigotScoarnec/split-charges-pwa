// ===== MODULE : GESTION DES CHARGES FIXES =====
// Fonctionnalités : add, edit, delete, render, validation

import { setState, getState } from '../state.js';
import { collectDeleted } from '../utils/soft-delete.js';
import { refreshTrashButton } from './trash.js';
import { refreshMapButton } from './map.js';
import { invalidateTrends } from './trends.js';
// Les règles de saisie vivent dans utils/validation.js : réécrites dans
// chaque formulaire, elles avaient divergé.
import { validateChargeAmount, validateChargeName } from '../utils/validation.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal, showConfirmModal } from '../components/modal.js';
import { formatCurrency, escapeHtml, formatPaidBy } from '../utils/format.js';
import {
  formatDate, dateDuJour, dateDeLaCharge, dateSaisissable,
  periodeDeLaDate, formatPeriod
} from '../utils/date.js';
import { grouperParCategorie } from '../utils/tri.js';
import { afficherTotalDeListe } from '../utils/totaux-liste.js';
import { calculateSummary } from './summary.js';
import { getCategoryIcon as getCategoryEmoji, populateCategorySelect, populateDestinationSelect } from './custom-lists.js';
import { populateEnvelopeSelect, etiquetteEnveloppe } from './envelopes.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { planDeclarationFixe, questionDeConfirmation } from '../utils/abonnements.js';
import { exigerElement } from '../utils/diagnostics.js';
import { parseMontant } from '../utils/montant.js';
import { normaliserEmplacement } from '../utils/members.js';
import { uneSeuleFois, occuperLeBouton } from '../utils/soumission.js';
import { ecouterUneFois } from '../utils/ecouteur.js';
import { estSolo, perimetreEcrivable, PERIMETRES } from '../utils/perimetre.js';
import { coutDesChargesFixes } from '../utils/cout-annuel.js';

/**
 * Initialise le module de gestion des charges fixes
 */
/**
 * Show add fixed charge modal
 */
export function showAddFixedChargeModal() {
  const chargeIdEl = document.getElementById('fixedChargeId');
  const formEl = document.getElementById('fixedChargeForm');

  if (chargeIdEl) chargeIdEl.value = '';
  if (formEl) formEl.reset();

  // Repeuplée à l'ouverture : une enveloppe créée depuis le début de la session
  // doit être proposée sans avoir à recharger l'application.
  populateEnvelopeSelect('fixedChargeEnvelope', '');

  // Le payeur proposé est celui qui tient le téléphone. `form.reset()` rendait
  // le select à sa première option, `vous`, quel que soit l'appareil.
  const payeurEl = document.getElementById('fixedChargePaidBy');
  if (payeurEl) payeurEl.value = payeurParDefaut();

  // Le jour courant par défaut, modifiable : une charge fixe se règle rarement
  // le jour où on la saisit.
  const dateEl = document.getElementById('fixedChargeDate');
  if (dateEl) dateEl.value = dateDuJour();

  const recurringEl = document.getElementById('fixedChargeRecurring');
  if (recurringEl) recurringEl.checked = true;

  // Reset split override
  const splitToggle = document.getElementById('fixedChargeSplitToggle');
  if (splitToggle) {
    splitToggle.checked = false;
    document.getElementById('fixedChargeSplitOptions').style.display = 'none';
  }

  // `form.reset()` décoche la case perso, mais ne rouvre ni l'option
  // « Partagé » ni le groupe « Répartition spéciale » que la bascule avait
  // fermés : sans ce rappel, une saisie perso rendrait toutes les suivantes
  // impossibles à partager, jusqu'au rechargement de la page.
  window.toggleFixedChargePerso?.();

  accorderModaleFixed(false);

  showModal('modalAddFixedCharge');
}

/**
 * Accorde le titre et le bouton de la modale au geste en cours
 *
 * Éditer une charge ouvrait une modale intitulée « Ajouter Charge Fixe », dont le
 * bouton disait « Ajouter ». Rien ne distinguait donc une modification d'une
 * création — et un formulaire prérempli qu'on croit vide invite à tout ressaisir.
 *
 * @param {boolean} edition - Vrai si une charge existante est rouverte
 * @returns {void}
 */
function accorderModaleFixed(edition) {
  const titre = document.getElementById('modalAddFixedChargeTitle');
  if (titre) titre.textContent = edition ? 'Modifier Charge Fixe' : 'Ajouter Charge Fixe';

  const bouton = document.getElementById('saveFixedCharge');
  if (bouton) bouton.textContent = edition ? 'Enregistrer' : 'Ajouter';
}

/**
 * Déclare fixes les abonnements que la veille a repérés
 *
 * `anticipation.js` sait dire « Netflix et la salle de sport reviennent chaque
 * mois sans être déclarés fixes ». Le constat restait sans suite : il fallait
 * ouvrir ce formulaire et ressaisir chaque ligne, neuf champs à la fois. Un
 * conseil qui coûte plus cher que de ne rien faire n'en est pas un — et c'est
 * ainsi qu'une application de budget se fait abandonner en novembre.
 *
 * **Le bouton ne porte que la CLÉ de l'observation.** Les libellés viennent des
 * charges saisies par le foyer : faire transiter la proposition entière par un
 * attribut du DOM en ferait une surface d'injection, et rien ne garantirait que
 * ce qu'on écrit est bien ce que l'application a calculé. La proposition est
 * relue dans l'état, là où le calcul l'a laissée — même règle que
 * `creerEnveloppeProposee`.
 *
 * L'écriture est UN SEUL lot multi-chemins : les charges fixes créées, et les
 * saisies variables qu'elles remplacent mises à la corbeille. Deux écritures
 * séparées pourraient échouer à moitié et laisser le mois compté deux fois.
 *
 * @param {string} cle - Clé de l'observation
 * @returns {Promise<boolean>} Vrai si quelque chose a été écrit
 */
export async function declarerAbonnementsProposes(cle) {
  const vue = (getState('observations') || []).find(v => v && v.cle === cle);
  if (!vue || !vue.propositionFixe) {
    toast.error('Cette proposition n\'est plus à l\'écran');
    return false;
  }

  const currentPeriod = getState('currentPeriod');
  const { dbGet, dbUpdate, liaisonRompue } = await import('../db.js');

  // REFUSÉ HORS LIGNE, et refusé AVANT de demander confirmation.
  //
  // Ce geste écrit un lot multi-chemins visant la racine de l'espace, et
  // `operationRejouable` refuse de différer une écriture qui ne nomme aucun
  // nœud — c'est la garde qui empêche une entrée forgée d'effacer le foyer.
  // L'écriture échouerait donc de toute façon, mais après que l'écran a
  // demandé « Déclarer Netflix en charge fixe ? » et reçu un oui. Poser la
  // question pour rien est pire que de dire non tout de suite.
  //
  // Et la lecture, elle, aboutirait : `dbGet` sert le miroir hors ligne. Le
  // plan serait donc calculé sur un mois peut-être périmé.
  if (liaisonRompue()) {
    toast.error('Déclaration impossible hors ligne — la base doit être joignable');
    return false;
  }

  // Le mois est RELU avant d'écrire, et non pris dans l'état.
  //
  // Entre l'affichage de la carte et le clic, l'autre téléphone a pu saisir
  // l'abonnement — ou le déclarer fixe lui-même. Le plan doit porter sur ce que
  // la base contient à cet instant, sans quoi le mois serait compté deux fois.
  let periode;
  try {
    periode = await dbGet(`periods/${currentPeriod}`);
  } catch (erreur) {
    logError('❌ Lecture du mois impossible :', erreur);
    toast.error('Impossible de lire le mois');
    return false;
  }

  const plan = planDeclarationFixe({
    charges: vue.propositionFixe.charges,
    periode,
    mois: currentPeriod,
    instant: Date.now()
  });

  if (plan.aEcrire.length === 0) {
    // Rien à écrire n'est pas une panne : c'est le cas où l'autre téléphone a
    // été plus rapide, ou celui d'un payeur qu'on refuse de deviner. Le motif
    // est dit, sinon le bouton paraîtrait inerte.
    toast.info(plan.ecartees.length > 0
      ? plan.ecartees.map(e => `« ${e.libelle} » : ${e.motif}`).join(' ; ')
      : 'Rien à déclarer');
    return false;
  }

  const accepte = await showConfirmModal(questionDeConfirmation(plan, formatCurrency));
  if (!accepte) return false;

  const ecritures = {};
  for (const charge of plan.aEcrire) {
    ecritures[`periods/${currentPeriod}/fixedCharges/${await cleDeCharge()}`] = charge;
  }
  // La corbeille, jamais l'effacement : c'est la règle du dépôt, et elle laisse
  // au foyer de quoi revenir sur le geste.
  for (const charge of plan.aRetirer) {
    ecritures[`periods/${currentPeriod}/variableCharges/${charge.id}/deleted`] = true;
  }

  try {
    await dbUpdate(undefined, ecritures);
  } catch (erreur) {
    logError('❌ Déclaration des abonnements impossible :', erreur);
    toast.error('Erreur de sauvegarde');
    return false;
  }

  await loadFixedCharges();

  // Les variables aussi : certaines viennent de partir à la corbeille, et
  // l'écran les montrerait encore.
  const { loadVariableCharges } = await import('./variable-charges.js');
  await loadVariableCharges();

  toast.success(`${plan.aEcrire.length === 1
    ? `« ${plan.aEcrire[0].description} » déclarée fixe`
    : `${plan.aEcrire.length} charges déclarées fixes`} — ${formatCurrency(plan.total)} par mois, reconduits`);

  if (plan.ecartees.length > 0) {
    // Ce qui n'a pas été écrit se dit : un silence laisserait croire que tout
    // est passé, et le mois prochain la carte reviendrait sans qu'on comprenne.
    toast.info(plan.ecartees.map(e => `« ${e.libelle} » : ${e.motif}`).join(' ; '));
  }

  // L'historique est relu et REPASSÉ : `calculateSummary()` sans lui fait taire
  // toute la veille, et l'écran perdrait les autres observations au lieu de la
  // seule qu'on vient de traiter.
  try {
    calculateSummary({ historique: await dbGet('periods') });
  } catch (erreur) {
    logError('❌ Rafraîchissement du bilan impossible :', erreur);
    calculateSummary();
  }

  return true;
}

/**
 * Une clé Firebase neuve, sans écrire
 *
 * `dbPush` écrit ; ici il faut la clé AVANT, pour la poser dans un lot
 * multi-chemins qui part en une seule fois.
 *
 * @returns {Promise<string>}
 */
async function cleDeCharge() {
  const { getFirebaseDatabase } = await import('../firebase-init.js');
  return getFirebaseDatabase().ref().push().key;
}

export function initFixedCharges() {
  log('📦 Initialisation module charges fixes');

  // Les écouteurs avant tout remplissage : si `populateCategorySelect` lève,
  // l'étape entière est rattrapée par `runStep` et le bouton « + Ajouter »
  // resterait sans écouteur, visible mais inerte.
  const addBtn = exigerElement('addFixedChargeBtn', 'ouvrir l\'ajout de charge fixe');
  if (addBtn) {
    ecouterUneFois(addBtn, 'click', showAddFixedChargeModal);
  }

  const saveBtn = exigerElement('saveFixedCharge', 'enregistrer une charge fixe');
  if (saveBtn) {
    ecouterUneFois(saveBtn, 'click', saveFixedCharge);
  }

  // Peupler les selects catégorie et destination dynamiquement
  populateCategorySelect('fixedChargeCategory');
  populateDestinationSelect('fixedChargeDestination');

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.editFixedCharge = editFixedCharge;
  window.deleteFixedCharge = deleteFixedCharge;
  window.declarerAbonnementsProposes = declarerAbonnementsProposes;
  /**
   * Bascule « dépense perso », et ce qu'elle rend impossible
   *
   * Une dépense perso appartient à qui l'a payée : « Partagé » n'a plus de
   * sens, et une répartition spéciale non plus — il n'y a rien à répartir.
   * Plutôt que de laisser saisir un état que `perimetre.js` et les règles
   * Firebase refuseront ensuite, la bascule ferme elle-même ces deux portes,
   * et les rouvre en se relevant.
   */
  window.toggleFixedChargePerso = function() {
    const perso = document.getElementById('fixedChargePerso');
    const payeur = document.getElementById('fixedChargePaidBy');
    const partage = payeur ? payeur.querySelector('option[value="partage"]') : null;
    const splitToggle = document.getElementById('fixedChargeSplitToggle');
    const splitGroupe = splitToggle ? splitToggle.closest('.form-group') : null;
    const splitOptions = document.getElementById('fixedChargeSplitOptions');
    if (!perso) return;

    if (perso.checked) {
      if (partage) partage.disabled = true;
      // Un payeur qui ne désigne personne devient celui qui tient l'appareil :
      // le formulaire ne peut pas rester dans un état qu'il refusera.
      if (payeur && payeur.value !== 'vous' && payeur.value !== 'conjointe') {
        payeur.value = payeurParDefaut();
      }
      if (splitToggle) {
        splitToggle.checked = false;
        splitToggle.disabled = true;
      }
      if (splitOptions) splitOptions.style.display = 'none';
      if (splitGroupe) splitGroupe.hidden = true;
    } else {
      if (partage) partage.disabled = false;
      if (splitToggle) splitToggle.disabled = false;
      if (splitGroupe) splitGroupe.hidden = false;
    }
  };

  window.toggleFixedChargeSplit = function() {
    const toggle = document.getElementById('fixedChargeSplitToggle');
    const options = document.getElementById('fixedChargeSplitOptions');
    if (toggle && options) {
      options.style.display = toggle.checked ? 'block' : 'none';
    }
  };

  // Le jumeau côté variable existait ; celui-ci manquait, et le `<select>`
  // n'avait donc aucun gestionnaire. Choisir « Personnalisé » ne révélait
  // jamais les deux champs de pourcentage : ils restaient masqués à 50/50, et
  // `handleFixedChargeSubmit` enregistrait quand même `mode: 'custom'`. On
  // demandait une répartition sur mesure, on obtenait un partage en deux,
  // sans qu'un seul élément de l'écran le dise.
  window.toggleFixedChargeSplitMode = function(value) {
    const customRow = document.getElementById('fixedChargeSplitCustom');
    if (customRow) {
      customRow.style.display = value === 'custom' ? 'block' : 'none';
    }
  };

  log('✅ Module charges fixes initialisé');
}

/**
 * Charge les charges fixes depuis Firebase pour la période actuelle
 *
 * @param {Object} [instantaneDuMois] - Nœud `periods/{mois}` déjà lu dans ce
 *   geste. OPTIONNEL, comme partout : l'omettre coûte une lecture, jamais un
 *   chiffre faux.
 */
export async function loadFixedCharges(instantaneDuMois) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    warn('⚠️ Pas de période active, chargement charges fixes ignoré');
    return;
  }

  try {
    // Use dbGet from db.js which handles UID-scoped paths
    const { dbGet } = await import('../db.js');
    const charges = instantaneDuMois === undefined
      ? await dbGet(`periods/${currentPeriod}/fixedCharges`)
      : (instantaneDuMois?.fixedCharges ?? null);

    if (charges) {
      // Filtrer les charges non supprimées
      const activeCharges = Object.entries(charges)
        .filter(([_, charge]) => !charge.deleted)
        .map(([id, charge]) => ({ id, ...charge }));

      // Le nœud complet est déjà lu : recueillir les entrées supprimées
      // ici évite une seconde lecture pour la corbeille.
      setState('deleted.fixedCharges', collectDeleted(charges));
      setState('fixedCharges', activeCharges);
      log(`📊 ${activeCharges.length} charges fixes chargées`);
    } else {
      setState('deleted.fixedCharges', []);
      setState('fixedCharges', []);
      log('📊 Aucune charge fixe pour cette période');
    }

    renderFixedCharges();
    // Le nombre d'éléments supprimés vient de changer.
    refreshTrashButton();
    // Les charges localisées aussi, et le graphique de tendances devient
    // périmé. Ces vues se raccordent ici plutôt qu'au bilan : celui-ci sort
    // par anticipation quand aucun salaire n'est saisi.
    refreshMapButton();
    invalidateTrends();
  } catch (error) {
    logError('❌ Erreur chargement charges fixes :', error);
    toast.error('Erreur de chargement des charges fixes');
  }
}

/**
 * Sauvegarde une charge fixe (ajout ou édition)
 *
 * Le corps de l'écriture vit dans `enregistrerFixedCharge`. Cette enveloppe ne fait que la
 * protéger : sur une connexion lente, la modale reste ouverte et le bouton
 * actif le temps que `dbPush` réponde, et le second appui — le réflexe
 * naturel devant un écran qui ne bouge pas — écrivait une seconde charge.
 */
export async function saveFixedCharge() {
  const bouton = document.getElementById('saveFixedCharge');
  const rendreLeBouton = occuperLeBouton(bouton);

  try {
    await uneSeuleFois('charge-fixe', enregistrerFixedCharge);
  } finally {
    rendreLeBouton();
  }
}

/**
 * Sauvegarde une charge fixe (ajout ou édition) — le corps, sans la garde
 */
async function enregistrerFixedCharge() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const chargeId = document.getElementById('fixedChargeId').value;
  const description = document.getElementById('fixedChargeDescription').value.trim();
  const amount = parseMontant(document.getElementById('fixedChargeAmount').value);
  const category = document.getElementById('fixedChargeCategory').value;
  const paidBy = document.getElementById('fixedChargePaidBy').value;
  // Le périmètre : commun par défaut, c'est-à-dire le comportement d'avant.
  const perimetre = document.getElementById('fixedChargePerso')?.checked === true
    ? PERIMETRES.SOLO
    : PERIMETRES.COMMUN;
  const destination = document.getElementById('fixedChargeDestination')?.value || '';
  // Chaîne vide plutôt que `null` quand aucune enveloppe n'est choisie :
  // Firebase supprime la clé sur `null`, et une édition qui détache une charge
  // de son enveloppe doit effacer l'ancienne valeur, pas la laisser en place.
  const envelope = document.getElementById('fixedChargeEnvelope')?.value || '';
  // À défaut de saisie, le jour courant : `timestamp` ne dit que le moment de
  // l'écriture, et la reconduction le réécrit chaque mois.
  const date = document.getElementById('fixedChargeDate')?.value || dateDuJour();
  const recurring = document.getElementById('fixedChargeRecurring')?.checked ?? true;

  // Répartition spéciale
  const splitToggle = document.getElementById('fixedChargeSplitToggle');
  let splitOverride = null;
  if (splitToggle && splitToggle.checked) {
    const splitMode = document.getElementById('fixedChargeSplitMode').value;
    if (splitMode === 'custom') {
      const vous = parseInt(document.getElementById('fixedChargeSplitVous').value) || 50;
      const conjointe = parseInt(document.getElementById('fixedChargeSplitConjointe').value) || 50;
      if (vous + conjointe !== 100) {
        toast.error('La répartition doit totaliser 100%');
        return;
      }
      splitOverride = { mode: 'custom', vous, conjointe };
    } else {
      splitOverride = { mode: '50-50' };
    }
  }

  // Validation
  const descriptionValide = validateChargeName(description);
  if (!descriptionValide.valid) {
    toast.error(descriptionValide.error);
    return;
  }

  const montantValide = validateChargeAmount(amount);
  if (!montantValide.valid) {
    toast.error(montantValide.error);
    return;
  }

  if (!category) {
    toast.error('Catégorie requise');
    return;
  }

  if (!paidBy) {
    toast.error('Payeur requis');
    return;
  }

  // Le même contrôle que les règles Firebase appliquent côté serveur. Les deux
  // existent à dessein : le serveur pour que ce soit vrai même hors de cette
  // application, le client pour que le refus s'explique avant l'écriture
  // plutôt qu'après — sans quoi la saisie partirait grossir la file hors ligne.
  const perimetreValide = perimetreEcrivable(perimetre, paidBy);
  if (!perimetreValide.valide) {
    toast.error(perimetreValide.erreur);
    return;
  }

  try {
    const chargeData = {
      description,
      amount,
      category,
      paidBy,
      perimetre,
      destination,
      envelope,
      date,
      recurring,
      splitOverride,
      timestamp: Date.now(),
      deleted: false
    };

    // Use dbUpdate/dbPush from db.js which handles UID-scoped paths
    const { dbUpdate, dbPush } = await import('../db.js');

    let key;
    if (chargeId) {
      // Édition : la charge reste dans son mois, même si sa date change.
      // C'est un choix, pas une contrainte technique. Cf. `variable-charges.js`.
      key = chargeId;
      await dbUpdate(`periods/${currentPeriod}/fixedCharges/${key}`, chargeData);
      toast.success('Charge modifiée');
    } else {
      // La date décide du mois, ici aussi.
      //
      // `reconduction.js` tient déjà cet invariant à chaque report : il redate
      // la charge dans le mois d'arrivée pour éviter « une charge qui dit
      // appartenir à un mois où elle ne figure pas ». La création ne le tenait
      // pas, et c'est par elle que l'écart entrait.
      //
      // Le report REDATE parce qu'il recopie une charge qui revient vraiment
      // chaque mois. La création, elle, ne redate pas : la date saisie est ce
      // que la personne a déclaré, et la réécrire en silence pour la faire
      // entrer dans le mois affiché serait inventer à sa place.
      const periodeCible = periodeDeLaDate(chargeData.date) || currentPeriod;
      key = await dbPush(`periods/${periodeCible}/fixedCharges`, chargeData);
      toast.success(
        periodeCible === currentPeriod
          ? 'Charge ajoutée'
          : `Charge ajoutée en ${formatPeriod(periodeCible)}, sa date`
      );
    }

    // Mettre à jour le state local
    await loadFixedCharges();
    closeModal('modalAddFixedCharge', true);

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    logError('❌ Erreur sauvegarde charge fixe :', error);
    toast.error('Erreur de sauvegarde');
  }
}

/**
 * Édite une charge fixe existante
 * @param {string} chargeId - ID de la charge à éditer
 */
export function editFixedCharge(chargeId) {
  const charges = getState('fixedCharges') || [];
  const charge = charges.find(c => c.id === chargeId);

  if (!charge) {
    toast.error('Charge introuvable');
    return;
  }

  // Pré-remplir le formulaire
  document.getElementById('fixedChargeId').value = charge.id;
  document.getElementById('fixedChargeDescription').value = charge.description;
  document.getElementById('fixedChargeAmount').value = charge.amount;
  document.getElementById('fixedChargeCategory').value = charge.category;
  document.getElementById('fixedChargePaidBy').value = charge.paidBy;
  // La case, puis le couplage qu'elle entraîne — sinon rouvrir une dépense
  // perso proposerait « Partagé » et la répartition spéciale, deux choix que
  // l'enregistrement refuserait.
  const persoEl = document.getElementById('fixedChargePerso');
  if (persoEl) persoEl.checked = estSolo(charge);
  window.toggleFixedChargePerso?.();
  const destEl = document.getElementById('fixedChargeDestination');
  if (destEl) destEl.value = charge.destination || '';
  // Repeupler plutôt que fixer la valeur : c'est ce qui permet de rattacher
  // après coup une dépense oubliée, y compris à une enveloppe close depuis.
  populateEnvelopeSelect('fixedChargeEnvelope', charge.envelope || '');
  // Les charges antérieures à ce champ n'ont que `timestamp` : le repli évite
  // qu'une simple correction de montant ne les redate d'aujourd'hui.
  const dateEl = document.getElementById('fixedChargeDate');
  if (dateEl) dateEl.value = dateSaisissable(charge);
  const recurringEl = document.getElementById('fixedChargeRecurring');
  if (recurringEl) recurringEl.checked = charge.recurring !== false;

  // Restaurer splitOverride
  const splitToggle = document.getElementById('fixedChargeSplitToggle');
  const splitOptions = document.getElementById('fixedChargeSplitOptions');
  if (splitToggle && charge.splitOverride) {
    splitToggle.checked = true;
    splitOptions.style.display = 'block';
    document.getElementById('fixedChargeSplitMode').value = charge.splitOverride.mode;
    const customRow = document.getElementById('fixedChargeSplitCustom');
    if (charge.splitOverride.mode === 'custom') {
      customRow.style.display = 'flex';
      document.getElementById('fixedChargeSplitVous').value = charge.splitOverride.vous || 50;
      document.getElementById('fixedChargeSplitConjointe').value = charge.splitOverride.conjointe || 50;
    } else {
      customRow.style.display = 'none';
    }
  } else if (splitToggle) {
    splitToggle.checked = false;
    splitOptions.style.display = 'none';
  }

  accorderModaleFixed(true);

  showModal('modalAddFixedCharge');
}

/**
 * Supprime une charge fixe (soft delete)
 * @param {string} chargeId - ID de la charge à supprimer
 */
export async function deleteFixedCharge(chargeId) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const charges = getState('fixedCharges') || [];
  const charge = charges.find(c => c.id === chargeId);

  if (!charge) {
    toast.error('Charge introuvable');
    return;
  }

  const confirmed = await showConfirmModal(`Supprimer "${charge.description}" (${formatCurrency(charge.amount)}) ?`);
  if (!confirmed) return;

  try {
    // Use dbUpdate from db.js which handles UID-scoped paths
    const { dbUpdate } = await import('../db.js');

    // Soft delete
    await dbUpdate(`periods/${currentPeriod}/fixedCharges/${chargeId}`, { deleted: true });

    // Mettre à jour le state local
    await loadFixedCharges();
    toast.success('Charge supprimée', {
      onUndo: async () => {
        await dbUpdate(`periods/${currentPeriod}/fixedCharges/${chargeId}`, { deleted: false });
        await loadFixedCharges();
        calculateSummary();
        toast.success('Suppression annulée');
      }
    });

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    logError('❌ Erreur suppression charge fixe :', error);
    toast.error('Erreur de suppression');
  }
}

/**
 * Ce que ces charges coûtent sur une année, et ce qui a augmenté
 *
 * Un loyer se lit par mois : c'est ainsi qu'il se paie. Un abonnement, non —
 * 9,99 € ne se remarquent jamais, 119,88 € se discutent. L'application
 * n'affichait que le mois, et le foyer n'avait aucun endroit où lire ce que
 * ses charges récurrentes lui coûtent sur l'année.
 *
 * La comparaison à l'an dernier n'apparaît que si l'historique la porte :
 * elle est calculée dans `loadPeriodData`, sur l'instantané déjà lu, et vaut
 * `null` tant que le mois d'il y a douze mois manque.
 *
 * `textContent` et non `innerHTML` : un total n'a aucune raison d'ouvrir un
 * site d'injection de plus.
 *
 * @param {Array<Object>} charges - Les charges affichées
 * @returns {void}
 */
/**
 * Les hausses que la liste affichée porte encore
 *
 * `haussesChargesFixes` est calculé une fois, au chargement du mois, sur
 * l'instantané que `loadPeriodData` avait sous la main. Supprimer une charge
 * ou en corriger le montant réaffiche la liste sans repasser par là : le pied
 * de liste continuait alors de nommer « Loyer, Internet » quand le loyer venait
 * d'être supprimé, et d'annoncer un écart mensuel qui le comptait encore.
 *
 * Recalculer ici est impossible — la comparaison exige le mois d'il y a douze
 * mois, que ce module n'a pas. On retient donc les seules lignes que la liste
 * confirme, au libellé ET au montant : une charge repassée de 990 à 950 € n'a
 * plus augmenté de 40 €, et le dire serait aussi faux que de la nommer absente.
 *
 * @param {Object|null} hausses - Sortie de `haussesDepuisLAnDernier`
 * @param {Array<Object>} charges - Les charges réellement affichées
 * @returns {{lignes: Array<Object>, ecartMensuel: number}}
 */
function haussesEncoreVraies(hausses, charges) {
  const vide = { lignes: [], ecartMensuel: 0 };
  if (!hausses || !Array.isArray(hausses.lignes)) return vide;

  const actives = (Array.isArray(charges) ? charges : [])
    .filter(charge => charge && !charge.deleted);

  const lignes = hausses.lignes.filter(ligne => actives.some(charge =>
    String(charge.description || '').trim() === String(ligne.description || '').trim()
    && Number(charge.amount) === Number(ligne.apres)
  ));

  return {
    lignes,
    ecartMensuel: lignes.reduce((somme, ligne) => somme + (Number(ligne.ecart) || 0), 0)
  };
}

function afficherLeCoutAnnuel(charges) {
  const element = document.getElementById('fixedChargesAnnuel');
  if (!element) return;

  const { parAn, nombre, ponctuelles } = coutDesChargesFixes(charges);

  if (nombre === 0 || !(parAn > 0)) {
    element.hidden = true;
    element.textContent = '';
    return;
  }

  const phrases = [`Soit ${formatCurrency(parAn)} sur une année`];

  // Sans cette phrase, le total paraîtrait arbitraire : il ne vaut pas douze
  // fois le total mensuel affiché juste au-dessus, et rien à l'écran ne dirait
  // pourquoi. Une ponctuelle n'y est comptée qu'une fois.
  if (ponctuelles > 0) {
    phrases.push(
      `${ponctuelles} ${ponctuelles > 1 ? 'charges ponctuelles comptées' : 'charge ponctuelle comptée'} `
      + 'une seule fois'
    );
  }

  const hausses = haussesEncoreVraies(getState('haussesChargesFixes'), charges);
  if (hausses.lignes.length > 0) {
    const n = hausses.lignes.length;
    phrases.push(
      `${n} ${n > 1 ? 'ont augmenté' : 'a augmenté'} depuis l'an dernier `
      + `(+ ${formatCurrency(hausses.ecartMensuel)} par mois) : `
      + hausses.lignes.map(ligne => ligne.description).join(', ')
    );
  }

  element.textContent = phrases.join(' · ');
  element.hidden = false;
}

/**
 * Affiche la liste des charges fixes dans le DOM
 */
export function renderFixedCharges() {
  const charges = getState('fixedCharges') || [];
  const listElement = document.getElementById('fixedChargesList');
  const totalElement = document.getElementById('fixedChargesTotal');

  if (!listElement) {
    warn('⚠️ Element #fixedChargesList introuvable');
    return;
  }

  // Vider la liste
  listElement.innerHTML = '';

  if (charges.length === 0) {
    listElement.innerHTML = '<p class="empty-state">Aucune charge fixe pour cette période'
      + '<small>Ce qui revient chaque mois pour le même montant : loyer,'
      + ' assurance, abonnements. Elles sont reportées automatiquement d\'un'
      + ' mois sur l\'autre.</small></p>';
    afficherTotalDeListe(totalElement, []);
    afficherLeCoutAnnuel([]);
    return;
  }

  // Grouper par catégorie, la plus dépensière en tête, et dater chaque groupe.
  //
  // Rien n'était trié : les charges sortaient dans l'ordre des clés Firebase,
  // c'est-à-dire l'ordre de création, et les catégories dans celui de la
  // première charge rencontrée. Invisible tant qu'aucune date ne s'affichait —
  // sans repère temporel, un ordre arbitraire ressemble à un ordre.
  const groupes = grouperParCategorie(charges);

  // Afficher par catégorie
  groupes.forEach(({ categorie: category, charges: categoryCharges, total: categoryTotal }) => {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'charge-category';
    // Le libellé de la catégorie, porté par l'élément plutôt que relu depuis
    // l'en-tête : celui-ci mêle l'emoji, le nom et le montant dans le même
    // nœud de texte. `accorderLesSousTotaux` s'en sert pour refléter une
    // recherche.
    categoryDiv.dataset.categorie = category;
    categoryDiv.innerHTML = `
      <h4 class="category-header">
        ${escapeHtml(getCategoryIcon(category))} ${escapeHtml(category)}
        <span class="category-total">${formatCurrency(categoryTotal)}</span>
      </h4>
    `;

    const chargesList = document.createElement('div');
    chargesList.className = 'charges-list';

    categoryCharges.forEach(charge => {
      const chargeDiv = document.createElement('div');
      chargeDiv.className = 'charge-item';
      chargeDiv.dataset.id = charge.id;
      const dateLisible = formatDate(dateDeLaCharge(charge));
      const dateTag = dateLisible
        ? `<span class="charge-date">${escapeHtml(dateLisible)}</span>`
        : '';
      const destinationTag = charge.destination
        ? `<span class="charge-destination">→ ${escapeHtml(charge.destination)}</span>`
        : '';
      const ponctuelTag = charge.recurring === false
        ? '<span class="charge-ponctuel">ponctuelle</span>'
        : '';
      const splitTag = charge.splitOverride
        ? `<span class="charge-split-tag">${charge.splitOverride.mode === '50-50' ? '50/50' : `${escapeHtml(charge.splitOverride.vous)}/${escapeHtml(charge.splitOverride.conjointe)}`}</span>`
        : '';
      // Une dépense perso se voit dans la liste, sinon elle se confond avec
      // une charge commune et son absence du bilan devient inexplicable.
      const perimetreTag = estSolo(charge)
        ? '<span class="charge-perimetre-tag">perso</span>'
        : '';
      chargeDiv.innerHTML = `
        <div class="charge-info">
          <span class="charge-description">${escapeHtml(charge.description)} ${ponctuelTag} ${splitTag}${perimetreTag}</span>
          <span class="charge-payer">${dateTag}Payé par ${escapeHtml(formatPaidBy(charge.paidBy))} ${destinationTag}</span>
          ${etiquetteEnveloppe(charge)}
        </div>
        <div class="charge-actions">
          <span class="charge-amount">${formatCurrency(charge.amount)}</span>
          <button class="btn-icon" data-action="editFixedCharge" data-arg="${escapeHtml(charge.id)}" aria-label="Modifier ${escapeHtml(charge.description || '')}">
            ✏️
          </button>
          <button class="btn-icon btn-delete" data-action="deleteFixedCharge" data-arg="${escapeHtml(charge.id)}" aria-label="Supprimer ${escapeHtml(charge.description || '')}">
            🗑️
          </button>
        </div>
      `;
      chargesList.appendChild(chargeDiv);
    });

    categoryDiv.appendChild(chargesList);
    listElement.appendChild(categoryDiv);
  });

  // Afficher le total — commun d'abord, perso à part.
  afficherTotalDeListe(totalElement, charges);
  afficherLeCoutAnnuel(charges);
}

/**
 * Retourne l'icône emoji pour une catégorie (depuis custom-lists)
 * @param {string} category - Nom de la catégorie
 * @returns {string} Emoji icône
 */
function getCategoryIcon(category) {
  return getCategoryEmoji(category);
}

/**
 * Le payeur proposé à l'ouverture : celui qui tient le téléphone
 *
 * `form.reset()` rend le select à sa première option — `vous` — quel que soit
 * l'appareil. Sur le second téléphone, chaque charge saisie sans y penser était
 * donc attribuée à l'autre.
 *
 * @returns {string} 'vous' ou 'conjointe'
 */
function payeurParDefaut() {
  return normaliserEmplacement(getState('emplacementCourant'));
}

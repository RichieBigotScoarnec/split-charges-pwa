// ===== MODULE : GESTION DES CHARGES VARIABLES =====
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
  formatDateEtHeure, dateDuJour, dateSaisissable,
  heureDuJour, heureSaisissable, heureValide,
  periodeDeLaDate, formatPeriod
} from '../utils/date.js';
import { grouperParCategorie } from '../utils/tri.js';
import { afficherTotalDeListe } from '../utils/totaux-liste.js';
import { calculateSummary } from './summary.js';
import { getCategoryIcon as getCategoryEmoji, populateCategorySelect } from './custom-lists.js';
import { populateEnvelopeSelect, etiquetteEnveloppe } from './envelopes.js';
import { initChoixLieu, lieuChoisi, poserLieu, reinitialiserLieu } from './choix-lieu.js';
import { normaliserEmplacement } from '../utils/members.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { exigerElement } from '../utils/diagnostics.js';
import { parseMontant } from '../utils/montant.js';
import { uneSeuleFois, occuperLeBouton } from '../utils/soumission.js';
import { ecouterUneFois } from '../utils/ecouteur.js';
import { categorieProposee } from '../utils/memoire-libelle.js';
import { estSolo, perimetreEcrivable, PERIMETRES } from '../utils/perimetre.js';
import { estEnModeSelection, estChoisie, rafraichirLaBarre } from './selection-charges.js';

/**
 * Initialise le module de gestion des charges variables
 */
/**
 * Show add variable charge modal
 */
export function showAddVariableChargeModal() {
  const chargeIdEl = document.getElementById('variableChargeId');
  const formEl = document.getElementById('variableChargeForm');

  if (chargeIdEl) chargeIdEl.value = '';
  if (formEl) formEl.reset();

  // Formulaire vierge : les propositions de catégorie reprennent.
  reinitialiserLaProposition(false);

  // Repeuplée à l'ouverture : une enveloppe créée depuis le début de la session
  // doit être proposée sans avoir à recharger l'application.
  populateEnvelopeSelect('variableChargeEnvelope', '');

  // Le payeur proposé est celui qui tient le téléphone. `form.reset()` rendait
  // le select à sa première option, `vous`, quel que soit l'appareil.
  const payeurEl = document.getElementById('variableChargePaidBy');
  if (payeurEl) payeurEl.value = payeurParDefaut();

  // Le jour courant par défaut : c'est le cas de loin le plus fréquent, et un
  // champ vide obligerait à le saisir à chaque fois. Il reste modifiable, ce
  // qui est tout l'intérêt — régulariser une dépense de samedi le lundi.
  const dateEl = document.getElementById('variableChargeDate');
  if (dateEl) dateEl.value = dateDuJour();

  // Même raison pour l'heure, et une de plus : sur un téléphone, la saisir à
  // la main coûte deux gestes de plus que de l'accepter.
  const heureEl = document.getElementById('variableChargeHeure');
  if (heureEl) heureEl.value = heureDuJour();

  // Reset split override
  const splitToggle = document.getElementById('variableChargeSplitToggle');
  if (splitToggle) {
    splitToggle.checked = false;
    document.getElementById('variableChargeSplitOptions').style.display = 'none';
  }

  reinitialiserLieu();
  // `form.reset()` décoche la case perso, mais ne rouvre ni l'option
  // « Partagé » ni le groupe « Répartition spéciale » que la bascule avait
  // fermés : sans ce rappel, une saisie perso rendrait toutes les suivantes
  // impossibles à partager, jusqu'au rechargement de la page.
  window.toggleVariableChargePerso?.();

  accorderModaleVariable(false);

  // Une saisie neuve repart replié — même si la précédente avait déplié pour
  // montrer son lieu. `form.reset()` ne touche pas à l'attribut `open` d'un
  // `<details>` : sans ce rappel, le dépliant resterait ouvert de saisie en
  // saisie, et le repli n'aurait servi qu'une fois.
  deplierSiRenseigne(false);

  showModal('modalAddVariableCharge');
}

/**
 * Accorde le titre et le bouton de la modale au geste en cours
 *
 * Éditer une charge ouvrait une modale intitulée « Ajouter Charge Variable », dont le
 * bouton disait « Ajouter ». Rien ne distinguait donc une modification d'une
 * création — et un formulaire prérempli qu'on croit vide invite à tout ressaisir.
 *
 * @param {boolean} edition - Vrai si une charge existante est rouverte
 * @returns {void}
 */
function accorderModaleVariable(edition) {
  const titre = document.getElementById('modalAddVariableChargeTitle');
  if (titre) titre.textContent = edition ? 'Modifier Charge Variable' : 'Ajouter Charge Variable';

  const bouton = document.getElementById('saveVariableCharge');
  if (bouton) bouton.textContent = edition ? 'Enregistrer' : 'Ajouter';
}

/**
 * La catégorie du formulaire a-t-elle été choisie à la main ?
 *
 * Tant que non, l'application peut proposer. Dès que l'utilisateur touche au
 * sélecteur, elle se tait pour cette saisie : reposer une proposition sur un
 * choix explicite, ce serait le défaire — et personne ne verrait pourquoi.
 *
 * Remis à faux à chaque ouverture du formulaire, et posé à vrai à l'édition
 * d'une charge : celle-là porte déjà la catégorie que le foyer lui a donnée.
 */
let _categorieChoisie = false;

/**
 * Écarte la proposition et cesse d'en faire pour cette saisie
 * @returns {void}
 */
function oublierLaProposition() {
  const indice = document.getElementById('variableChargeCategoryHint');
  if (indice) {
    indice.hidden = true;
    indice.textContent = '';
  }
}

/**
 * Rouvre la porte aux propositions — à l'ouverture d'un formulaire vierge
 * @param {boolean} [dejaRenseignee] - Vrai à l'édition d'une charge existante
 * @returns {void}
 */
function reinitialiserLaProposition(dejaRenseignee = false) {
  _categorieChoisie = dejaRenseignee;
  oublierLaProposition();
}

/**
 * Propose la catégorie que le libellé appelle, s'il en appelle une
 *
 * L'application ne devine pas : elle relit ce que le foyer a lui-même saisi.
 * Et elle le DIT — une catégorie qui se pose toute seule sans un mot se lit
 * comme un bogue, là où « d'après vos 4 saisies » se corrige d'un geste.
 *
 * @returns {void}
 */
function proposerLaCategorie() {
  const champ = document.getElementById('variableChargeDescription');
  const select = document.getElementById('variableChargeCategory');
  const indice = document.getElementById('variableChargeCategoryHint');
  if (!champ || !select) return;

  if (_categorieChoisie) return;

  const vu = categorieProposee(champ.value, getState('memoireLibelles'));
  if (!vu) {
    // La proposition précédente ne vaut plus : le libellé a changé.
    //
    // La garde était `if (!select.value)`, c'est-à-dire l'inverse de son
    // intention : une proposition posée REMPLIT le sélecteur, donc elle ne
    // s'effaçait jamais. Écrire « Intermarché » puis le remplacer par « Cinéma »
    // laissait « Courses » en place, avec l'indice « d'après vos 2 saisies de ce
    // libellé » — une justification portant sur un libellé qui n'est plus là.
    //
    // La catégorie n'est retirée QUE si l'indice est visible, c'est-à-dire si
    // c'est bien l'application qui l'a posée. `_categorieChoisie` protège déjà
    // du choix manuel ; ceci protège de la charge qu'on vient de rouvrir, dont
    // la catégorie vient de la base et non d'une proposition.
    const indiceVisible = indice && !indice.hidden;
    if (indiceVisible) select.value = '';
    oublierLaProposition();
    return;
  }

  // Une catégorie supprimée depuis reste dans l'historique : la proposer
  // poserait une valeur que le sélecteur ne porte pas, donc rien du tout.
  const existe = [...select.options].some(option => option.value === vu.categorie);
  if (!existe) return;

  select.value = vu.categorie;

  if (indice) {
    indice.textContent = vu.exact
      ? `Proposée d'après vos ${vu.saisies} saisies de ce libellé`
      : `Proposée d'après ${vu.saisies} saisies commençant ainsi`;
    indice.hidden = false;
  }
}

/**
 * Branche la proposition de catégorie sur le formulaire complet
 * @returns {void}
 */
function brancherLaProposition() {
  const champ = document.getElementById('variableChargeDescription');
  if (champ) ecouterUneFois(champ, 'input', proposerLaCategorie);

  const select = document.getElementById('variableChargeCategory');
  if (select) {
    ecouterUneFois(select, 'change', () => {
      _categorieChoisie = true;
      oublierLaProposition();
    });
  }
}

export function initVariableCharges() {
  log('📦 Initialisation module charges variables');

  // Les écouteurs d'abord, le remplissage ensuite.
  //
  // L'ordre inverse coûtait le bouton : `populateCategorySelect` lève si la
  // liste des catégories n'est pas exploitable, l'étape entière est rattrapée
  // par `runStep`, et « + Ajouter » restait sans écouteur — un bouton bien
  // visible sur lequel il ne se passait rien. Attacher d'abord garantit que
  // l'action reste possible même si le reste de l'initialisation échoue.
  const addBtn = exigerElement('addVariableChargeBtn', 'ouvrir l\'ajout de charge variable');
  if (addBtn) {
    ecouterUneFois(addBtn, 'click', showAddVariableChargeModal);
  }

  const saveBtn = exigerElement('saveVariableCharge', 'enregistrer une charge variable');
  if (saveBtn) {
    ecouterUneFois(saveBtn, 'click', saveVariableCharge);
  }

  brancherLaProposition();

  // Avant tout remplissage, comme les deux écouteurs ci-dessus : si
  // `populateCategorySelect` lève, `runStep` rattrape l'étape entière et le
  // champ « Lieu » resterait sans écouteur — visible, et inerte. C'est
  // exactement la panne que ce fichier documente depuis le bouton « Ajouter »,
  // et je l'avais réintroduite en plaçant cet appel après.
  initChoixLieu();

  // Peupler le select catégorie dynamiquement
  populateCategorySelect('variableChargeCategory');

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.editVariableCharge = editVariableCharge;
  window.deleteVariableCharge = deleteVariableCharge;
  /**
   * Bascule « dépense perso », et ce qu'elle rend impossible
   *
   * Une dépense perso appartient à qui l'a payée : « Partagé » n'a plus de
   * sens, et une répartition spéciale non plus — il n'y a rien à répartir.
   * Plutôt que de laisser saisir un état que `perimetre.js` et les règles
   * Firebase refuseront ensuite, la bascule ferme elle-même ces deux portes,
   * et les rouvre en se relevant.
   */
  window.toggleVariableChargePerso = function() {
    const perso = document.getElementById('variableChargePerso');
    const payeur = document.getElementById('variableChargePaidBy');
    const partage = payeur ? payeur.querySelector('option[value="partage"]') : null;
    const splitToggle = document.getElementById('variableChargeSplitToggle');
    const splitGroupe = splitToggle ? splitToggle.closest('.form-group') : null;
    const splitOptions = document.getElementById('variableChargeSplitOptions');
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

  window.toggleVariableChargeSplit = function() {
    const toggle = document.getElementById('variableChargeSplitToggle');
    const options = document.getElementById('variableChargeSplitOptions');
    if (toggle && options) {
      options.style.display = toggle.checked ? 'block' : 'none';
    }
  };
  window.toggleVariableChargeSplitMode = function(value) {
    const customRow = document.getElementById('variableChargeSplitCustom');
    if (customRow) {
      customRow.style.display = value === 'custom' ? 'block' : 'none';
    }
  };

  log('✅ Module charges variables initialisé');
}

/**
 * Charge les charges variables depuis Firebase pour la période actuelle
 *
 * @param {Object} [instantaneDuMois] - Nœud `periods/{mois}` déjà lu dans ce
 *   geste. Le paramètre est OPTIONNEL : l'omettre coûte une lecture, jamais un
 *   chiffre faux. Il existe pour les gestes qui ont déjà l'instantané en main
 *   et doivent lire tout le mois d'un seul état — un règlement de solde, dont
 *   la justesse tient à ce que charges, salaires et remboursements datent du
 *   même instant.
 */
export async function loadVariableCharges(instantaneDuMois) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    warn('⚠️ Pas de période active, chargement charges variables ignoré');
    return;
  }

  try {
    // Use dbGet from db.js which handles UID-scoped paths
    const { dbGet } = await import('../db.js');
    const charges = instantaneDuMois === undefined
      ? await dbGet(`periods/${currentPeriod}/variableCharges`)
      : (instantaneDuMois?.variableCharges ?? null);

    if (charges) {
      // Filtrer les charges non supprimées et valides
      const activeCharges = Object.entries(charges)
        .filter(([id, charge]) => {
          // Filtrer les charges supprimées
          if (charge.deleted) return false;
          // Filtrer les charges invalides (sans id ou amount invalide)
          // Note: description est optionnel (anciennes charges peuvent ne pas en avoir)
          if (!id || typeof charge.amount !== 'number') {
            warn(`⚠️ Charge invalide ignorée:`, id, charge);
            return false;
          }
          return true;
        })
        .map(([id, charge]) => ({ id, ...charge }));

      // Le nœud complet est déjà lu : recueillir les entrées supprimées
      // ici évite une seconde lecture pour la corbeille.
      setState('deleted.variableCharges', collectDeleted(charges));
      setState('variableCharges', activeCharges);
      log(`📊 ${activeCharges.length} charges variables chargées`);
    } else {
      setState('deleted.variableCharges', []);
      setState('variableCharges', []);
      log('📊 Aucune charge variable pour cette période');
    }

    renderVariableCharges();
    // Le nombre d'éléments supprimés vient de changer.
    refreshTrashButton();
    // Les charges localisées aussi, et le graphique de tendances devient
    // périmé. Ces vues se raccordent ici plutôt qu'au bilan : celui-ci sort
    // par anticipation quand aucun salaire n'est saisi.
    refreshMapButton();
    invalidateTrends();
  } catch (error) {
    logError('❌ Erreur chargement charges variables :', error);
    toast.error('Erreur de chargement des charges variables');
  }
}

/**
 * Sauvegarde une charge variable (ajout ou édition)
 *
 * Le corps de l'écriture vit dans `enregistrerVariableCharge`. Cette enveloppe ne fait que la
 * protéger : sur une connexion lente, la modale reste ouverte et le bouton
 * actif le temps que `dbPush` réponde, et le second appui — le réflexe
 * naturel devant un écran qui ne bouge pas — écrivait une seconde charge.
 */
export async function saveVariableCharge() {
  const bouton = document.getElementById('saveVariableCharge');
  const rendreLeBouton = occuperLeBouton(bouton);

  try {
    await uneSeuleFois('charge-variable', enregistrerVariableCharge);
  } finally {
    rendreLeBouton();
  }
}

/**
 * Sauvegarde une charge variable (ajout ou édition) — le corps, sans la garde
 */
async function enregistrerVariableCharge() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const chargeId = document.getElementById('variableChargeId').value;
  const description = document.getElementById('variableChargeDescription').value.trim();
  const amount = parseMontant(document.getElementById('variableChargeAmount').value);
  const category = document.getElementById('variableChargeCategory').value;
  const paidBy = document.getElementById('variableChargePaidBy').value;
  // Le périmètre : commun par défaut, c'est-à-dire le comportement d'avant.
  const perimetre = document.getElementById('variableChargePerso')?.checked === true
    ? PERIMETRES.SOLO
    : PERIMETRES.COMMUN;
  // Reconduction : **il faut l'avoir demandée**. Une charge fixe sans
  // indicateur est récurrente — c'est le défaut de son formulaire — mais
  // appliquer ce défaut aux variables recopierait chaque mois tout ce que le
  // foyer a jamais saisi.
  const recurring = document.getElementById('variableChargeRecurring')?.checked === true;
  // Chaîne vide plutôt que `null` quand aucune enveloppe n'est choisie :
  // Firebase supprime la clé sur `null`, et une édition qui détache une charge
  // de son enveloppe doit effacer l'ancienne valeur, pas la laisser en place.
  const envelope = document.getElementById('variableChargeEnvelope')?.value || '';
  // À défaut de saisie, le jour courant : une charge sans date ne pourrait plus
  // être située, et `timestamp` ne dit que le moment de l'écriture.
  const date = document.getElementById('variableChargeDate')?.value || dateDuJour();
  // Vide si le champ l'est : l'heure est facultative, et une chaîne vide
  // efface celle qu'une édition vient de retirer. `null` supprimerait la clé
  // sans la remplacer, ce qui laisserait l'ancienne valeur en base.
  const heure = heureValide(document.getElementById('variableChargeHeure')?.value);
  // Le lieu retenu dans le champ de recherche, ou celui que la charge portait
  // déjà — `poserLieu` l'a remis en place à la réouverture.
  const location = lieuChoisi();

  // Répartition spéciale
  const splitToggle = document.getElementById('variableChargeSplitToggle');
  let splitOverride = null;
  if (splitToggle && splitToggle.checked) {
    const splitMode = document.getElementById('variableChargeSplitMode').value;
    if (splitMode === 'custom') {
      const vous = parseInt(document.getElementById('variableChargeSplitVous').value) || 50;
      const conjointe = parseInt(document.getElementById('variableChargeSplitConjointe').value) || 50;
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
      recurring,
      envelope,
      date,
      heure,
      // `null` supprime la clé côté Firebase : c'est exactement ce qu'on veut
      // quand le lieu vient d'être retiré.
      location: location || null,
      splitOverride,
      timestamp: Date.now(),
      deleted: false
    };

    // Use dbUpdate/dbPush from db.js which handles UID-scoped paths
    const { dbUpdate, dbPush } = await import('../db.js');

    let key;
    if (chargeId) {
      // Édition : la charge reste dans son mois, même si sa date change.
      //
      // Techniquement, la déplacer serait possible : `reconduction.js` écrit
      // déjà plusieurs chemins en une seule mise à jour atomique. C'est donc un
      // CHOIX, pas une contrainte — une date corrigée par mégarde ferait
      // disparaître la charge de l'écran, et un déplacement doit se demander,
      // pas se subir. Pour ranger une charge ailleurs : la supprimer et la
      // ressaisir à sa date.
      key = chargeId;
      await dbUpdate(`periods/${currentPeriod}/variableCharges/${key}`, chargeData);
      toast.success('Charge modifiée');
    } else {
      // Ajout : la date décide du mois, pas l'écran depuis lequel on saisit.
      //
      // Les deux valeurs vivaient séparément — le champ se pré-remplit du jour
      // courant, l'écriture visait le mois affiché. Consulter juillet le
      // 1er septembre et saisir une dépense la rangeait sous `periods/2026-07`
      // en la datant du 1er septembre : total de juillet gonflé, solde faux
      // d'autant entre les deux personnes. Cf. `periodeDeLaDate`.
      const periodeCible = periodeDeLaDate(chargeData.date) || currentPeriod;
      key = await dbPush(`periods/${periodeCible}/variableCharges`, chargeData);

      // Nommer le mois d'arrivée quand ce n'est pas celui qu'on regarde : la
      // liste à l'écran est celle d'un autre mois, la charge n'y paraîtra pas,
      // et sans un mot elle semblerait ne s'être enregistrée nulle part.
      toast.success(
        periodeCible === currentPeriod
          ? 'Charge ajoutée'
          : `Charge ajoutée en ${formatPeriod(periodeCible)}, sa date`
      );
    }

    // Mettre à jour le state local
    await loadVariableCharges();
    closeModal('modalAddVariableCharge', true);

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    logError('❌ Erreur sauvegarde charge variable :', error);
    toast.error('Erreur de sauvegarde');
  }
}

/**
 * Édite une charge variable existante
 * @param {string} chargeId - ID de la charge à éditer
 */
export function editVariableCharge(chargeId) {
  const charges = getState('variableCharges') || [];
  const charge = charges.find(c => c.id === chargeId);

  if (!charge) {
    toast.error('Charge introuvable');
    return;
  }

  // Une charge rouverte porte DÉJÀ la catégorie que le foyer lui a donnée :
  // la remplacer par une proposition défairait un choix explicite, et sur une
  // simple correction de libellé personne ne verrait pourquoi.
  reinitialiserLaProposition(true);

  // Pré-remplir le formulaire
  document.getElementById('variableChargeId').value = charge.id;
  document.getElementById('variableChargeDescription').value = charge.description;
  document.getElementById('variableChargeAmount').value = charge.amount;
  document.getElementById('variableChargeCategory').value = charge.category;
  document.getElementById('variableChargePaidBy').value = charge.paidBy;
  // La case, puis le couplage qu'elle entraîne — sinon rouvrir une dépense
  // perso proposerait « Partagé » et la répartition spéciale, deux choix que
  // l'enregistrement refuserait.
  const persoEl = document.getElementById('variableChargePerso');
  if (persoEl) persoEl.checked = estSolo(charge);
  window.toggleVariableChargePerso?.();

  const recurringEl = document.getElementById('variableChargeRecurring');
  if (recurringEl) recurringEl.checked = charge.recurring === true;
  // Repeupler plutôt que fixer la valeur : c'est ce qui permet de rattacher
  // après coup une dépense oubliée, y compris à une enveloppe close depuis.
  populateEnvelopeSelect('variableChargeEnvelope', charge.envelope || '');

  // Les charges antérieures à ce champ n'ont que `timestamp` : le repli les
  // ouvre à leur date d'écriture plutôt qu'à un champ vide, qu'un
  // enregistrement remplacerait par la date du jour.
  const dateEl = document.getElementById('variableChargeDate');
  if (dateEl) dateEl.value = dateSaisissable(charge);

  // Vide pour une charge d'avant ce champ : lui proposer l'heure du jour
  // déplacerait la dépense dans la journée au premier enregistrement.
  const heureEl = document.getElementById('variableChargeHeure');
  if (heureEl) heureEl.value = heureSaisissable(charge);

  // Restaurer splitOverride
  const splitToggle = document.getElementById('variableChargeSplitToggle');
  const splitOptions = document.getElementById('variableChargeSplitOptions');
  if (splitToggle && charge.splitOverride) {
    splitToggle.checked = true;
    splitOptions.style.display = 'block';
    document.getElementById('variableChargeSplitMode').value = charge.splitOverride.mode;
    const customRow = document.getElementById('variableChargeSplitCustom');
    if (charge.splitOverride.mode === 'custom') {
      customRow.style.display = 'flex';
      document.getElementById('variableChargeSplitVous').value = charge.splitOverride.vous || 50;
      document.getElementById('variableChargeSplitConjointe').value = charge.splitOverride.conjointe || 50;
    } else {
      customRow.style.display = 'none';
    }
  } else if (splitToggle) {
    splitToggle.checked = false;
    splitOptions.style.display = 'none';
  }

  poserLieu(charge.location || null);
  accorderModaleVariable(true);

  // Le lieu et l'enveloppe sont repliés par défaut : ils ne concernent qu'une
  // charge sur dix. Mais rouvrir une charge QUI EN PORTE et les cacher serait
  // pire que de les montrer toujours — on croirait la donnée perdue, et on la
  // ressaisirait. Le dépliant s'ouvre donc quand il a quelque chose à montrer.
  deplierSiRenseigne(Boolean(charge.location) || Boolean(charge.envelope));

  showModal('modalAddVariableCharge');
}

/**
 * Ouvre le dépliant « Lieu, enveloppe » quand la charge en porte un
 *
 * @param {boolean} renseigne - La charge a-t-elle un lieu ou une enveloppe ?
 */
function deplierSiRenseigne(renseigne) {
  const repli = document.querySelector('#modalAddVariableCharge .form-repli');
  if (!repli) return;
  repli.open = renseigne;
}

/**
 * Supprime une charge variable (soft delete)
 * @param {string} chargeId - ID de la charge à supprimer
 */
export async function deleteVariableCharge(chargeId) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const charges = getState('variableCharges') || [];
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
    await dbUpdate(`periods/${currentPeriod}/variableCharges/${chargeId}`, { deleted: true });

    // Mettre à jour le state local
    await loadVariableCharges();
    toast.success('Charge supprimée', {
      onUndo: async () => {
        await dbUpdate(`periods/${currentPeriod}/variableCharges/${chargeId}`, { deleted: false });
        await loadVariableCharges();
        calculateSummary();
        toast.success('Suppression annulée');
      }
    });

    // Recalculer le bilan
    calculateSummary();
  } catch (error) {
    logError('❌ Erreur suppression charge variable :', error);
    toast.error('Erreur de suppression');
  }
}

/**
 * Affiche la liste des charges variables dans le DOM
 */
export function renderVariableCharges() {
  const charges = getState('variableCharges') || [];
  const listElement = document.getElementById('variableChargesList');
  const totalElement = document.getElementById('variableChargesTotal');

  if (!listElement) {
    warn('⚠️ Element #variableChargesList introuvable');
    return;
  }

  // Vider la liste
  listElement.innerHTML = '';

  // Relu à chaque rendu plutôt que porté par un paramètre : la liste se
  // redessine depuis six endroits, et l'un d'eux finirait par oublier de le
  // passer — une liste sans ses cases, au milieu d'une sélection en cours.
  const enSelection = estEnModeSelection();

  if (charges.length === 0) {
    listElement.innerHTML = '<p class="empty-state">Aucune charge variable pour cette période'
      + '<small>Les dépenses du quotidien, dont le montant change : courses,'
      + ' essence, restaurant.</small></p>';
    afficherTotalDeListe(totalElement, []);
    // La barre annonce un compte que cette liste vide vient de démentir.
    rafraichirLaBarre();
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
      // Validation supplémentaire
      if (!charge.id) {
        warn('⚠️ Charge invalide ignorée dans le rendu (pas d\'ID):', charge);
        return;
      }

      const chargeDiv = document.createElement('div');
      chargeDiv.className = 'charge-item';
      chargeDiv.dataset.id = charge.id;
      const splitTag = charge.splitOverride
        ? `<span class="charge-split-tag">${charge.splitOverride.mode === '50-50' ? '50/50' : `${escapeHtml(charge.splitOverride.vous)}/${escapeHtml(charge.splitOverride.conjointe)}`}</span>`
        : '';
      const dateLisible = formatDateEtHeure(charge);
      const dateTag = dateLisible
        ? `<span class="charge-date">${escapeHtml(dateLisible)}</span>`
        : '';
      // Une dépense perso se voit dans la liste, sinon elle se confond avec
      // une charge commune et son absence du bilan devient inexplicable.
      const perimetreTag = estSolo(charge)
        ? '<span class="charge-perimetre-tag">perso</span>'
        : '';
      // Une charge reconduite repart sans montant : la ligne doit le dire,
      // faute de quoi un « 0,00 € » se lit comme une dépense nulle plutôt que
      // comme une saisie qui attend son chiffre.
      const aCompleterTag = charge.recurring === true && !(Number(charge.amount) > 0)
        ? '<span class="charge-a-completer">à compléter</span>'
        : '';
      const locationName = charge.location ? (charge.location.name || charge.location.place) : null;
      const locationTag = locationName
        ? `<span class="charge-location">📍 ${escapeHtml(locationName)}</span>`
        : '';

      // En mode sélection, la ligne porte une case et perd ses deux boutons.
      //
      // Les perdre n'est pas un oubli : le crayon ouvre une modale par-dessus
      // une sélection en cours, et la corbeille ferait deux suppressions
      // concurrentes — l'unitaire et celle du lot — sur la même ligne. Le
      // montant, lui, reste : c'est sur lui qu'on juge ce qu'on coche.
      if (enSelection) {
        const choisie = estChoisie(charge.id);
        chargeDiv.classList.add('charge-item--choisissable');
        if (choisie) chargeDiv.classList.add('charge-item--choisie');
        chargeDiv.innerHTML = `
          <input type="checkbox" class="charge-choix"
                 data-action="basculerChargeChoisie" data-arg="${escapeHtml(charge.id)}"
                 ${choisie ? 'checked' : ''}
                 aria-label="Sélectionner ${escapeHtml(charge.description || 'Sans description')}, ${escapeHtml(formatCurrency(charge.amount || 0))}" />
          <div class="charge-info">
            <span class="charge-description">${escapeHtml(charge.description || 'Sans description')} ${splitTag}${perimetreTag}${aCompleterTag}</span>
            <span class="charge-payer">${dateTag}Payé par ${escapeHtml(formatPaidBy(charge.paidBy))}</span>
            ${etiquetteEnveloppe(charge)}
            ${locationTag}
          </div>
          <div class="charge-actions">
            <span class="charge-amount">${formatCurrency(charge.amount || 0)}</span>
          </div>
        `;
        chargesList.appendChild(chargeDiv);
        return;
      }

      chargeDiv.innerHTML = `
        <div class="charge-info">
          <span class="charge-description">${escapeHtml(charge.description || 'Sans description')} ${splitTag}${perimetreTag}${aCompleterTag}</span>
          <span class="charge-payer">${dateTag}Payé par ${escapeHtml(formatPaidBy(charge.paidBy))}</span>
          ${etiquetteEnveloppe(charge)}
          ${locationTag}
        </div>
        <div class="charge-actions">
          <span class="charge-amount">${formatCurrency(charge.amount || 0)}</span>
          <button class="btn-icon" data-action="editVariableCharge" data-arg="${escapeHtml(charge.id)}" aria-label="Modifier ${escapeHtml(charge.description || '')}">
            ✏️
          </button>
          <button class="btn-icon btn-delete" data-action="deleteVariableCharge" data-arg="${escapeHtml(charge.id)}" aria-label="Supprimer ${escapeHtml(charge.description || '')}">
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

  // La barre suit la liste, et jamais l'inverse : elle annonce un compte et un
  // total qui se lisent sur les lignes qu'on vient de poser. Un changement de
  // mois passe par ici, et c'est ce qui fait retomber le compte à zéro sans que
  // personne ait à prévenir la sélection.
  rafraichirLaBarre();
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

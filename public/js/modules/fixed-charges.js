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
import { formatDate, dateDuJour, dateDeLaCharge, dateSaisissable } from '../utils/date.js';
import { grouperParCategorie } from '../utils/tri.js';
import { calculateSummary } from './summary.js';
import { getCategoryIcon as getCategoryEmoji, populateCategorySelect, populateDestinationSelect } from './custom-lists.js';
import { populateEnvelopeSelect, etiquetteEnveloppe } from './envelopes.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { exigerElement } from '../utils/diagnostics.js';
import { parseMontant } from '../utils/montant.js';
import { normaliserEmplacement } from '../utils/members.js';
import { uneSeuleFois, occuperLeBouton } from '../utils/soumission.js';

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

export function initFixedCharges() {
  log('📦 Initialisation module charges fixes');

  // Les écouteurs avant tout remplissage : si `populateCategorySelect` lève,
  // l'étape entière est rattrapée par `runStep` et le bouton « + Ajouter »
  // resterait sans écouteur, visible mais inerte.
  const addBtn = exigerElement('addFixedChargeBtn', 'ouvrir l\'ajout de charge fixe');
  if (addBtn) {
    addBtn.addEventListener('click', showAddFixedChargeModal);
  }

  const saveBtn = exigerElement('saveFixedCharge', 'enregistrer une charge fixe');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveFixedCharge);
  }

  // Peupler les selects catégorie et destination dynamiquement
  populateCategorySelect('fixedChargeCategory');
  populateDestinationSelect('fixedChargeDestination');

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.editFixedCharge = editFixedCharge;
  window.deleteFixedCharge = deleteFixedCharge;
  window.toggleFixedChargeSplit = function() {
    const toggle = document.getElementById('fixedChargeSplitToggle');
    const options = document.getElementById('fixedChargeSplitOptions');
    if (toggle && options) {
      options.style.display = toggle.checked ? 'block' : 'none';
    }
  };

  log('✅ Module charges fixes initialisé');
}

/**
 * Charge les charges fixes depuis Firebase pour la période actuelle
 */
export async function loadFixedCharges() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    warn('⚠️ Pas de période active, chargement charges fixes ignoré');
    return;
  }

  try {
    // Use dbGet from db.js which handles UID-scoped paths
    const { dbGet } = await import('../db.js');
    const charges = await dbGet(`periods/${currentPeriod}/fixedCharges`);

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

  try {
    const chargeData = {
      description,
      amount,
      category,
      paidBy,
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
      // Édition
      key = chargeId;
      await dbUpdate(`periods/${currentPeriod}/fixedCharges/${key}`, chargeData);
      toast.success('Charge modifiée');
    } else {
      // Ajout
      key = await dbPush(`periods/${currentPeriod}/fixedCharges`, chargeData);
      toast.success('Charge ajoutée');
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
    listElement.innerHTML = '<p class="empty-state">Aucune charge fixe pour cette période</p>';
    if (totalElement) totalElement.textContent = formatCurrency(0);
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
  let total = 0;
  groupes.forEach(({ categorie: category, charges: categoryCharges, total: categoryTotal }) => {
    total += categoryTotal;

    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'charge-category';
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
      chargeDiv.innerHTML = `
        <div class="charge-info">
          <span class="charge-description">${escapeHtml(charge.description)} ${ponctuelTag} ${splitTag}</span>
          <span class="charge-payer">${dateTag}Payé par ${escapeHtml(formatPaidBy(charge.paidBy))} ${destinationTag}</span>
          ${etiquetteEnveloppe(charge)}
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

  // Afficher le total
  if (totalElement) {
    totalElement.textContent = formatCurrency(total);
  }
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

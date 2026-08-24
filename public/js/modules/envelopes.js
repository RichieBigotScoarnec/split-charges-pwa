// ===== MODULE : ENVELOPPES TRANSVERSALES =====
//
// Une enveloppe regroupe des dépenses qui vont ensemble sans partager de
// catégorie ni de mois : une semaine de vacances, un déménagement, un chantier.
// Le plein d'essence de la route des vacances reste rangé dans « Essence » ;
// l'enveloppe le rattache en plus au voyage.
//
// L'enveloppe ne touche jamais au solde. Elle n'est ni un payeur, ni une
// répartition : rien de ce que fait ce module n'entre dans `computeSummary`.
// C'est une étiquette de lecture, et le test `tests/utils/enveloppes.test.js`
// le vérifie en repassant les mêmes charges dans le calcul, avec et sans.

import { getState, setState } from '../state.js';
import { toast } from '../components/toast.js';
import { escapeHtml, formatCurrency } from '../utils/format.js';
import { log, error as logError } from '../utils/debug.js';
import { identifiantDepuisLibelle } from '../utils/identifiant.js';
import { emojisProposes, fusionnerListe } from './custom-lists.js';
import {
  normaliserEnveloppes,
  enveloppesOuvertes,
  enveloppeParId,
  budgetLisible,
  dateLisible,
  fenetreCoherente,
  totalEnveloppe
} from '../utils/enveloppes.js';

/** Nœud Firebase, sous la racine de l'espace de données */
const CHEMIN = 'envelopes';

/**
 * Initialise le module des enveloppes
 * @returns {Promise<void>}
 */
export async function initEnvelopes() {
  log('📦 Initialisation module enveloppes');
  await loadEnvelopes();
  log('✅ Module enveloppes initialisé');
}

/**
 * Charge la liste depuis Firebase
 *
 * L'absence d'enveloppe est le cas normal — c'est même l'état de départ du
 * foyer. Contrairement aux catégories, il n'y a donc aucune liste par défaut à
 * recopier : une enveloppe qu'on n'a pas créée n'a pas de sens.
 *
 * @returns {Promise<void>}
 */
export async function loadEnvelopes() {
  try {
    const { dbGet } = await import('../db.js');
    setState('envelopes', normaliserEnveloppes(await dbGet(CHEMIN)));
    log(`📊 ${getEnveloppes().length} enveloppe(s) chargée(s)`);
  } catch (error) {
    logError('❌ Erreur chargement enveloppes :', error);
    // Une lecture qui échoue ne doit pas laisser l'état précédent en place :
    // il appartiendrait éventuellement à un autre compte.
    setState('envelopes', []);
  }
}

/**
 * @returns {Array<Object>} Enveloppes du foyer, closes comprises
 */
export function getEnveloppes() {
  return getState('envelopes') || [];
}

/**
 * Étiquette d'une enveloppe, prête à être insérée dans une liste de charges
 *
 * Rend une chaîne vide quand la charge ne porte pas d'enveloppe, ou quand
 * l'enveloppe désignée n'existe plus : une charge rattachée à une enveloppe
 * supprimée ne doit pas afficher un identifiant technique.
 *
 * @param {Object} charge - Charge fixe ou variable
 * @returns {string} Fragment HTML échappé, ou chaîne vide
 */
export function etiquetteEnveloppe(charge) {
  const enveloppe = enveloppeParId(getEnveloppes(), charge && charge.envelope);
  if (!enveloppe) return '';
  return `<span class="charge-enveloppe">${escapeHtml(enveloppe.icon)} ${escapeHtml(enveloppe.label)}</span>`;
}

/**
 * Écrit la liste, en préservant ce que l'autre téléphone a pu y ajouter
 *
 * @param {Array<Object>} voulue - Liste telle que cette session la veut
 * @param {Array<Object>} base - Liste d'avant la modification locale
 * @returns {Promise<boolean>} Vrai si l'écriture a abouti
 */
async function enregistrer(voulue, base) {
  try {
    setState('envelopes', normaliserEnveloppes(await fusionnerListe(CHEMIN, voulue, base)));
    return true;
  } catch (error) {
    logError('❌ Erreur sauvegarde enveloppes :', error);
    toast.error('Erreur de sauvegarde');
    return false;
  }
}

// ===== LISTES DÉROULANTES =====

/**
 * Peuple un `<select>` d'enveloppes
 *
 * Seules les enveloppes ouvertes sont proposées, plus celle que la charge porte
 * déjà : rouvrir une charge de l'été dernier ne doit pas silencieusement effacer
 * son rattachement sous prétexte que l'enveloppe a été close depuis.
 *
 * @param {string} selectId - Identifiant du select
 * @param {string} [valeurActuelle] - Enveloppe déjà portée par la charge
 * @returns {void}
 */
export function populateEnvelopeSelect(selectId, valeurActuelle = '') {
  const select = document.getElementById(selectId);
  if (!select) return;

  const toutes = getEnveloppes();
  const proposees = enveloppesOuvertes(toutes);

  const portee = enveloppeParId(toutes, valeurActuelle);
  if (portee && !proposees.some(e => e.id === portee.id)) proposees.push(portee);

  select.innerHTML = '';

  const aucune = document.createElement('option');
  aucune.value = '';
  aucune.textContent = '-- Aucune --';
  select.appendChild(aucune);

  proposees.forEach(enveloppe => {
    const option = document.createElement('option');
    option.value = enveloppe.id;
    option.textContent = `${enveloppe.icon} ${enveloppe.label}`;
    select.appendChild(option);
  });

  // Une valeur absente de la liste laisserait le select sur « Aucune » sans
  // rien dire ; elle vient d'être ajoutée juste au-dessus, donc elle y est.
  select.value = valeurActuelle || '';
}

/** Peuple les deux selects d'enveloppe des formulaires de charge */
export function populateAllEnvelopeSelects() {
  populateEnvelopeSelect('variableChargeEnvelope');
  populateEnvelopeSelect('fixedChargeEnvelope');
}

// ===== ÉCRAN DE GESTION =====

/**
 * Charges du mois consulté, fixes et variables confondues
 *
 * Le total affiché à côté de chaque enveloppe ne porte donc que sur ce mois-ci,
 * et l'écran le dit. Une enveloppe traverse les mois : annoncer « 320 € » sans
 * préciser lesquels serait faux pour toutes celles qui durent plus longtemps.
 * Le total complet, tous mois confondus, viendra avec la vue dédiée.
 *
 * @returns {Array<Object>}
 */
function chargesDuMois() {
  return [
    ...(getState('fixedCharges') || []),
    ...(getState('variableCharges') || [])
  ];
}

/**
 * Affiche l'écran de gestion des enveloppes
 * @returns {void}
 */
function showManageEnvelopesModal() {
  const enveloppes = getEnveloppes();
  const charges = chargesDuMois();

  let modal = document.getElementById('modalManageEnvelopes');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalManageEnvelopes';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'manageEnvelopesTitle');
    document.body.appendChild(modal);
  }

  const lignes = enveloppes.length === 0
    ? '<p class="empty-state">Aucune enveloppe. Créez-en une pour regrouper des dépenses qui vont ensemble — des vacances, un déménagement.</p>'
    : enveloppes.map((enveloppe, index) => ligneEnveloppe(enveloppe, index, charges)).join('');

  modal.innerHTML = `
    <div class="modal manage-lists-modal">
      <h2 class="modal-header" id="manageEnvelopesTitle">Gérer les enveloppes</h2>
      <div class="manage-lists-content">
        <p class="manage-lists-aide">
          Une enveloppe regroupe des dépenses par-delà les catégories et les mois.
          Elle ne change ni les montants ni le solde : c'est une étiquette de lecture.
        </p>

        <div id="manageEnvelopeItems" class="manage-list-items">${lignes}</div>

        <!--
          Le bouton vient après tous les champs qu'il envoie.

          Il était placé juste après le nom, avant le budget et les deux dates :
          qui remplissait le nom et appuyait sur « Ajouter » — le geste que la
          disposition appelle — perdait les trois champs suivants sans rien voir.
        -->
        <div class="manage-list-add">
          <div class="manage-add-row">
            <button type="button" id="envelopeEmojiBtn" class="manage-emoji-btn" title="Choisir une image">🧳</button>
            <label class="sr-only" for="envelopeNewLabel">Nom de l'enveloppe</label>
            <input type="text" id="envelopeNewLabel" placeholder="Ex : Vacances été" maxlength="30" />
          </div>
          <div id="envelopeEmojiPicker" class="manage-emoji-picker" style="display:none;">
            ${emojisProposes().map(emoji => `
              <button type="button" class="emoji-pick" data-emoji="${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>
            `).join('')}
          </div>
          <div class="envelope-add-details">
            <div class="envelope-field">
              <label for="envelopeNewBudget">Budget (€, facultatif)</label>
              <input type="text" id="envelopeNewBudget" placeholder="Ex : 1200" inputmode="decimal" maxlength="10" />
            </div>
            <div class="envelope-field">
              <label for="envelopeNewDebut">Du (facultatif)</label>
              <input type="date" id="envelopeNewDebut" />
            </div>
            <div class="envelope-field">
              <label for="envelopeNewFin">Au (facultatif)</label>
              <input type="date" id="envelopeNewFin" />
            </div>
          </div>
          <button type="button" id="envelopeAddBtn" class="btn btn-primary">Ajouter l'enveloppe</button>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="envelopeManageClose">Fermer</button>
      </div>
    </div>
  `;

  brancherEcran(modal);

  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('active'));
}

/**
 * Une ligne de la liste de gestion
 *
 * @param {Object} enveloppe
 * @param {number} index
 * @param {Array<Object>} charges - Charges du mois consulté
 * @returns {string} Fragment HTML échappé
 */
function ligneEnveloppe(enveloppe, index, charges) {
  const total = totalEnveloppe(charges, enveloppe.id);
  const budget = enveloppe.budget
    ? ` / ${formatCurrency(enveloppe.budget)}`
    : '';
  const fenetre = decrireFenetre(enveloppe);

  return `
    <div class="manage-list-item envelope-item${enveloppe.cloturee ? ' envelope-close' : ''}" data-index="${index}">
      <span class="manage-item-icon">${escapeHtml(enveloppe.icon)}</span>
      <span class="manage-item-label">
        ${escapeHtml(enveloppe.label)}${enveloppe.cloturee ? ' <span class="envelope-etat">close</span>' : ''}
        <small class="envelope-detail">${formatCurrency(total)}${budget} ce mois-ci${fenetre}</small>
      </span>
      <button type="button" class="btn-icon envelope-toggle" data-index="${index}"
              aria-label="${enveloppe.cloturee ? 'Rouvrir' : 'Clore'} ${escapeHtml(enveloppe.label)}">
        ${enveloppe.cloturee ? '♻️' : '📥'}
      </button>
      <button type="button" class="btn-icon btn-delete envelope-delete" data-index="${index}"
              aria-label="Supprimer ${escapeHtml(enveloppe.label)}">✕</button>
    </div>
  `;
}

/**
 * Décrit la fenêtre de dates d'une enveloppe, si elle en porte une
 * @param {Object} enveloppe
 * @returns {string} Fragment échappé, ou chaîne vide
 */
function decrireFenetre(enveloppe) {
  if (!enveloppe.debut && !enveloppe.fin) return '';
  if (enveloppe.debut && enveloppe.fin) {
    return ` · ${escapeHtml(enveloppe.debut)} → ${escapeHtml(enveloppe.fin)}`;
  }
  return enveloppe.debut
    ? ` · à partir du ${escapeHtml(enveloppe.debut)}`
    : ` · jusqu'au ${escapeHtml(enveloppe.fin)}`;
}

/**
 * Branche les commandes de l'écran
 *
 * Le balisage est reconstruit à chaque rendu : les écouteurs posés ici meurent
 * avec lui, il n'y a donc rien à retirer. C'est la raison pour laquelle ce
 * module n'a pas besoin du garde-fou `poserUnique` de la saisie rapide, où les
 * éléments, eux, survivent aux reconstructions.
 *
 * Chaque commande relit l'état courant au moment où on l'actionne, plutôt que
 * de capturer la liste au rendu : entre l'ouverture de l'écran et le clic,
 * l'autre téléphone a pu écrire.
 *
 * @param {HTMLElement} modal
 * @returns {void}
 */
function brancherEcran(modal) {
  let emojiChoisi = '🧳';

  const boutonEmoji = modal.querySelector('#envelopeEmojiBtn');
  const planche = modal.querySelector('#envelopeEmojiPicker');
  const champLibelle = modal.querySelector('#envelopeNewLabel');

  boutonEmoji.addEventListener('click', () => {
    planche.style.display = planche.style.display === 'none' ? 'flex' : 'none';
  });

  modal.querySelectorAll('.emoji-pick').forEach(bouton => {
    bouton.addEventListener('click', () => {
      emojiChoisi = bouton.dataset.emoji;
      boutonEmoji.textContent = emojiChoisi;
      planche.style.display = 'none';
    });
  });

  const ajouter = async () => {
    const libelle = champLibelle.value.trim();
    if (!libelle) {
      toast.error('Nom requis');
      champLibelle.focus();
      return;
    }

    const existantes = getEnveloppes();
    if (existantes.some(e => e.label.toLowerCase() === libelle.toLowerCase())) {
      toast.error('Ce nom existe déjà');
      return;
    }

    const debut = dateLisible(modal.querySelector('#envelopeNewDebut').value);
    const fin = dateLisible(modal.querySelector('#envelopeNewFin').value);
    if (!fenetreCoherente(debut, fin)) {
      toast.error('La date de fin précède celle de début');
      return;
    }

    const enveloppe = {
      id: identifiantDepuisLibelle(libelle, existantes),
      label: libelle,
      icon: emojiChoisi,
      budget: budgetLisible(modal.querySelector('#envelopeNewBudget').value),
      debut,
      fin,
      cloturee: false
    };

    if (!await enregistrer([...existantes, enveloppe], existantes)) return;

    toast.success(`Enveloppe "${libelle}" créée`);
    populateAllEnvelopeSelects();
    showManageEnvelopesModal();
  };

  modal.querySelector('#envelopeAddBtn').addEventListener('click', ajouter);

  // Entrée depuis le nom avance au champ suivant, elle ne valide pas.
  //
  // Elle validait — ce qui, avec le bouton placé juste après le nom, formait le
  // même piège au clavier qu'à l'écran : le budget et les deux dates étaient
  // perdus sans un mot. Depuis le budget, en revanche, il ne reste que deux
  // champs facultatifs : Entrée y garde son sens de « c'est fini ».
  champLibelle.addEventListener('keydown', evenement => {
    if (evenement.key !== 'Enter') return;
    evenement.preventDefault();
    modal.querySelector('#envelopeNewBudget').focus();
  });

  modal.querySelector('#envelopeNewBudget').addEventListener('keydown', evenement => {
    if (evenement.key !== 'Enter') return;
    evenement.preventDefault();
    ajouter();
  });

  modal.querySelectorAll('.envelope-toggle').forEach(bouton => {
    bouton.addEventListener('click', async () => {
      const index = Number(bouton.dataset.index);
      const avant = getEnveloppes();
      const cible = avant[index];
      if (!cible) return;

      const apres = avant.map((enveloppe, rang) => (
        rang === index ? { ...enveloppe, cloturee: !enveloppe.cloturee } : enveloppe
      ));

      if (!await enregistrer(apres, avant)) return;

      toast.success(cible.cloturee ? `"${cible.label}" rouverte` : `"${cible.label}" close`);
      populateAllEnvelopeSelects();
      showManageEnvelopesModal();
    });
  });

  modal.querySelectorAll('.envelope-delete').forEach(bouton => {
    bouton.addEventListener('click', async () => {
      const index = Number(bouton.dataset.index);
      const avant = getEnveloppes();
      const cible = avant[index];
      if (!cible) return;

      // Supprimer une enveloppe laisse `envelope: 'vacances'` sur les charges
      // qui la portaient. Elles restent intactes et continuent de compter dans
      // le solde — seule leur étiquette disparaît de l'affichage. Clore vaut
      // mieux, et l'écran le propose juste à côté.
      const rattachees = chargesDuMois()
        .filter(charge => !charge.deleted && charge.envelope === cible.id).length;

      const { showConfirmModal } = await import('../components/modal.js');
      const question = rattachees > 0
        ? `Supprimer l'enveloppe "${cible.label}" ? ${rattachees} charge(s) de ce mois perdront leur étiquette. Les montants et le solde ne changent pas.`
        : `Supprimer l'enveloppe "${cible.label}" ?`;
      if (!await showConfirmModal(question)) return;

      if (!await enregistrer(avant.filter((_, rang) => rang !== index), avant)) return;

      toast.success(`"${cible.label}" supprimée`);
      populateAllEnvelopeSelects();
      showManageEnvelopesModal();
    });
  });

  modal.querySelector('#envelopeManageClose').addEventListener('click', () => {
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  });
}

// Joignable depuis le balisage, par la délégation `data-action` de init.js.
// La gestion des catégories et celle des destinations sont restées inatteignables
// des mois durant, exposées sur `window` sans qu'aucun bouton ne les appelle :
// `tests/actions-atteignables.test.js` ferme cette porte pour les trois.
window.showManageEnvelopesModal = showManageEnvelopesModal;

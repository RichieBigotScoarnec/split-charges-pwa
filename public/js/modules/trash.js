// ===== MODULE : CORBEILLE =====
//
// Les suppressions de l'application ont toujours été douces : charges et
// remboursements reçoivent `deleted: true` et restent en base. Rien n'a donc
// jamais été effacé — mais rien ne permettait de les revoir ni de les
// rétablir. Une suppression accidentelle était irréversible du point de vue de
// l'utilisateur, alors que la donnée n'avait pas bougé.
//
// La corbeille ouvre la porte qui manquait. Elle ne supprime rien
// définitivement : son seul verbe est « rétablir ».

import { getState } from '../state.js';
import { directionLabel } from '../utils/members.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { formatCurrency } from '../utils/format.js';
import { REIMBURSEMENT_DIRECTIONS } from '../config.js';
import { log, error as logError } from '../utils/debug.js';

/**
 * Les trois collections récupérables, et ce qu'il faut pour chacune : la clé
 * en base, le libellé affiché, et le chargeur à rejouer après rétablissement.
 *
 * Les imports sont écrits en clair plutôt que construits à partir d'une
 * variable : un spécificateur littéral reste analysable par les outils, et
 * l'import différé évite un cycle avec des modules qui importent celui-ci.
 */
const COLLECTIONS = [
  {
    cle: 'variableCharges',
    libelle: 'Charge variable',
    recharger: () => import('./variable-charges.js').then(m => m.loadVariableCharges())
  },
  {
    cle: 'fixedCharges',
    libelle: 'Charge fixe',
    recharger: () => import('./fixed-charges.js').then(m => m.loadFixedCharges())
  },
  {
    cle: 'reimbursements',
    libelle: 'Remboursement',
    recharger: () => import('./reimbursements.js').then(m => m.loadReimbursements())
  }
];

/**
 * Initialise la corbeille
 */
export function initTrash() {
  window.showTrash = showTrash;
  window.restoreFromTrash = restoreFromTrash;
  refreshTrashButton();
  log('🗑️ Corbeille initialisée');
}

/**
 * Rassemble les éléments supprimés de la période, toutes collections confondues
 * @returns {Array<Object>} Éléments enrichis de leur collection d'origine
 */
function collectAll() {
  return COLLECTIONS.flatMap(({ cle, libelle }) =>
    (getState(`deleted.${cle}`) || []).map(item => ({ ...item, collection: cle, libelle }))
  );
}

/**
 * Affiche ou masque le bouton d'accès, avec le nombre d'éléments
 *
 * Un bouton toujours visible pour une corbeille presque toujours vide serait
 * du bruit permanent dans une interface qui tient sur un écran.
 */
export function refreshTrashButton() {
  const bouton = document.getElementById('trashButton');
  if (!bouton) return;

  // Le bouton restait masqué tant que rien n'avait été supprimé. L'intention
  // était d'éviter du bruit ; l'effet était qu'on le cherchait sans le
  // trouver, sans savoir s'il avait disparu ou n'avait jamais existé. Il est
  // désormais toujours là : son compteur dit s'il y a quelque chose dedans, et
  // la fenêtre annonce clairement une corbeille vide.
  bouton.hidden = false;

  const total = collectAll().length;
  bouton.classList.toggle('is-empty', total === 0);

  const compteur = document.getElementById('trashCount');
  if (compteur) compteur.textContent = String(total);
}

/**
 * Ouvre la corbeille de la période courante
 */
export function showTrash() {
  renderTrash();
  showModal('modalTrash');
}

/**
 * Décrit un élément supprimé en une ligne lisible
 * @param {Object} item - Élément supprimé
 * @returns {string} Description en texte brut
 */
function describe(item) {
  if (item.collection === 'reimbursements') {
    const sens = directionLabel(
      item.direction, getState('members'), REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER);
    return item.note ? `${sens} — ${item.note}` : sens;
  }
  return item.description || 'Sans description';
}

/**
 * Crée un élément avec sa classe et son texte
 * @param {string} tag - Nom de balise
 * @param {string} className - Classe CSS
 * @param {string} [text] - Contenu textuel
 * @returns {HTMLElement} L'élément créé
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Peint le contenu de la corbeille
 *
 * Construit en nœuds plutôt qu'en chaîne HTML : les descriptions viennent de
 * la saisie utilisateur, et `textContent` supprime la question de
 * l'échappement au lieu de la déléguer à un appel qu'on peut oublier.
 */
function renderTrash() {
  const liste = document.getElementById('trashList');
  if (!liste) return;

  liste.replaceChildren();
  const items = collectAll();

  if (items.length === 0) {
    const vide = el('div', 'empty-state');
    vide.appendChild(el('p', '', 'La corbeille est vide pour ce mois.'));
    liste.appendChild(vide);
    return;
  }

  items.forEach(item => {
    const description = describe(item);

    const info = el('div', 'trash-item-info');
    info.appendChild(el('div', 'trash-item-desc', description));
    info.appendChild(el('div', 'trash-item-meta',
      `${item.libelle} · ${formatCurrency(item.amount || 0)}`));

    const bouton = el('button', 'btn btn-secondary btn-restore', 'Rétablir');
    bouton.type = 'button';
    bouton.dataset.action = 'restoreFromTrash';
    bouton.dataset.arg = `${item.collection}:${item.id}`;
    bouton.setAttribute('aria-label', `Rétablir ${description}`);

    const ligne = el('div', 'trash-item');
    ligne.append(info, bouton);
    liste.appendChild(ligne);
  });
}

/**
 * Rétablit un élément supprimé
 *
 * @param {string} reference - `collection:identifiant`, tel que porté par data-arg
 * @returns {Promise<void>}
 */
export async function restoreFromTrash(reference) {
  const separateur = String(reference || '').indexOf(':');
  if (separateur === -1) return;

  const collection = reference.slice(0, separateur);
  const id = reference.slice(separateur + 1);

  const cible = COLLECTIONS.find(c => c.cle === collection);
  if (!cible || !id) {
    toast.error('Élément introuvable');
    return;
  }

  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  try {
    const { dbUpdate } = await import('../db.js');
    await dbUpdate(`periods/${currentPeriod}/${collection}/${id}`, { deleted: false });

    // Rejouer le seul chargeur concerné : il remet à jour aussi bien la liste
    // active que la collection des supprimés.
    await cible.recharger();

    const { calculateSummary } = await import('./summary.js');
    calculateSummary();

    refreshTrashButton();
    renderTrash();

    if (collectAll().length === 0) closeModal('modalTrash', false);

    toast.success('Élément rétabli');
  } catch (error) {
    logError('❌ Erreur rétablissement :', error);
    toast.error('Rétablissement impossible');
  }
}

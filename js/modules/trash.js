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
import { collectDeleted } from '../utils/soft-delete.js';
import { directionLabel } from '../utils/members.js';
import { toast } from '../components/toast.js';
import { showModal } from '../components/modal.js';
import { formatCurrency } from '../utils/format.js';
import { formatPeriod } from '../utils/date.js';
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

/** Format d'une clé de période : AAAA-MM */
const PERIOD_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Rassemble les éléments supprimés de tous les mois
 *
 * La corbeille ne montrait que le mois affiché. Supprimer en juillet puis
 * consulter août la donnait pour vide : il fallait se souvenir du mois pour
 * retrouver ce qu'on cherchait — exactement ce qu'on ne sait plus quand on
 * cherche. Elle couvre désormais tout l'historique.
 *
 * La lecture n'a lieu qu'à l'ouverture de la fenêtre, pas à chaque chargement
 * de mois.
 *
 * @returns {Promise<Array<Object>>} Éléments, mois le plus récent d'abord
 */
async function collectAll() {
  const { dbGet } = await import('../db.js');
  const periods = await dbGet('periods');
  if (!periods || typeof periods !== 'object') return [];

  const mois = Object.keys(periods).filter(k => PERIOD_KEY.test(k)).sort().reverse();
  const trouves = [];

  for (const periode of mois) {
    for (const { cle, libelle } of COLLECTIONS) {
      for (const item of collectDeleted(periods[periode][cle])) {
        trouves.push({ ...item, collection: cle, libelle, periode });
      }
    }
  }

  return trouves;
}

/**
 * Le bouton d'accès reste toujours présent
 *
 * Masqué tant que rien n'avait été supprimé, on le cherchait sans savoir s'il
 * avait disparu ou n'avait jamais existé. Il ne porte plus de compteur : la
 * corbeille couvrant tout l'historique, un nombre qui ne ferait que croître
 * n'apprendrait rien, et le calculer imposerait une lecture à chaque mois
 * affiché.
 */
export function refreshTrashButton() {
  const bouton = document.getElementById('trashButton');
  if (bouton) bouton.hidden = false;
}

/**
 * Ouvre la corbeille
 *
 * La fenêtre s'ouvre avant la lecture : attendre la base sans rien afficher
 * donnerait l'impression que le bouton ne répond pas.
 *
 * @returns {Promise<void>}
 */
export async function showTrash() {
  const liste = document.getElementById('trashList');
  if (liste) {
    liste.replaceChildren();
    liste.appendChild(el('div', 'empty-state', "Lecture de l'historique…"));
  }
  showModal('modalTrash');
  await renderTrash();
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
async function renderTrash() {
  const liste = document.getElementById('trashList');
  if (!liste) return;

  let items;
  try {
    items = await collectAll();
  } catch (error) {
    logError('❌ Lecture de la corbeille impossible :', error);
    liste.replaceChildren(el('div', 'empty-state', 'Historique illisible pour le moment.'));
    return;
  }

  liste.replaceChildren();

  if (items.length === 0) {
    liste.appendChild(el('div', 'empty-state', 'La corbeille est vide.'));
    return;
  }

  // Groupées par mois : sans cette indication, deux dépenses homonymes de
  // deux mois différents seraient indiscernables.
  let moisAffiche = null;

  items.forEach(item => {
    if (item.periode !== moisAffiche) {
      moisAffiche = item.periode;
      liste.appendChild(el('div', 'trash-month', formatPeriod(item.periode)));
    }

    const description = describe(item);

    const info = el('div', 'trash-item-info');
    info.appendChild(el('div', 'trash-item-desc', description));
    info.appendChild(el('div', 'trash-item-meta',
      `${item.libelle} · ${formatCurrency(item.amount || 0)}`));

    const bouton = el('button', 'btn btn-secondary btn-restore', 'Rétablir');
    bouton.type = 'button';
    bouton.dataset.action = 'restoreFromTrash';
    bouton.dataset.arg = `${item.periode}:${item.collection}:${item.id}`;
    bouton.setAttribute('aria-label', `Rétablir ${description}`);

    const ligne = el('div', 'trash-item');
    ligne.append(info, bouton);
    liste.appendChild(ligne);
  });
}

/**
 * Rétablit un élément supprimé
 *
 * @param {string} reference - `période:collection:identifiant`, tel que porté par data-arg
 * @returns {Promise<void>}
 */
export async function restoreFromTrash(reference) {
  const parts = String(reference || '').split(':');
  if (parts.length < 3) return;

  const [periode, collection] = parts;
  // L'identifiant Firebase peut contenir des deux-points : on ne coupe que
  // sur les deux premiers séparateurs.
  const id = parts.slice(2).join(':');

  const cible = COLLECTIONS.find(c => c.cle === collection);
  if (!cible || !id || !periode) {
    toast.error('Élément introuvable');
    return;
  }

  try {
    const { dbUpdate } = await import('../db.js');
    await dbUpdate(`periods/${periode}/${collection}/${id}`, { deleted: false });

    // L'élément peut appartenir à un autre mois que celui affiché : ne rejouer
    // les chargeurs que si le mois courant est concerné.
    if (periode === getState('currentPeriod')) {
      await cible.recharger();
      const { calculateSummary } = await import('./summary.js');
      calculateSummary();
      toast.success('Élément rétabli');
    } else {
      toast.success(`Élément rétabli dans ${formatPeriod(periode)}`);
    }

    await renderTrash();
  } catch (error) {
    logError('❌ Erreur rétablissement :', error);
    toast.error('Rétablissement impossible');
  }
}

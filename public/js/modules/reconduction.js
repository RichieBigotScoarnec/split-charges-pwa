// ===== MODULE : RECONDUCTION AUTOMATIQUE =====
// Fonctionnalités : reconduction charges fixes, salaires, détection nouveau mois

import { getFirebaseDatabase } from '../firebase-init.js';
import { getState, setState } from '../state.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { loadFixedCharges } from './fixed-charges.js';
import { calculateSummary } from './summary.js';
import { getDataPath } from '../db.js';
import { log, error as logError } from '../utils/debug.js';

let database = null;

/**
 * Initialise le module de reconduction
 */
export function initReconduction() {
  log('📦 Initialisation module reconduction');

  database = getFirebaseDatabase();
  setupReconduction();

  log('✅ Module reconduction initialisé');
}

/**
 * Configure la reconduction automatique
 */
function setupReconduction() {
  // Vérifier si proposition de reconduction nécessaire
  checkReconductionNeeded();

  // Listener bouton reconduction manuelle
  const reconductBtn = document.getElementById('reconductPeriodBtn');
  if (reconductBtn) {
    reconductBtn.addEventListener('click', () => {
      proposeReconduction();
    });
  }
}

/**
 * Vérifie si une reconduction est nécessaire
 */
export function checkReconductionNeeded() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) return;

  // Vérifier si on est au début d'un nouveau mois
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Si la période actuelle est le mois dernier et qu'on est les 3 premiers jours du mois
  const dayOfMonth = now.getDate();
  if (currentPeriod !== currentYearMonth && dayOfMonth <= 3) {
    // Proposer automatiquement la reconduction
    setTimeout(() => {
      proposeReconduction(currentYearMonth);
    }, 2000); // Attendre 2s après le chargement
  }
}

/**
 * Propose la reconduction à l'utilisateur
 * @param {string} targetPeriod - Période cible (optionnel, sinon mois suivant)
 */
export async function proposeReconduction(targetPeriod = null) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  // Déterminer la période cible
  if (!targetPeriod) {
    const [year, month] = currentPeriod.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    targetPeriod = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
  }

  // Vérifier si la période cible existe déjà
  try {
    const snapshot = await database.ref(getDataPath(`periods/${targetPeriod}`)).once('value');

    if (snapshot.exists()) {
      toast.warning(`La période ${targetPeriod} existe déjà`);
      return;
    }

    // Afficher modal de confirmation
    showReconductionModal(currentPeriod, targetPeriod);

  } catch (error) {
    logError('❌ Erreur vérification période :', error);
    toast.error('Erreur lors de la vérification');
  }
}

/**
 * Affiche le modal de confirmation de reconduction
 * @param {string} sourcePeriod - Période source
 * @param {string} targetPeriod - Période cible
 */
function showReconductionModal(sourcePeriod, targetPeriod) {
  // Créer modal dynamiquement si nécessaire
  let modal = document.getElementById('reconductionModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'reconductionModal';
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'reconductionModalTitle');
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="reconductionModalTitle">🔄 Reconduction de période</h2>
          <button class="close-btn" data-action="closeModal" data-arg="reconductionModal">&times;</button>
        </div>
        <div class="modal-body">
          <p>Voulez-vous reconduire les données de <strong id="sourcePeriodLabel"></strong> vers <strong id="targetPeriodLabel"></strong> ?</p>
          <div class="reconduction-options">
            <label>
              <input type="checkbox" id="reconductFixedCharges" checked>
              Reconduire les charges fixes
            </label>
            <label>
              <input type="checkbox" id="reconductSalaries" checked>
              Reconduire les salaires
            </label>
          </div>
          <p class="info-text">Seules les charges fixes <strong>récurrentes</strong> seront reconduites. Les charges ponctuelles, variables et remboursements ne seront pas reconduits.</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-action="closeModal" data-arg="reconductionModal">Annuler</button>
          <button class="btn-primary" id="confirmReconduction">Reconduire</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Mettre à jour les labels
  document.getElementById('sourcePeriodLabel').textContent = sourcePeriod;
  document.getElementById('targetPeriodLabel').textContent = targetPeriod;

  // Listener bouton confirmation
  const confirmBtn = document.getElementById('confirmReconduction');
  confirmBtn.onclick = async () => {
    const reconductFixed = document.getElementById('reconductFixedCharges').checked;
    const reconductSalaries = document.getElementById('reconductSalaries').checked;

    await executeReconduction(sourcePeriod, targetPeriod, {
      fixedCharges: reconductFixed,
      salaries: reconductSalaries
    });

    closeModal('reconductionModal');
  };

  showModal('reconductionModal');
}

/**
 * Exécute la reconduction
 * @param {string} sourcePeriod - Période source
 * @param {string} targetPeriod - Période cible
 * @param {Object} options - Options de reconduction
 */
export async function executeReconduction(sourcePeriod, targetPeriod, options = {}) {
  const { fixedCharges = true, salaries = true } = options;

  try {
    toast.info('Reconduction en cours...');

    const updates = {};

    // Copier les charges fixes
    if (fixedCharges) {
      const fixedSnapshot = await database.ref(getDataPath(`periods/${sourcePeriod}/fixedCharges`)).once('value');
      if (fixedSnapshot.exists()) {
        const charges = fixedSnapshot.val();

        // Filtrer les charges non supprimées ET récurrentes
        const activeCharges = Object.entries(charges)
          .filter(([_, charge]) => !charge.deleted && charge.recurring !== false)
          .reduce((acc, [_, charge]) => {
            // Créer nouvelle clé pour la charge
            const newKey = database.ref().push().key;
            acc[getDataPath(`periods/${targetPeriod}/fixedCharges/${newKey}`)] = {
              ...charge,
              timestamp: Date.now()
            };
            return acc;
          }, {});

        Object.assign(updates, activeCharges);
      }
    }

    // Copier les salaires
    if (salaries) {
      const salariesSnapshot = await database.ref(getDataPath(`periods/${sourcePeriod}/salaries`)).once('value');
      if (salariesSnapshot.exists()) {
        updates[getDataPath(`periods/${targetPeriod}/salaries`)] = salariesSnapshot.val();
      }
    }

    // Copier le mode de partage
    const shareModeSnapshot = await database.ref(getDataPath(`periods/${sourcePeriod}/shareMode`)).once('value');
    if (shareModeSnapshot.exists()) {
      updates[getDataPath(`periods/${targetPeriod}/shareMode`)] = shareModeSnapshot.val();
    }

    // Appliquer les mises à jour
    if (Object.keys(updates).length > 0) {
      await database.ref().update(updates);

      toast.success(`Reconduction vers ${targetPeriod} réussie`);

      // Changer de période si c'est le mois actuel
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (targetPeriod === currentYearMonth) {
        setState('currentPeriod', targetPeriod);
        await loadFixedCharges();
        calculateSummary();
      }

    } else {
      toast.warning('Aucune donnée à reconduire');
    }

  } catch (error) {
    logError('❌ Erreur reconduction :', error);
    toast.error('Erreur lors de la reconduction');
  }
}

/**
 * Obtient la période suivante
 * @param {string} period - Période actuelle (YYYY-MM)
 * @returns {string} Période suivante
 */
export function getNextPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

/**
 * Obtient la période précédente
 * @param {string} period - Période actuelle (YYYY-MM)
 * @returns {string} Période précédente
 */
export function getPreviousPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

// Exposer globalement pour compatibilité
window.proposeReconduction = proposeReconduction;
window.executeReconduction = executeReconduction;
window.getNextPeriod = getNextPeriod;
window.getPreviousPeriod = getPreviousPeriod;

// ===== MODULE : AJOUT RAPIDE =====
// Fonctionnalités : ajout rapide de charge variable avec raccourci clavier

import { getFirebaseDatabase } from '../firebase-init.js';
import { getState } from '../state.js';
import { toast } from '../components/toast.js';
import { loadVariableCharges } from './variable-charges.js';
import { calculateSummary } from './summary.js';

let database = null;

/**
 * Initialise le module d'ajout rapide
 */
export function initQuickAdd() {
  console.log('📦 Initialisation module ajout rapide');

  database = getFirebaseDatabase();
  setupQuickAddUI();

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.showQuickAddModal = showQuickAddForm;
  window.hideQuickAddModal = hideQuickAddForm;

  console.log('✅ Module ajout rapide initialisé');
}

/**
 * Configure l'interface utilisateur pour l'ajout rapide
 */
function setupQuickAddUI() {
  // Bouton ajout rapide
  const quickAddBtn = document.getElementById('quickAddBtn');
  if (quickAddBtn) {
    quickAddBtn.addEventListener('click', () => {
      showQuickAddForm();
    });
  }

  // Raccourci clavier : Ctrl+Q ou Cmd+Q
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
      e.preventDefault();
      showQuickAddForm();
    }
  });

  // Listener pour le formulaire d'ajout rapide
  const quickAddForm = document.getElementById('quickAddForm');
  if (quickAddForm) {
    quickAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleQuickAddSubmit();
    });
  }

  // Listener pour annuler
  const quickAddCancel = document.getElementById('quickAddCancel');
  if (quickAddCancel) {
    quickAddCancel.addEventListener('click', () => {
      hideQuickAddForm();
    });
  }

  // Listener pour fermer avec Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const quickAddContainer = document.getElementById('quickAddContainer');
      if (quickAddContainer && quickAddContainer.style.display !== 'none') {
        hideQuickAddForm();
      }
    }
  });
}

/**
 * Affiche le formulaire d'ajout rapide
 */
function showQuickAddForm() {
  const container = document.getElementById('quickAddContainer');
  if (!container) {
    // Créer le container si inexistant
    createQuickAddContainer();
  }

  const quickAddContainer = document.getElementById('quickAddContainer');
  quickAddContainer.style.display = 'block';

  // Focus sur le champ montant
  const amountInput = document.getElementById('quickAddAmount');
  if (amountInput) {
    setTimeout(() => amountInput.focus(), 100);
  }
}

/**
 * Masque le formulaire d'ajout rapide
 */
function hideQuickAddForm() {
  const container = document.getElementById('quickAddContainer');
  if (container) {
    container.style.display = 'none';
    // Réinitialiser le formulaire
    const form = document.getElementById('quickAddForm');
    if (form) form.reset();
  }
}

/**
 * Crée le container du formulaire d'ajout rapide dans le DOM
 */
function createQuickAddContainer() {
  const container = document.createElement('div');
  container.id = 'quickAddContainer';
  container.className = 'quick-add-container';
  container.style.display = 'none';

  container.innerHTML = `
    <div class="quick-add-overlay" onclick="hideQuickAddForm()"></div>
    <div class="quick-add-panel">
      <div class="quick-add-header">
        <h3>⚡ Ajout Rapide</h3>
        <p class="quick-add-hint">Raccourci : Ctrl+Q</p>
      </div>
      <form id="quickAddForm" class="quick-add-form">
        <div class="form-row">
          <label for="quickAddAmount">Montant *</label>
          <input
            type="number"
            id="quickAddAmount"
            step="0.01"
            min="0"
            placeholder="Ex: 45.50"
            required
          />
        </div>

        <div class="form-row">
          <label for="quickAddDescription">Description *</label>
          <input
            type="text"
            id="quickAddDescription"
            placeholder="Ex: Courses Carrefour"
            required
          />
        </div>

        <div class="form-row">
          <label for="quickAddCategory">Catégorie</label>
          <select id="quickAddCategory">
            <option value="Alimentation">🍽️ Alimentation</option>
            <option value="Transport">🚗 Transport</option>
            <option value="Loisirs">🎮 Loisirs</option>
            <option value="Santé">❤️ Santé</option>
            <option value="Autre">📦 Autre</option>
          </select>
        </div>

        <div class="form-row">
          <label for="quickAddPaidBy">Payé par</label>
          <select id="quickAddPaidBy">
            <option value="vous">Vous</option>
            <option value="conjointe">Conjointe</option>
          </select>
        </div>

        <div class="form-row form-row-date">
          <label for="quickAddDate">Date</label>
          <input
            type="date"
            id="quickAddDate"
            value="${new Date().toISOString().split('T')[0]}"
          />
        </div>

        <div class="quick-add-actions">
          <button type="button" id="quickAddCancel" class="btn-secondary">
            Annuler
          </button>
          <button type="submit" class="btn-primary">
            ✅ Ajouter
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(container);

  // Exposer hideQuickAddForm globalement pour onclick
  window.hideQuickAddForm = hideQuickAddForm;
}

/**
 * Gère la soumission du formulaire d'ajout rapide
 */
async function handleQuickAddSubmit() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  // Récupérer les valeurs du formulaire
  const amount = parseFloat(document.getElementById('quickAddAmount').value);
  const description = document.getElementById('quickAddDescription').value.trim();
  const category = document.getElementById('quickAddCategory').value;
  const paidBy = document.getElementById('quickAddPaidBy').value;
  const date = document.getElementById('quickAddDate').value;

  // Validation
  if (!amount || amount <= 0) {
    toast.error('Montant invalide');
    return;
  }

  if (!description) {
    toast.error('Description requise');
    return;
  }

  // Créer l'objet charge variable
  const chargeData = {
    description: description,
    amount: amount,
    category: category,
    paidBy: paidBy,
    date: date,
    timestamp: Date.now(),
    deleted: false
  };

  try {
    // Sauvegarder dans Firebase
    const newRef = database.ref(`periods/${currentPeriod}/variableCharges`).push();
    await newRef.set(chargeData);

    toast.success(`✅ ${description} ajouté (${amount.toFixed(2)} €)`);

    // Mettre à jour le state local
    await loadVariableCharges();

    // Recalculer le bilan
    calculateSummary();

    // Masquer le formulaire
    hideQuickAddForm();
  } catch (error) {
    console.error('❌ Erreur ajout rapide :', error);
    toast.error('Erreur lors de l\'ajout');
  }
}

/**
 * Ajoute une charge rapide par programmation
 * @param {Object} chargeData - Données de la charge
 * @returns {Promise<void>}
 */
export async function addQuickCharge(chargeData) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    throw new Error('Aucune période sélectionnée');
  }

  // Valeurs par défaut
  const charge = {
    description: chargeData.description,
    amount: parseFloat(chargeData.amount),
    category: chargeData.category || 'Autre',
    paidBy: chargeData.paidBy || 'vous',
    date: chargeData.date || new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    deleted: false
  };

  // Validation
  if (!charge.description || !charge.amount || charge.amount <= 0) {
    throw new Error('Données invalides');
  }

  try {
    const newRef = database.ref(`periods/${currentPeriod}/variableCharges`).push();
    await newRef.set(charge);

    await loadVariableCharges();
    calculateSummary();

    return charge;
  } catch (error) {
    console.error('❌ Erreur addQuickCharge :', error);
    throw error;
  }
}

/**
 * Ajoute plusieurs charges rapidement (batch)
 * @param {Array<Object>} charges - Liste de charges à ajouter
 * @returns {Promise<void>}
 */
export async function addQuickChargesBatch(charges) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    throw new Error('Aucune période sélectionnée');
  }

  if (!Array.isArray(charges) || charges.length === 0) {
    throw new Error('Liste de charges invalide');
  }

  try {
    const updates = {};

    charges.forEach(chargeData => {
      const newKey = database.ref().push().key;
      const charge = {
        description: chargeData.description,
        amount: parseFloat(chargeData.amount),
        category: chargeData.category || 'Autre',
        paidBy: chargeData.paidBy || 'vous',
        date: chargeData.date || new Date().toISOString().split('T')[0],
        timestamp: Date.now(),
        deleted: false
      };

      updates[`periods/${currentPeriod}/variableCharges/${newKey}`] = charge;
    });

    await database.ref().update(updates);

    toast.success(`${charges.length} charge(s) ajoutée(s)`);

    await loadVariableCharges();
    calculateSummary();
  } catch (error) {
    console.error('❌ Erreur addQuickChargesBatch :', error);
    throw error;
  }
}

/**
 * Détecte et suggère la catégorie selon la description
 * @param {string} description - Description de la charge
 * @returns {string} Catégorie suggérée
 */
export function suggestCategory(description) {
  const lowerDesc = description.toLowerCase();

  // Patterns de détection par catégorie
  const patterns = {
    'Alimentation': ['courses', 'carrefour', 'auchan', 'lidl', 'restaurant', 'mcdo', 'pizza', 'boulangerie', 'marché'],
    'Transport': ['essence', 'autoroute', 'péage', 'parking', 'bus', 'métro', 'train', 'uber', 'taxi'],
    'Loisirs': ['cinéma', 'concert', 'théâtre', 'jeu', 'netflix', 'spotify', 'sport', 'gym'],
    'Santé': ['pharmacie', 'médecin', 'dentiste', 'ophtalmo', 'kiné', 'hôpital', 'clinique']
  };

  for (const [category, keywords] of Object.entries(patterns)) {
    if (keywords.some(keyword => lowerDesc.includes(keyword))) {
      return category;
    }
  }

  return 'Autre';
}

// Exposer les fonctions globalement pour compatibilité
window.showQuickAddForm = showQuickAddForm;
window.hideQuickAddForm = hideQuickAddForm;
window.addQuickCharge = addQuickCharge;
window.suggestCategory = suggestCategory;

// ===== MODULE : AJOUT RAPIDE =====
// Fonctionnalités : ajout rapide de charge variable avec raccourci clavier

import { getState } from '../state.js';
import { toast } from '../components/toast.js';
import { loadVariableCharges } from './variable-charges.js';
import { calculateSummary } from './summary.js';
import { getUserPath } from '../db.js';
import { getCategories, populateCategorySelect } from './custom-lists.js';

let _keydownHandler = null;

/**
 * Initialise le module d'ajout rapide
 */
export function initQuickAdd() {
  console.log('📦 Initialisation module ajout rapide');

  setupQuickAddUI();

  // Note: showQuickAddModal et hideQuickAddModal sont gérés par le HTML legacy
  // Ne pas exposer ici pour éviter conflits

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

  // Raccourci clavier unique : Ctrl+Q (ouvrir) + Escape (fermer)
  if (_keydownHandler) {
    document.removeEventListener('keydown', _keydownHandler);
  }
  _keydownHandler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
      e.preventDefault();
      showQuickAddForm();
    }
    if (e.key === 'Escape') {
      const quickAddContainer = document.getElementById('quickAddContainer');
      if (quickAddContainer && quickAddContainer.style.display !== 'none') {
        hideQuickAddForm();
      }
    }
  };
  document.addEventListener('keydown', _keydownHandler);

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
}

/**
 * Affiche le formulaire d'ajout rapide
 */
function showQuickAddForm() {
  const container = document.getElementById('quickAddContainer');
  if (!container) {
    // Créer le container si inexistant
    createQuickAddContainer();
    // Peupler le select catégorie dynamiquement
    populateCategorySelect('quickAddCategory', { addManageOption: false });
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
 * Nettoie les listeners du module quick-add (appelé au logout)
 */
export function cleanupQuickAdd() {
  if (_keydownHandler) {
    document.removeEventListener('keydown', _keydownHandler);
    _keydownHandler = null;
  }
  console.log('🧹 Listeners quick-add nettoyés');
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
            <option value="">-- Sélectionner --</option>
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

  const amountEl = document.getElementById('quickAddAmount');
  if (!amountEl) {
    toast.error('Erreur: formulaire non trouvé');
    return;
  }

  const amount = parseFloat(amountEl.value);

  // Récupérer la catégorie depuis le state JavaScript (modale HTML wrapper)
  const categoryFromState = window.quickAddState?.selectedCategory;

  if (!categoryFromState) {
    toast.error('Veuillez sélectionner une catégorie');
    return;
  }

  const description = categoryFromState.label;
  const category = categoryFromState.label;
  const paidBy = 'vous';
  const date = new Date().toISOString().split('T')[0];

  if (!amount || amount <= 0) {
    toast.error('Montant invalide');
    return;
  }

  // Récupérer la géolocalisation si disponible (state modulaire OU window fallback)
  let gpsLocation = getState('quickAddState.gpsLocation');
  if (!gpsLocation && window.quickAddState?.gpsLocation) {
    gpsLocation = window.quickAddState.gpsLocation;
  }

  const chargeData = {
    description: description,
    amount: amount,
    category: category,
    paidBy: paidBy,
    date: date,
    timestamp: Date.now(),
    deleted: false
  };

  // Ajouter GPS location si disponible
  if (gpsLocation) {
    chargeData.location = {
      lat: gpsLocation.lat,
      lng: gpsLocation.lng,
      name: gpsLocation.name || 'Localisation',
      timestamp: Date.now()
    };
  }

  try {
    const { dbPush } = await import('../db.js');

    await dbPush(`periods/${currentPeriod}/variableCharges`, chargeData);

    toast.success(`✅ ${description} ajouté (${amount.toFixed(2)} €)`);

    // Mettre à jour le state local
    await loadVariableCharges();

    // Recalculer le bilan
    calculateSummary();

    // Fermer la modale (compatibilité HTML wrapper)
    if (typeof closeModal === 'function') {
      closeModal('modalQuickAdd');
    } else {
      hideQuickAddForm();
    }
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
    // Use dbPush from db.js which handles UID-scoped paths
    const { dbPush } = await import('../db.js');
    await dbPush(`periods/${currentPeriod}/variableCharges`, charge);

    await loadVariableCharges();
    calculateSummary();

    toast.success('Charge ajoutée');
    return charge;
  } catch (error) {
    console.error('❌ Erreur addQuickCharge :', error);
    toast.error('Erreur lors de l\'ajout de la charge');
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
    // Use dbPush from db.js which handles UID-scoped paths
    const { dbPush } = await import('../db.js');

    for (const chargeData of charges) {
      const charge = {
        description: chargeData.description,
        amount: parseFloat(chargeData.amount),
        category: chargeData.category || 'Autre',
        paidBy: chargeData.paidBy || 'vous',
        date: chargeData.date || new Date().toISOString().split('T')[0],
        timestamp: Date.now(),
        deleted: false
      };

      await dbPush(`periods/${currentPeriod}/variableCharges`, charge);
    }

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
window.handleQuickAddSubmit = handleQuickAddSubmit; // ✅ Exposer la fonction qui lit DOM + state
window.suggestCategory = suggestCategory;

// ===== MODULE : AJOUT RAPIDE (SAISIE EXPRESS) =====
// Modale quick-add avec grille catégories, GPS, géocodage inversé
// Toute la logique est centralisée ici (plus de JS inline dans FairSplit.html)

import { getState, setState } from '../state.js';
import { validateChargeAmount } from '../utils/validation.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { loadVariableCharges } from './variable-charges.js';
import { calculateSummary } from './summary.js';
import { getCategories } from './custom-lists.js';
import { escapeHtml } from '../utils/format.js';
import { log, warn, error as logError } from '../utils/debug.js';

// ===== STATE INTERNE =====
let _keydownHandler = null;
let _gpsWatchId = null;       // watchPosition ID for background GPS
let _gpsPermissionGranted = false; // tracks if user already granted GPS permission

const quickAddState = {
  selectedCategory: null,  // { id, icon, label, color }
  splitMode: 'prorata',    // 'prorata' | '50-50'
  gpsLocation: null        // { lat, lng, accuracy, timestamp, name? }
};

// ===== INITIALISATION =====

/**
 * Initialise le module d'ajout rapide
 */
export function initQuickAdd() {
  log('📦 Initialisation module ajout rapide');
  setupEventListeners();
  initBackgroundGPS();
  log('✅ Module ajout rapide initialisé');
}

/**
 * Vérifie si la permission GPS est déjà accordée et lance le watch en arrière-plan.
 * Utilise l'API Permissions pour éviter de déclencher le prompt au chargement.
 */
async function initBackgroundGPS() {
  if (!navigator.geolocation || !navigator.permissions) return;

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    if (status.state === 'granted') {
      _gpsPermissionGranted = true;
      startBackgroundGPS();
      log('📡 [GPS] Permission déjà accordée → watch démarré au chargement');
    }

    // Écouter les changements de permission (accordée/révoquée en cours de session)
    status.addEventListener('change', () => {
      if (status.state === 'granted' && !_gpsPermissionGranted) {
        _gpsPermissionGranted = true;
        startBackgroundGPS();
      } else if (status.state === 'denied') {
        _gpsPermissionGranted = false;
        stopBackgroundGPS();
      }
    });
  } catch {
    // API Permissions non supportée — fallback : le watch démarre au premier clic
    log('📡 [GPS] API Permissions non supportée, watch au premier usage');
  }
}

/**
 * Configure les event listeners
 */
function setupEventListeners() {
  // Raccourci clavier Ctrl+Q
  if (_keydownHandler) {
    document.removeEventListener('keydown', _keydownHandler);
  }
  _keydownHandler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
      e.preventDefault();
      showQuickAddModal();
    }
  };
  document.addEventListener('keydown', _keydownHandler);

  // Input montant : validation en temps réel + Enter pour soumettre
  const amountInput = document.getElementById('quickAddAmount');
  if (amountInput) {
    amountInput.addEventListener('input', validateForm);
    amountInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const btn = document.getElementById('btnQuickAdd');
        if (btn && !btn.disabled) {
          handleQuickAddSubmit();
        }
      }
    });
  }

  // Split mode toggle
  const prorataBtn = document.getElementById('quickSplitProrata');
  const fiftyBtn = document.getElementById('quickSplit5050');
  if (prorataBtn) prorataBtn.addEventListener('click', () => updateSplitMode('prorata'));
  if (fiftyBtn) fiftyBtn.addEventListener('click', () => updateSplitMode('50-50'));

  // Fermeture modale quick-add via overlay click (reset state interne)
  const overlay = document.getElementById('modalQuickAdd');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        e.stopImmediatePropagation(); // Empêcher le handler générique
        closeQuickAddModal();
      }
    });
  }
}

/**
 * Nettoie les listeners (appelé au logout)
 */
export function cleanupQuickAdd() {
  if (_keydownHandler) {
    document.removeEventListener('keydown', _keydownHandler);
    _keydownHandler = null;
  }
  stopBackgroundGPS();
  resetState();
  log('🧹 Listeners quick-add nettoyés');
}

// ===== MODALE : OUVERTURE / FERMETURE =====

/**
 * Ouvre la modale quick-add
 */
function showQuickAddModal() {
  // Reset state
  resetState();

  // Reset UI
  const amountInput = document.getElementById('quickAddAmount');
  if (amountInput) amountInput.value = '';

  const btn = document.getElementById('btnQuickAdd');
  if (btn) btn.disabled = true;

  updateSplitMode('prorata');

  // Peupler la grille catégories avec les catégories dynamiques
  populateCategoryGrid();

  // Reset GPS display
  const locationEl = document.getElementById('quickAddLocation');
  if (locationEl) {
    locationEl.textContent = '';
    locationEl.className = 'quick-add-location';
  }

  // Ouvrir la modale
  showModal('modalQuickAdd');

  // Focus montant + scroll pour mobile
  setTimeout(() => {
    if (amountInput) amountInput.focus();
  }, 100);
  setTimeout(() => {
    const modal = document.getElementById('modalQuickAdd');
    if (modal) {
      const inner = modal.querySelector('.modal');
      if (inner) inner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 400);

  // Lancer détection GPS en arrière-plan
  startGPSDetection();
}

/**
 * Ferme et reset la modale quick-add
 */
function closeQuickAddModal() {
  closeModal('modalQuickAdd');
  resetState();

  // Reset UI spécifique
  const locationEl = document.getElementById('quickAddLocation');
  if (locationEl) {
    locationEl.textContent = '';
    locationEl.className = 'quick-add-location';
  }
  document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('selected'));
  updateSplitMode('prorata');
}

/**
 * Reset le state interne
 */
function resetState() {
  quickAddState.selectedCategory = null;
  quickAddState.splitMode = 'prorata';
  quickAddState.gpsLocation = null;
}

// ===== GRILLE CATÉGORIES =====

/**
 * Peuple la grille de catégories depuis custom-lists (dynamique)
 */
function populateCategoryGrid() {
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;

  const categories = getCategories();

  grid.innerHTML = categories.map(cat => `
    <button type="button" class="category-btn" data-category-id="${escapeHtml(cat.id)}">
      <div class="category-icon">${escapeHtml(cat.icon)}</div>
      <div>${escapeHtml(cat.label)}</div>
    </button>
  `).join('');

  // Bind click events (pas de onclick inline)
  grid.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const catId = btn.dataset.categoryId;
      selectCategory(catId);
    });
  });
}

/**
 * Sélectionne une catégorie
 */
function selectCategory(categoryId) {
  const categories = getCategories();
  const category = categories.find(c => c.id === categoryId);
  if (!category) return;

  quickAddState.selectedCategory = category;

  // Update UI
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.categoryId === categoryId);
  });

  validateForm();
}

// ===== SPLIT MODE =====

/**
 * Met à jour le mode de répartition
 */
function updateSplitMode(mode) {
  quickAddState.splitMode = mode;

  const prorataBtn = document.getElementById('quickSplitProrata');
  const fiftyBtn = document.getElementById('quickSplit5050');
  if (prorataBtn) prorataBtn.classList.toggle('selected', mode === 'prorata');
  if (fiftyBtn) fiftyBtn.classList.toggle('selected', mode === '50-50');
}

// ===== VALIDATION =====

/**
 * Valide le formulaire (catégorie + montant)
 */
function validateForm() {
  const amount = parseFloat(document.getElementById('quickAddAmount')?.value) || 0;
  const hasCategory = quickAddState.selectedCategory !== null;
  const hasAmount = amount > 0;

  const btn = document.getElementById('btnQuickAdd');
  if (btn) btn.disabled = !(hasCategory && hasAmount);
}

// ===== SOUMISSION =====

/**
 * Gère la soumission du formulaire quick-add
 */
async function handleQuickAddSubmit() {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    toast.error('Aucune période sélectionnée');
    return;
  }

  const category = quickAddState.selectedCategory;
  if (!category) {
    toast.error('Veuillez sélectionner une catégorie');
    return;
  }

  const amountEl = document.getElementById('quickAddAmount');
  const amount = parseFloat(amountEl?.value);
  // Ce formulaire plafonnait à 50 000 € quand les trois autres acceptaient
  // 100 000 : la même charge passait ou non selon la porte empruntée.
  const montantValide = validateChargeAmount(amount);
  if (!montantValide.valid) {
    toast.error(montantValide.error);
    return;
  }

  const gps = quickAddState.gpsLocation;
  const splitMode = quickAddState.splitMode;

  // Construire la description : nom du lieu GPS ou label catégorie
  const description = gps?.name || category.label;

  const chargeData = {
    description,
    amount,
    category: category.label,
    categoryId: category.id,
    categoryIcon: category.icon,
    paidBy: 'vous',
    splitMode,
    date: new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    deleted: false
  };

  // Ajouter GPS si disponible
  if (gps) {
    chargeData.location = {
      lat: gps.lat,
      lng: gps.lng,
      name: gps.name || 'Position',
      timestamp: gps.timestamp
    };
  }

  try {
    const { dbPush } = await import('../db.js');
    await dbPush(`periods/${currentPeriod}/variableCharges`, chargeData);

    const modeLabel = splitMode === 'prorata' ? 'Prorata' : '50-50';
    toast.success(`${category.icon} ${description} — ${amount.toFixed(2)} € (${modeLabel})`);

    // Refresh données
    await loadVariableCharges();
    calculateSummary();

    // Fermer la modale
    closeQuickAddModal();
  } catch (error) {
    logError('❌ Erreur ajout rapide :', error);
    toast.error('Erreur lors de l\'ajout');
  }
}

// ===== GPS & GÉOCODAGE =====

const GPS_CACHE_MAX_AGE = 60000; // 60s — position considérée fraîche

/**
 * Démarre le suivi GPS en arrière-plan (watchPosition).
 * Appelé après la première autorisation GPS réussie.
 * Met à jour state.cachedGpsPosition en continu.
 */
function startBackgroundGPS() {
  if (_gpsWatchId !== null) return; // déjà actif
  if (!navigator.geolocation) return;

  _gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const cached = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now()
      };
      setState('cachedGpsPosition', cached);
      log('📡 [GPS] Position mise en cache:', cached.lat.toFixed(5), cached.lng.toFixed(5));
    },
    (error) => {
      if (error.code === 1) {
        // Permission révoquée — arrêter le watch
        stopBackgroundGPS();
        _gpsPermissionGranted = false;
        warn('⚠️ [GPS] Permission révoquée, watch arrêté');
      }
    },
    {
      enableHighAccuracy: false,
      maximumAge: GPS_CACHE_MAX_AGE,
      timeout: 15000
    }
  );
  log('📡 [GPS] Watch en arrière-plan démarré');
}

/**
 * Arrête le suivi GPS en arrière-plan
 */
function stopBackgroundGPS() {
  if (_gpsWatchId !== null) {
    navigator.geolocation.clearWatch(_gpsWatchId);
    _gpsWatchId = null;
    log('📡 [GPS] Watch en arrière-plan arrêté');
  }
}

/**
 * Vérifie si une position en cache est disponible et fraîche (< 60s)
 * @returns {Object|null} Position en cache ou null
 */
function getCachedPosition() {
  const cached = getState('cachedGpsPosition');
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > GPS_CACHE_MAX_AGE) return null;

  return cached;
}

/**
 * Lance la détection GPS (non bloquante).
 * Utilise la position en cache si disponible, sinon getCurrentPosition.
 */
function startGPSDetection() {
  const locationEl = document.getElementById('quickAddLocation');
  if (!locationEl) return;

  if (!navigator.geolocation) {
    warn('⚠️ [GPS] Géolocalisation non disponible');
    locationEl.textContent = '';
    locationEl.className = 'quick-add-location';
    return;
  }

  // Tenter d'utiliser la position en cache
  const cached = getCachedPosition();
  if (cached) {
    log('⚡ [GPS] Position en cache utilisée (âge:', Date.now() - cached.timestamp, 'ms)');
    locationEl.textContent = '📍 Géocodage...';
    locationEl.className = 'quick-add-location loading';
    processGPSPosition(cached, locationEl);
    return;
  }

  // Pas de cache — lancer getCurrentPosition classique
  try {
    locationEl.textContent = '📍 Détection position...';
    locationEl.className = 'quick-add-location loading';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const gpsData = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        };

        // Première autorisation réussie → démarrer le watch en arrière-plan
        if (!_gpsPermissionGranted) {
          _gpsPermissionGranted = true;
          startBackgroundGPS();
        }

        processGPSPosition(gpsData, locationEl);
      },
      (error) => {
        locationEl.textContent = '';
        locationEl.className = 'quick-add-location';

        if (error.code === 1) {
          warn('⚠️ [GPS] Permission refusée');
        } else if (error.code === 2) {
          warn('⚠️ [GPS] Position indisponible');
        } else if (error.code === 3) {
          warn('⚠️ [GPS] Timeout');
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: GPS_CACHE_MAX_AGE
      }
    );
  } catch (globalError) {
    logError('❌ [GPS] Erreur critique:', globalError);
    locationEl.textContent = '';
    locationEl.className = 'quick-add-location';
  }
}

/**
 * Traite une position GPS (cache ou fraîche) : reverse geocoding + auto-catégorie
 */
async function processGPSPosition(gpsData, locationEl) {
  try {
    quickAddState.gpsLocation = gpsData;

    // Géocodage inversé pour obtenir le nom du lieu
    try {
      const place = await reverseGeocode(gpsData.lat, gpsData.lng);
      if (place?.name) {
        gpsData.name = place.name;
        quickAddState.gpsLocation = gpsData;

        locationEl.textContent = `✓ ${place.name}`;
        locationEl.className = 'quick-add-location success';

        // Auto-détection catégorie
        const detected = detectCategoryFromPlace(place);
        if (detected && !quickAddState.selectedCategory) {
          selectCategory(detected.id);
          toast.info(`📍 ${detected.label} détecté`);
        }
      } else {
        locationEl.textContent = '✓ Position enregistrée';
        locationEl.className = 'quick-add-location success';
      }
    } catch {
      locationEl.textContent = '✓ Position enregistrée';
      locationEl.className = 'quick-add-location success';
    }
  } catch (err) {
    logError('❌ [GPS] Erreur traitement position:', err);
    locationEl.textContent = '✗ Erreur GPS';
    locationEl.className = 'quick-add-location error';
  }
}

/**
 * Géocodage inversé via Nominatim (OpenStreetMap, gratuit)
 */
async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'FairSplit/1.0' } }
    );
    if (!response.ok) return null;

    const data = await response.json();
    return {
      name: data.name || data.address?.shop || data.address?.amenity || data.address?.building,
      address: data.display_name,
      city: data.address?.city || data.address?.town,
      type: data.type,
      rawAddress: data.address
    };
  } catch (error) {
    logError('Reverse geocoding failed:', error);
    return null;
  }
}

/**
 * Détecte la catégorie depuis le type de lieu OSM
 */
function detectCategoryFromPlace(place) {
  if (!place) return null;

  const categories = getCategories();
  const findCat = (id) => categories.find(c => c.id === id);

  // Mapping types OSM → catégories
  const typeMapping = {
    'supermarket': findCat('courses'),
    'fuel': findCat('essence'),
    'restaurant': findCat('restaurant'),
    'pharmacy': findCat('sante')
  };

  if (place.type && typeMapping[place.type]) {
    return typeMapping[place.type];
  }

  // Fallback : analyse du nom du lieu
  const fullText = ((place.name || '') + ' ' + (place.address || '')).toLowerCase();

  if (/leclerc|carrefour|intermarché|auchan|lidl|super u|picard/.test(fullText)) {
    return findCat('courses');
  }
  if (/total|esso|shell|bp |engie|station/.test(fullText)) {
    return findCat('essence');
  }
  if (/restaurant|pizzeria|brasserie|bistrot|kebab|mcdo|burger/.test(fullText)) {
    return findCat('restaurant');
  }
  if (/pharmacie|clinique|hôpital|médecin/.test(fullText)) {
    return findCat('sante');
  }

  return null;
}

// ===== API PROGRAMMATIQUE =====

/**
 * Ajoute une charge rapide par programmation
 * @param {Object} chargeData - { description, amount, category?, paidBy?, date? }
 * @returns {Promise<Object>} Charge créée
 */
export async function addQuickCharge(chargeData) {
  const currentPeriod = getState('currentPeriod');
  if (!currentPeriod) {
    throw new Error('Aucune période sélectionnée');
  }

  const charge = {
    description: chargeData.description,
    amount: parseFloat(chargeData.amount),
    category: chargeData.category || 'Autre',
    paidBy: chargeData.paidBy || 'vous',
    date: chargeData.date || new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    deleted: false
  };

  if (!charge.description || !charge.amount || charge.amount <= 0) {
    throw new Error('Données invalides');
  }

  try {
    const { dbPush } = await import('../db.js');
    await dbPush(`periods/${currentPeriod}/variableCharges`, charge);

    await loadVariableCharges();
    calculateSummary();

    toast.success('Charge ajoutée');
    return charge;
  } catch (error) {
    logError('❌ Erreur addQuickCharge :', error);
    toast.error('Erreur lors de l\'ajout de la charge');
    throw error;
  }
}

// ===== EXPORTS GLOBAUX (compatibilité HTML) =====
window.showQuickAddModal = showQuickAddModal;
window.closeQuickAddModal = closeQuickAddModal;
window.handleQuickAddSubmit = handleQuickAddSubmit;
window.addQuickCharge = addQuickCharge;

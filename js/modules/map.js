// ===== MODULE : CARTE INTERACTIVE =====
// Fonctionnalités : visualisation géographique des dépenses avec Leaflet

import { getState, setState } from '../state.js';
import { formatCurrency, formatPaidBy } from '../utils/format.js';
import { formatDate } from '../utils/date.js';
import { toast } from '../components/toast.js';
import { log, warn, error as logError } from '../utils/debug.js';

let map = null;
let markers = [];
let markerClusterGroup = null;

/**
 * Initialise le module de carte interactive
 */
export function initMap() {
  log('📦 Initialisation module carte');

  setupMapUI();

  log('✅ Module carte initialisé');
}

/**
 * Configure l'interface utilisateur pour la carte
 */
function setupMapUI() {
  // Bouton afficher carte
  const showMapBtn = document.getElementById('showMapBtn');
  if (showMapBtn) {
    showMapBtn.addEventListener('click', () => {
      showMapModal();
    });
  }

  // Bouton fermer carte
  const closeMapBtn = document.getElementById('closeMapBtn');
  if (closeMapBtn) {
    closeMapBtn.addEventListener('click', () => {
      hideMapModal();
    });
  }

  // Filtres de catégorie
  const categoryFilters = document.querySelectorAll('.map-category-filter');
  categoryFilters.forEach(filter => {
    filter.addEventListener('change', () => {
      updateMapMarkers();
    });
  });
}

/**
 * Affiche le modal de la carte
 */
function showMapModal() {
  const mapModal = document.getElementById('mapModal');
  if (!mapModal) {
    createMapModal();
  }

  const modal = document.getElementById('mapModal');
  modal.style.display = 'block';

  // Initialiser la carte si pas déjà fait
  if (!map) {
    setTimeout(() => {
      initializeLeafletMap();
      loadChargesOnMap();
    }, 300);
  } else {
    // Rafraîchir les données
    loadChargesOnMap();
  }
}

/**
 * Masque le modal de la carte
 */
function hideMapModal() {
  const modal = document.getElementById('mapModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Crée le modal de carte dans le DOM
 */
function createMapModal() {
  const modal = document.createElement('div');
  modal.id = 'mapModal';
  modal.className = 'map-modal';
  modal.style.display = 'none';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'mapModalTitle');

  modal.innerHTML = `
    <div class="map-modal-content">
      <div class="map-header">
        <h2 id="mapModalTitle">🗺️ Carte des Dépenses</h2>
        <button id="closeMapBtn" class="btn-close">&times;</button>
      </div>

      <div class="map-filters">
        <label>
          <input type="checkbox" class="map-category-filter" value="Alimentation" checked>
          🍽️ Alimentation
        </label>
        <label>
          <input type="checkbox" class="map-category-filter" value="Transport" checked>
          🚗 Transport
        </label>
        <label>
          <input type="checkbox" class="map-category-filter" value="Loisirs" checked>
          🎮 Loisirs
        </label>
        <label>
          <input type="checkbox" class="map-category-filter" value="Santé" checked>
          ❤️ Santé
        </label>
        <label>
          <input type="checkbox" class="map-category-filter" value="Autre" checked>
          📦 Autre
        </label>
      </div>

      <div id="mapContainer" class="map-container"></div>

      <div class="map-stats">
        <div class="map-stat-item">
          <span class="map-stat-label">Total affiché :</span>
          <span id="mapTotalAmount" class="map-stat-value">0.00 €</span>
        </div>
        <div class="map-stat-item">
          <span class="map-stat-label">Marqueurs :</span>
          <span id="mapMarkerCount" class="map-stat-value">0</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Setup des listeners après création
  const closeBtn = document.getElementById('closeMapBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideMapModal);
  }

  const filters = document.querySelectorAll('.map-category-filter');
  filters.forEach(filter => {
    filter.addEventListener('change', () => {
      updateMapMarkers();
    });
  });
}

/**
 * Initialise la carte Leaflet
 */
function initializeLeafletMap() {
  // Vérifier que Leaflet est chargé
  if (typeof L === 'undefined') {
    toast.error('Leaflet n\'est pas chargé. Vérifiez le CDN.');
    logError('❌ Leaflet non disponible');
    return;
  }

  try {
    // Centre par défaut : France (Paris)
    const defaultCenter = [48.8566, 2.3522];
    const defaultZoom = 6;

    map = L.map('mapContainer').setView(defaultCenter, defaultZoom);

    // Tuile OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Initialiser le cluster de marqueurs si disponible
    if (typeof L.markerClusterGroup !== 'undefined') {
      markerClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
      });
      map.addLayer(markerClusterGroup);
    }

    log('✅ Carte Leaflet initialisée');
  } catch (error) {
    logError('❌ Erreur initialisation carte :', error);
    toast.error('Erreur lors de l\'initialisation de la carte');
  }
}

/**
 * Charge les charges géolocalisées sur la carte
 */
async function loadChargesOnMap() {
  if (!map) {
    warn('⚠️ Carte non initialisée');
    return;
  }

  log('🗺️ [MAP-1] Chargement des charges sur la carte');

  // Récupérer les charges
  const variableCharges = getState('variableCharges') || [];
  const fixedCharges = getState('fixedCharges') || [];
  const allCharges = [...variableCharges, ...fixedCharges];

  log(`🗺️ [MAP-2] Charges récupérées: ${variableCharges.length} variables, ${fixedCharges.length} fixes`);
  log('🗺️ [MAP-2b] Charges variables avec location:',
    variableCharges.filter(c => c.location).map(c => ({
      desc: c.description,
      location: c.location
    }))
  );

  // Nettoyer les marqueurs existants
  clearMarkers();

  // Filtrer les charges avec géolocalisation (simulation pour démo)
  const geoCharges = allCharges
    .filter(charge => !charge.deleted)
    .map(charge => addGeolocationToCharge(charge))
    .filter(charge => charge.location);

  log(`🗺️ [MAP-3] Charges géolocalisées après traitement: ${geoCharges.length}`);

  // Créer les marqueurs
  let totalAmount = 0;
  geoCharges.forEach(charge => {
    const marker = createMarker(charge);
    if (marker) {
      markers.push(marker);
      if (markerClusterGroup) {
        markerClusterGroup.addLayer(marker);
      } else {
        marker.addTo(map);
      }
      totalAmount += charge.amount;
    }
  });

  // Mettre à jour les statistiques
  updateMapStats(totalAmount, markers.length);

  // Ajuster la vue pour inclure tous les marqueurs
  if (markers.length > 0) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1));
  }

  log(`📍 ${markers.length} marqueur(s) affiché(s) sur la carte`);
}

/**
 * Ajoute une géolocalisation simulée à une charge SI elle n'en a pas déjà
 * (En production, ces données viendraient de la base ou d'une API de géocodage)
 * @param {Object} charge - Charge à géolocaliser
 * @returns {Object} Charge avec location ajoutée
 */
function addGeolocationToCharge(charge) {
  // ✅ IMPORTANT: Si la charge a déjà une vraie géolocalisation, la préserver
  if (charge.location && charge.location.lat && charge.location.lng) {
    log('📍 [GEO-PRESERVE] Vraie géolocalisation préservée:',
      charge.description,
      'GPS:', charge.location.lat.toFixed(5), charge.location.lng.toFixed(5),
      'Nom:', charge.location.name
    );
    return charge;
  }

  log('🔍 [GEO-SIMULATE] Pas de GPS réel pour:', charge.description, '- tentative simulation');

  // Simulation : détection de mots-clés dans la description pour assigner des coordonnées
  const description = charge.description.toLowerCase();

  // Base de données simplifiée de lieux connus
  const locationDatabase = {
    'carrefour': { lat: 48.8566, lng: 2.3522, name: 'Carrefour Paris' },
    'auchan': { lat: 48.8738, lng: 2.2950, name: 'Auchan' },
    'lidl': { lat: 48.8462, lng: 2.3371, name: 'Lidl' },
    'restaurant': { lat: 48.8606, lng: 2.3376, name: 'Restaurant' },
    'pharmacie': { lat: 48.8584, lng: 2.2945, name: 'Pharmacie' },
    'essence': { lat: 48.8400, lng: 2.3200, name: 'Station Essence' },
    'cinéma': { lat: 48.8700, lng: 2.3100, name: 'Cinéma' }
  };

  // Rechercher un match pour simulation
  for (const [keyword, location] of Object.entries(locationDatabase)) {
    if (description.includes(keyword)) {
      log('📍 Géolocalisation simulée:', charge.description, keyword);
      return {
        ...charge,
        location: {
          lat: location.lat + (Math.random() - 0.5) * 0.01, // Ajouter petite variation
          lng: location.lng + (Math.random() - 0.5) * 0.01,
          name: location.name
        }
      };
    }
  }

  // Si aucun match, pas de localisation
  return charge;
}

/**
 * Crée un marqueur Leaflet pour une charge
 * @param {Object} charge - Charge à afficher
 * @returns {L.Marker} Marqueur Leaflet
 */
function createMarker(charge) {
  if (!charge.location) return null;

  try {
    // Icône personnalisée selon la catégorie
    const iconHtml = getCategoryMarkerIcon(charge.category);

    const customIcon = L.divIcon({
      html: iconHtml,
      className: 'custom-marker',
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -30]
    });

    const marker = L.marker([charge.location.lat, charge.location.lng], {
      icon: customIcon
    });

    // Popup avec détails de la charge
    const popupContent = `
      <div class="marker-popup">
        <h4>${escapeHtml(charge.description)}</h4>
        <p><strong>Montant :</strong> ${formatCurrency(charge.amount)}</p>
        <p><strong>Catégorie :</strong> ${escapeHtml(charge.category || 'N/A')}</p>
        <p><strong>Payé par :</strong> ${formatPaidBy(charge.paidBy)}</p>
        <p><strong>Date :</strong> ${formatDate(charge.date)}</p>
        ${charge.location.name ? `<p><strong>Lieu :</strong> ${escapeHtml(charge.location.name)}</p>` : ''}
      </div>
    `;

    marker.bindPopup(popupContent);

    // Stocker les données de charge dans le marqueur
    marker.chargeData = charge;

    return marker;
  } catch (error) {
    logError('❌ Erreur création marqueur :', error);
    return null;
  }
}

/**
 * Retourne l'icône HTML pour un marqueur selon la catégorie
 * @param {string} category - Catégorie de la charge
 * @returns {string} HTML de l'icône
 */
function getCategoryMarkerIcon(category) {
  const icons = {
    'Alimentation': '🍽️',
    'Transport': '🚗',
    'Loisirs': '🎮',
    'Santé': '❤️',
    'Autre': '📦'
  };

  const emoji = icons[category] || '📍';

  return `
    <div style="
      font-size: 24px;
      text-align: center;
      line-height: 30px;
      background: white;
      border-radius: 50%;
      border: 2px solid #667eea;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">
      ${emoji}
    </div>
  `;
}

/**
 * Nettoie tous les marqueurs de la carte
 */
function clearMarkers() {
  if (markerClusterGroup) {
    markerClusterGroup.clearLayers();
  } else {
    markers.forEach(marker => {
      if (map && marker) {
        map.removeLayer(marker);
      }
    });
  }
  markers = [];
}

/**
 * Met à jour les marqueurs selon les filtres actifs
 */
function updateMapMarkers() {
  // Récupérer les catégories actives
  const activeCategories = Array.from(
    document.querySelectorAll('.map-category-filter:checked')
  ).map(checkbox => checkbox.value);

  // Filtrer les marqueurs
  let visibleCount = 0;
  let totalAmount = 0;

  markers.forEach(marker => {
    const charge = marker.chargeData;
    const isVisible = activeCategories.includes(charge.category);

    if (markerClusterGroup) {
      if (isVisible) {
        if (!markerClusterGroup.hasLayer(marker)) {
          markerClusterGroup.addLayer(marker);
        }
        visibleCount++;
        totalAmount += charge.amount;
      } else {
        markerClusterGroup.removeLayer(marker);
      }
    } else {
      if (isVisible) {
        if (!map.hasLayer(marker)) {
          marker.addTo(map);
        }
        visibleCount++;
        totalAmount += charge.amount;
      } else {
        if (map.hasLayer(marker)) {
          map.removeLayer(marker);
        }
      }
    }
  });

  // Mettre à jour les stats
  updateMapStats(totalAmount, visibleCount);
}

/**
 * Met à jour les statistiques de la carte
 * @param {number} totalAmount - Montant total
 * @param {number} markerCount - Nombre de marqueurs
 */
function updateMapStats(totalAmount, markerCount) {
  const totalEl = document.getElementById('mapTotalAmount');
  const countEl = document.getElementById('mapMarkerCount');

  if (totalEl) {
    totalEl.textContent = formatCurrency(totalAmount);
  }

  if (countEl) {
    countEl.textContent = markerCount;
  }
}

/**
 * Ajoute ou met à jour une géolocalisation pour une charge existante
 * @param {string} chargeId - ID de la charge
 * @param {string} chargeType - Type de charge ('variableCharges' ou 'fixedCharges')
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} locationName - Nom du lieu
 */
export async function addGeoCharge(chargeId, chargeType, lat, lng, locationName) {
  if (!chargeId || !chargeType) {
    logError('❌ addGeoCharge: chargeId et chargeType requis');
    return;
  }

  const locationData = {
    lat: lat,
    lng: lng,
    name: locationName || 'Localisation',
    timestamp: Date.now()
  };

  try {
    // ✅ Sauvegarder dans Firebase avec location
    const { dbUpdate } = await import('../db.js');
    const currentPeriod = getState('currentPeriod');

    await dbUpdate(`periods/${currentPeriod}/${chargeType}/${chargeId}/location`, locationData);

    log('📍 Géolocalisation sauvegardée :', locationData);
    toast.success('📍 Localisation ajoutée');

    // Mettre à jour le state local
    const charges = getState(chargeType) || [];
    const updatedCharges = charges.map(c =>
      c.id === chargeId ? { ...c, location: locationData } : c
    );
    setState(chargeType, updatedCharges);

    // Rafraîchir la carte si ouverte
    if (map) {
      loadChargesOnMap();
    }
  } catch (error) {
    logError('❌ Erreur sauvegarde géolocalisation :', error);
    toast.error('Erreur lors de l\'ajout de la localisation');
  }
}

/**
 * Centre la carte sur une position spécifique
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} zoom - Niveau de zoom
 */
export function centerMap(lat, lng, zoom = 13) {
  if (map) {
    map.setView([lat, lng], zoom);
  }
}

/**
 * Nettoie les ressources du module map (appelé au logout)
 */
export function cleanupMap() {
  clearMarkers();
  if (map) {
    map.remove();
    map = null;
  }
  markerClusterGroup = null;
  const modal = document.getElementById('mapModal');
  if (modal) {
    modal.remove();
  }
  log('🧹 Ressources carte nettoyées');
}

// Exposer les fonctions globalement pour compatibilité
window.showMapModal = showMapModal;
window.hideMapModal = hideMapModal;
window.centerMap = centerMap;

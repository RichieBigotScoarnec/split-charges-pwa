// ===== MODULE : CARTE INTERACTIVE =====
// Fonctionnalités : visualisation géographique des dépenses avec Leaflet

import { getState } from '../state.js';
import { getCategories, getCategoryIcon } from './custom-lists.js';
import { formatCurrency, formatPaidBy, escapeHtml } from '../utils/format.js';
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
  // L'accès à la carte passe par data-action="showMapModal".
  refreshMapButton();
}

/**
 * Affiche le bouton d'accès si au moins une dépense porte des coordonnées
 *
 * Le seul accès à la carte se trouvait dans un panneau maintenu en
 * display:none : la fonctionnalité était inatteignable, alors même que
 * Leaflet était téléchargé à chaque ouverture de l'application.
 */
export function refreshMapButton() {
  const bouton = document.getElementById('mapButton');
  if (!bouton) return;

  const localisees = [...(getState('variableCharges') || []), ...(getState('fixedCharges') || [])]
    .filter(c => c && !c.deleted && c.location && c.location.lat && c.location.lng);

  bouton.hidden = localisees.length === 0;

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
async function showMapModal() {
  if (!document.getElementById('mapModal')) {
    createMapModal();
  }

  const modal = document.getElementById('mapModal');
  modal.style.display = 'block';

  if (map) {
    loadChargesOnMap();
    return;
  }

  // Leaflet n'est plus chargé d'avance : il arrive ici, au premier usage.
  const pret = await ensureLeaflet();
  if (!pret) {
    toast.error('Carte indisponible : bibliothèque non chargée');
    return;
  }

  // Le conteneur doit avoir ses dimensions avant que Leaflet le mesure.
  requestAnimationFrame(() => {
    initializeLeafletMap();
    loadChargesOnMap();
  });
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

      <!-- Peuplés à l'ouverture, à partir des catégories réellement portées
           par les dépenses affichées. La liste figée qui vivait ici — dont une
           catégorie « Alimentation » qui n'a jamais existé dans le projet —
           masquait toute dépense de Courses, Maison, Essence ou Restaurant,
           ainsi que toute catégorie personnalisée. -->
      <div class="map-filters" id="mapFilters"></div>

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

  // Délégation : les cases sont reconstruites à chaque ouverture, un écouteur
  // posé sur chacune serait perdu au rendu suivant.
  const filtres = document.getElementById('mapFilters');
  if (filtres) {
    filtres.addEventListener('change', (e) => {
      if (e.target.classList.contains('map-category-filter')) updateMapMarkers();
    });
  }
}

/**
 * Construit les cases de filtrage à partir des dépenses affichées
 *
 * La liste était figée dans le balisage et ne correspondait pas aux catégories
 * du projet : le filtrage étant une correspondance exacte sur le libellé, une
 * dépense de Courses, Maison, Essence ou Restaurant n'était retenue par aucune
 * case et disparaissait de la carte — cases toutes cochées comprises. Les
 * catégories personnalisées subissaient le même sort.
 *
 * Dériver les cases des dépenses réellement présentes garantit l'invariant qui
 * manquait : tout marqueur a une case qui le montre.
 *
 * @param {Array<Object>} charges - Dépenses géolocalisées à afficher
 */
export function buildCategoryFilters(charges) {
  const conteneur = document.getElementById('mapFilters');
  if (!conteneur) return;

  // L'ordre des catégories configurées d'abord, les libellés hérités ensuite :
  // une catégorie supprimée depuis reste filtrable tant qu'une dépense la porte.
  const presentes = [...new Set(charges.map(c => c.category).filter(Boolean))];
  const configurees = getCategories().map(c => c.label);
  const ordonnees = [
    ...configurees.filter(label => presentes.includes(label)),
    ...presentes.filter(label => !configurees.includes(label))
  ];

  conteneur.innerHTML = ordonnees.map(label => `
    <label>
      <input type="checkbox" class="map-category-filter" value="${escapeHtml(label)}" checked>
      ${escapeHtml(getCategoryIcon(label))} ${escapeHtml(label)}
    </label>
  `).join('');
}

/** URL et empreintes de Leaflet, reprises telles quelles du HTML */
const LEAFLET = {
  css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  cssIntegrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
  js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  jsIntegrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='
};

let leafletPromise = null;

/**
 * Charge Leaflet au premier usage
 *
 * La bibliothèque pèse 158 Ko et n'était utilisée que par la carte — laquelle
 * était de surcroît inatteignable. La charger sur chaque ouverture de
 * l'application faisait payer à tout le monde une fonctionnalité que personne
 * n'ouvrait.
 *
 * @returns {Promise<boolean>} true si Leaflet est prêt
 */
function ensureLeaflet() {
  if (typeof L !== 'undefined') return Promise.resolve(true);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise(resolve => {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = LEAFLET.css;
    style.integrity = LEAFLET.cssIntegrity;
    style.crossOrigin = '';
    document.head.appendChild(style);

    const script = document.createElement('script');
    script.src = LEAFLET.js;
    script.integrity = LEAFLET.jsIntegrity;
    script.crossOrigin = '';
    script.onload = () => resolve(true);
    script.onerror = () => {
      // Une seconde tentative reste possible : la promesse est oubliée.
      leafletPromise = null;
      logError('❌ Chargement de Leaflet impossible');
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return leafletPromise;
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
 * Dépenses du mois portant de vraies coordonnées
 *
 * Une simulation se glissait ici : à défaut de coordonnées, elle en inventait
 * à Paris d'après un mot-clé de la description — « carrefour », « restaurant »,
 * « essence » — avec une variation aléatoire, si bien que le même repas
 * changeait de place à chaque ouverture. Le commentaire d'origine l'annonçait
 * comme provisoire (« en production, ces données viendraient de la base »).
 * Une carte de comptes doit montrer ce qui a été enregistré, ou ne rien
 * montrer : un marqueur inventé se lit exactement comme un marqueur réel.
 *
 * @returns {Array<Object>} Dépenses variables et fixes réellement localisées
 */
export function chargesLocalisees() {
  return [...(getState('variableCharges') || []), ...(getState('fixedCharges') || [])]
    .filter(charge => charge && !charge.deleted)
    .filter(charge => charge.location && charge.location.lat && charge.location.lng);
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

  // Nettoyer les marqueurs existants
  clearMarkers();

  const geoCharges = chargesLocalisees();

  log(`🗺️ [MAP-3] Charges géolocalisées : ${geoCharges.length}`);

  // Les cases de filtrage suivent ce qui est affiché, jamais l'inverse.
  buildCategoryFilters(geoCharges);

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
        <p><strong>Payé par :</strong> ${escapeHtml(formatPaidBy(charge.paidBy))}</p>
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
  // Même source que les listes de charges et la saisie rapide : une deuxième
  // table figée ici ne montrait 📍 pour presque tout, et ignorait les icônes
  // choisies dans les catégories personnalisées.
  const emoji = getCategoryIcon(category);

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
      ${escapeHtml(emoji)}
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

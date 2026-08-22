// ===== MODULE : GRAPHIQUES DE TENDANCES =====
// Fonctionnalités : visualisation évolution dépenses, comparaison périodes

import { getFirebaseDatabase } from '../firebase-init.js';
import { getState } from '../state.js';
import { formatCurrency, escapeHtml } from '../utils/format.js';
import { toast } from '../components/toast.js';
import { getDataPath } from '../db.js';
import { log, warn, error as logError } from '../utils/debug.js';

let database = null;

/**
 * Les trois séries du graphique, couleur et libellé
 *
 * Elles étaient écrites deux fois — une fois aux appels de tracé, une fois dans
 * la légende — sans rien pour garantir l'accord. Une couleur changée d'un côté
 * aurait donné une légende qui ment sur ce qu'elle désigne.
 */
const SERIES = {
  fixes: { couleur: '#667eea', libelle: 'Charges fixes' },
  variables: { couleur: '#f093fb', libelle: 'Charges variables' },
  total: { couleur: '#4ade80', libelle: 'Total' }
};

/**
 * Initialise le module de tendances
 */
export function initTrends() {
  log('📦 Initialisation module tendances');

  database = getFirebaseDatabase();
  setupTrendsUI();

  log('✅ Module tendances initialisé');
}

/**
 * Configure l'accès aux tendances
 *
 * Le déclencheur visait #generateTrendsBtn, absent du HTML : rien n'a jamais
 * appelé generateTrendsChart, et le canevas qu'elle cherchait n'existait pas
 * non plus. La section n'a donc jamais rien affiché, alors que le README
 * annonçait des tendances sur six mois.
 */
function setupTrendsUI() {
  window.toggleTrends = toggleTrends;
}

/** Le graphique n'est produit qu'une fois par ouverture de l'application */
let trendsRendered = false;

/**
 * Ouvre ou referme le panneau des tendances
 *
 * Le graphique demande une lecture de tout l'historique : il n'est produit
 * qu'au premier dépliage, et pas au chargement de l'application.
 *
 * @returns {Promise<void>}
 */
export async function toggleTrends() {
  const contenu = document.getElementById('trendsContent');
  const bascule = document.getElementById('trendsToggle');
  if (!contenu || !bascule) return;

  const ouvert = !contenu.hidden;
  contenu.hidden = ouvert;
  bascule.setAttribute('aria-expanded', String(!ouvert));

  if (!ouvert && !trendsRendered) {
    trendsRendered = true;
    await generateTrendsChart();
  }
}

/**
 * Oublie le graphique déjà produit
 *
 * Après un changement de données, le graphique affiché décrit un état
 * périmé : le prochain dépliage doit le refaire.
 */
export function invalidateTrends() {
  trendsRendered = false;
}

/**
 * Récupère les données historiques pour les tendances
 * @param {number} months - Nombre de mois à récupérer
 * @returns {Promise<Object>} Données historiques
 */
export async function fetchHistoricalData(months = 6) {
  const currentUser = getState('currentUser');
  if (!currentUser) {
    toast.error('Utilisateur non connecté');
    return null;
  }

  try {
    const snapshot = await database.ref(getDataPath('periods')).once('value');

    if (!snapshot.exists()) {
      return { periods: [], data: {} };
    }

    const allPeriods = snapshot.val();
    // Mêmes clés que partout ailleurs : le nœud `periods` a hébergé des
    // écritures accidentelles (`periods/undefined`), que calculations.js écarte
    // déjà. Sans ce filtre, elles apparaissaient sur le graphique.
    const periodKeys = Object.keys(allPeriods)
      .filter(key => /^\d{4}-(0[1-9]|1[0-2])$/.test(key))
      .sort()
      .reverse(); // Plus récent en premier
    const selectedPeriods = periodKeys.slice(0, months);

    const historicalData = {
      periods: selectedPeriods.reverse(), // Chronologique croissant
      data: {}
    };

    selectedPeriods.forEach(period => {
      const periodData = allPeriods[period];

      historicalData.data[period] = {
        fixedCharges: calculatePeriodTotal(periodData.fixedCharges),
        variableCharges: calculatePeriodTotal(periodData.variableCharges),
        reimbursements: calculatePeriodTotal(periodData.reimbursements),
        salaries: periodData.salaries || { vous: 0, conjointe: 0 }
      };

      historicalData.data[period].total =
        historicalData.data[period].fixedCharges +
        historicalData.data[period].variableCharges;
    });

    return historicalData;

  } catch (error) {
    logError('❌ Erreur récupération données historiques :', error);
    toast.error('Erreur lors de la récupération des données');
    return null;
  }
}

/**
 * Calcule le total d'une collection de charges
 * @param {Object} charges - Collection de charges
 * @returns {number} Total
 */
function calculatePeriodTotal(charges) {
  if (!charges) return 0;

  return Object.values(charges)
    .filter(charge => !charge.deleted)
    .reduce((sum, charge) => sum + (charge.amount || 0), 0);
}

/**
 * Génère et affiche le graphique de tendances
 * @param {number} months - Nombre de mois à afficher
 */
export async function generateTrendsChart(months = 6) {
  const canvas = document.getElementById('trendsCanvas');

  if (!canvas) {
    warn('⚠️ Element #trendsCanvas introuvable');
    return;
  }

  toast.info('Génération des tendances...');

  const historicalData = await fetchHistoricalData(months);

  if (!historicalData || historicalData.periods.length === 0) {
    toast.warning('Aucune donnée historique disponible');
    return;
  }

  // Afficher le graphique
  renderTrendsChart(canvas, historicalData);

  // Afficher les statistiques
  renderTrendsStats(historicalData);

  toast.success('Tendances générées');
}

/**
 * Dessine le graphique de tendances sur canvas
 * @param {HTMLCanvasElement} canvas - Element canvas
 * @param {Object} data - Données historiques
 */
function renderTrendsChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  // Les couleurs venaient en dur : fond clair et texte sombre, illisibles et
  // étrangers au thème sombre. Elles sont lues sur les jetons de la page, comme
  // le veut le reste du projet.
  const jeton = (nom, defaut) =>
    getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || defaut;
  const couleurs = {
    fond: jeton('--elevated-bg', '#f9f9f9'),
    grille: jeton('--border-color', '#e0e0e0'),
    texte: jeton('--text-secondary', '#666'),
    axes: jeton('--text-primary', '#333')
  };
  const width = canvas.width;
  const height = canvas.height;

  // Effacer le canvas
  ctx.clearRect(0, 0, width, height);

  // Marges
  const margin = { top: 40, right: 40, bottom: 60, left: 80 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Données à afficher
  const periods = data.periods;
  const totals = periods.map(p => data.data[p].total);
  const fixedTotals = periods.map(p => data.data[p].fixedCharges);
  const variableTotals = periods.map(p => data.data[p].variableCharges);

  // Échelles
  const maxValue = Math.max(...totals) * 1.1 || 1; // +10% marge, min 1 pour éviter div/0
  const xStep = chartWidth / (periods.length - 1 || 1);
  const yScale = chartHeight / maxValue;

  // Fond
  ctx.fillStyle = couleurs.fond;
  ctx.fillRect(margin.left, margin.top, chartWidth, chartHeight);

  // Grille horizontale
  ctx.strokeStyle = couleurs.grille;
  ctx.lineWidth = 1;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = margin.top + (chartHeight / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + chartWidth, y);
    ctx.stroke();

    // Labels Y
    const value = maxValue * (1 - i / gridLines);
    ctx.fillStyle = couleurs.texte;
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(formatCurrency(value), margin.left - 10, y + 4);
  }

  // Dessiner les courbes
  drawLine(ctx, periods, fixedTotals, margin, xStep, yScale, chartHeight, SERIES.fixes.couleur, SERIES.fixes.libelle);
  drawLine(ctx, periods, variableTotals, margin, xStep, yScale, chartHeight, SERIES.variables.couleur, SERIES.variables.libelle);
  drawLine(ctx, periods, totals, margin, xStep, yScale, chartHeight, SERIES.total.couleur, SERIES.total.libelle, 3);

  // Axes
  ctx.strokeStyle = couleurs.axes;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + chartHeight);
  ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
  ctx.stroke();

  // Labels X (périodes)
  ctx.fillStyle = couleurs.texte;
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  periods.forEach((period, i) => {
    const x = margin.left + i * xStep;
    const y = margin.top + chartHeight + 20;
    ctx.fillText(period, x, y);
  });

  // Titre
  ctx.fillStyle = couleurs.axes;
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Évolution des Dépenses', width / 2, 25);

  // Légende
  drawLegend(ctx, width, height, margin);
}

/**
 * Dessine une ligne sur le graphique
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {Array} periods - Périodes
 * @param {Array} values - Valeurs
 * @param {Object} margin - Marges
 * @param {number} xStep - Pas X
 * @param {number} yScale - Échelle Y
 * @param {number} chartHeight - Hauteur du graphique
 * @param {string} color - Couleur de la ligne
 * @param {string} label - Label de la ligne
 * @param {number} lineWidth - Épaisseur de la ligne
 */
function drawLine(ctx, periods, values, margin, xStep, yScale, chartHeight, color, label, lineWidth = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  values.forEach((value, i) => {
    const x = margin.left + i * xStep;
    const y = margin.top + chartHeight - (value * yScale);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // Points
  ctx.fillStyle = color;
  values.forEach((value, i) => {
    const x = margin.left + i * xStep;
    const y = margin.top + chartHeight - (value * yScale);

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
  });
}

/**
 * Dessine la légende
 * @param {CanvasRenderingContext2D} ctx - Contexte canvas
 * @param {number} width - Largeur canvas
 * @param {number} height - Hauteur canvas
 * @param {Object} margin - Marges
 */
function drawLegend(ctx, width, height, margin) {
  const legendItems = Object.values(SERIES).map(s => ({ color: s.couleur, label: s.libelle }));

  const legendX = width - margin.right - 150;
  const legendY = margin.top + 20;
  const lineHeight = 25;

  legendItems.forEach((item, i) => {
    const y = legendY + i * lineHeight;

    // Ligne colorée
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(legendX, y);
    ctx.lineTo(legendX + 30, y);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(item.label, legendX + 40, y + 4);
  });
}

/**
 * Affiche les statistiques de tendances
 * @param {Object} data - Données historiques
 */
function renderTrendsStats(data) {
  const statsContainer = document.getElementById('trendsStats');

  if (!statsContainer) {
    return;
  }

  const periods = data.periods;
  const totals = periods.map(p => data.data[p].total);

  // Calculer les statistiques
  const average = totals.length > 0 ? totals.reduce((sum, v) => sum + v, 0) / totals.length : 0;
  const min = Math.min(...totals);
  const max = Math.max(...totals);

  // Tendance (variation entre première et dernière période)
  const first = totals[0];
  const last = totals[totals.length - 1];
  const trend = last - first;
  const trendPercent = first > 0 ? (trend / first) * 100 : 0;

  // Afficher
  statsContainer.innerHTML = `
    <div class="trends-stats-grid">
      <div class="stat-card">
        <div class="stat-label">Moyenne</div>
        <div class="stat-value">${formatCurrency(average)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Minimum</div>
        <div class="stat-value">${formatCurrency(min)}</div>
        <div class="stat-period">${escapeHtml(periods[totals.indexOf(min)])}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Maximum</div>
        <div class="stat-value">${formatCurrency(max)}</div>
        <div class="stat-period">${escapeHtml(periods[totals.indexOf(max)])}</div>
      </div>
      <div class="stat-card ${trend >= 0 ? 'trend-up' : 'trend-down'}">
        <div class="stat-label">Tendance</div>
        <div class="stat-value">${trend >= 0 ? '↗' : '↘'} ${formatCurrency(Math.abs(trend))}</div>
        <div class="stat-percent">${trendPercent >= 0 ? '+' : ''}${trendPercent.toFixed(1)}%</div>
      </div>
    </div>
  `;
}

/**
 * Compare deux périodes
 * @param {string} period1 - Première période
 * @param {string} period2 - Deuxième période
 * @returns {Promise<Object>} Comparaison
 */
export async function comparePeriods(period1, period2) {
  const data = await fetchHistoricalData(12);

  if (!data || !data.data[period1] || !data.data[period2]) {
    toast.error('Périodes non trouvées');
    return null;
  }

  const p1 = data.data[period1];
  const p2 = data.data[period2];

  return {
    periods: [period1, period2],
    comparison: {
      totalDiff: p2.total - p1.total,
      fixedDiff: p2.fixedCharges - p1.fixedCharges,
      variableDiff: p2.variableCharges - p1.variableCharges,
      percentChange: p1.total > 0 ? ((p2.total - p1.total) / p1.total) * 100 : 0
    }
  };
}

// Exposer globalement pour compatibilité
window.generateTrendsChart = generateTrendsChart;
window.fetchHistoricalData = fetchHistoricalData;
window.comparePeriods = comparePeriods;

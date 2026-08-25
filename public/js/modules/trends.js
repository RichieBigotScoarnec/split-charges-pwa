// ===== MODULE : GRAPHIQUES DE TENDANCES =====
// Fonctionnalités : visualisation évolution dépenses, comparaison périodes

import { getFirebaseDatabase } from '../firebase-init.js';
import { getState } from '../state.js';
import { formatCurrency, escapeHtml } from '../utils/format.js';
import { formatPeriod } from '../utils/date.js';
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
  fixes: { jeton: '--serie-fixes', repli: '#4F46E5', libelle: 'Charges fixes' },
  variables: { jeton: '--serie-variables', repli: '#C026D3', libelle: 'Charges variables' },
  total: { jeton: '--serie-total', repli: '#059669', libelle: 'Total' }
};

/**
 * Lit un jeton de la page, avec un repli
 *
 * @param {string} nom - Nom de la propriété personnalisée
 * @param {string} defaut - Valeur si le jeton est absent
 * @returns {string}
 */
function jetonCss(nom, defaut) {
  if (typeof getComputedStyle !== 'function') return defaut;
  return getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || defaut;
}

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

  // Aucune annonce : déplier un panneau n'est pas un événement.
  //
  // L'ouverture en produisait deux — « Génération des tendances... » puis
  // « Tendances générées » — pour un calcul local de deux cents millisecondes,
  // dont le résultat est sous les yeux. Elles recouvraient de surcroît la
  // moitié du graphe qu'elles annonçaient.
  const historicalData = await fetchHistoricalData(months);

  if (!historicalData || historicalData.periods.length === 0) {
    toast.warning('Aucune donnée historique disponible');
    return;
  }

  // Un seul mois n'est pas une tendance.
  //
  // Le panneau dessinait alors un graphe d'un seul point, et quatre cartes
  // disant la même chose : moyenne, minimum et maximum tous égaux au total du
  // mois, et une « tendance » de 0,00 € ornée d'une flèche montante et de la
  // couleur d'une hausse. De l'analyse pour de la décoration.
  if (historicalData.periods.length < 2) {
    annoncerUnSeulMois(canvas, historicalData.periods[0]);
    return;
  }

  // Afficher le graphique
  renderTrendsChart(canvas, historicalData);

  // Afficher les statistiques
  renderTrendsStats(historicalData);
}

/**
 * Dit qu'il n'y a pas encore de quoi tracer une tendance
 *
 * Le canevas est masqué plutôt que rempli d'un point : un graphe à une seule
 * valeur n'apprend rien, et laisser croire le contraire vaut moins qu'une
 * phrase.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} periode - Le seul mois connu
 * @returns {void}
 */
function annoncerUnSeulMois(canvas, periode) {
  canvas.hidden = true;

  const stats = document.getElementById('trendsStats');
  if (!stats) return;

  stats.replaceChildren();

  const bloc = document.createElement('p');
  bloc.className = 'empty-state';
  bloc.textContent = periode
    ? `Un seul mois enregistré pour l'instant — ${formatPeriod(periode)}. La tendance apparaîtra dès le deuxième.`
    : 'Pas encore de mois à comparer. La tendance apparaîtra dès le deuxième.';

  stats.appendChild(bloc);
  log('📈 Un seul mois : pas de tendance à tracer');
}

/**
 * Accorde la mémoire du canevas à la finesse réelle de l'écran
 *
 * Sans cela, un canevas de 600 × 240 étiré sur la largeur d'un téléphone est
 * agrandi par le navigateur : sur un appareil à trois pixels par point, la
 * mémoire fournie vaut moins de la moitié de ce qui s'affiche, et le texte
 * dessiné devient mou.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {void}
 */
function ajusterALaFinesse(canvas) {
  const finesse = window.devicePixelRatio || 1;
  const largeur = canvas.clientWidth;
  const hauteur = canvas.clientHeight;

  // Sans mise en page — banc d'essai sans DOM complet, canevas masqué — on
  // laisse les dimensions déclarées : les redéfinir à zéro effacerait tout.
  if (!largeur || !hauteur) return;

  const memoireLargeur = Math.round(largeur * finesse);
  const memoireHauteur = Math.round(hauteur * finesse);

  // Écrire `width` réinitialise le contexte : ne le faire qu'au besoin évite
  // d'effacer le tracé à chaque rendu.
  if (canvas.width !== memoireLargeur || canvas.height !== memoireHauteur) {
    canvas.width = memoireLargeur;
    canvas.height = memoireHauteur;
  }

  // Le tracé continue de raisonner en points CSS.
  canvas.getContext('2d').setTransform(finesse, 0, 0, finesse, 0, 0);
}

/**
 * Dessine le graphique de tendances sur canvas
 * @param {HTMLCanvasElement} canvas - Element canvas
 * @param {Object} data - Données historiques
 */
function renderTrendsChart(canvas, data) {
  // Rendu visible : un mois précédent a pu le masquer.
  canvas.hidden = false;

  const ctx = canvas.getContext('2d');

  // Le canevas se dessine à la finesse de l'écran, et raisonne en points CSS.
  ajusterALaFinesse(canvas);

  const couleurs = {
    fond: jetonCss('--elevated-bg', '#f9f9f9'),
    grille: jetonCss('--border-color', '#e0e0e0'),
    texte: jetonCss('--text-secondary', '#666'),
    axes: jetonCss('--text-primary', '#333')
  };
  const police = jetonCss('--font', 'system-ui, sans-serif');

  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;

  ctx.clearRect(0, 0, width, height);

  const periods = data.periods;
  const totals = periods.map(p => data.data[p].total);
  const fixedTotals = periods.map(p => data.data[p].fixedCharges);
  const variableTotals = periods.map(p => data.data[p].variableCharges);

  const maxValue = Math.max(...totals) * 1.1 || 1;

  // Les marges se déduisent de la place, elles ne sont plus écrites en dur.
  //
  // Elles valaient 40 en haut et 60 en bas. Sur la carte d'un téléphone, le
  // canevas mesurait 125 px de haut : il restait 25 px pour six graduations,
  // qui se chevauchaient au point d'être illisibles. La gauche, elle, se mesure
  // sur le plus large des libellés — « 1 234,56 € » n'occupe pas la place de
  // « 12 € », et la fixer à 80 px gaspille ou rogne selon les montants.
  ctx.font = `12px ${police}`;
  const largeurLibelle = Math.ceil(ctx.measureText(formatCurrency(maxValue)).width);

  const HAUTEUR_LEGENDE = 24;
  const margin = {
    top: 28,
    right: 16,
    bottom: 26 + HAUTEUR_LEGENDE,
    left: Math.min(largeurLibelle + 12, Math.round(width * 0.35))
  };

  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const xStep = chartWidth / (periods.length - 1 || 1);
  const yScale = chartHeight / maxValue;

  // Fond
  ctx.fillStyle = couleurs.fond;
  ctx.fillRect(margin.left, margin.top, chartWidth, chartHeight);

  // Grille et graduations. Leur nombre suit la hauteur : trois graduations sur
  // un graphe court se lisent, six s'y empilent.
  const gridLines = chartHeight >= 160 ? 5 : 3;
  ctx.strokeStyle = couleurs.grille;
  ctx.lineWidth = 1;

  for (let i = 0; i <= gridLines; i++) {
    const y = margin.top + (chartHeight / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + chartWidth, y);
    ctx.stroke();

    ctx.fillStyle = couleurs.texte;
    ctx.font = `12px ${police}`;
    ctx.textAlign = 'right';
    ctx.fillText(formatCurrency(maxValue * (1 - i / gridLines)), margin.left - 8, y + 4);
  }

  // Courbes
  drawLine(ctx, periods, fixedTotals, margin, xStep, yScale, chartHeight, jetonCss(SERIES.fixes.jeton, SERIES.fixes.repli));
  drawLine(ctx, periods, variableTotals, margin, xStep, yScale, chartHeight, jetonCss(SERIES.variables.jeton, SERIES.variables.repli));
  drawLine(ctx, periods, totals, margin, xStep, yScale, chartHeight, jetonCss(SERIES.total.jeton, SERIES.total.repli), 3);

  // Axes
  ctx.strokeStyle = couleurs.axes;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + chartHeight);
  ctx.lineTo(margin.left + chartWidth, margin.top + chartHeight);
  ctx.stroke();

  // Mois, en toutes lettres et abrégés : « 2026-08 » est une clé de stockage,
  // pas une date. Un mois sur deux quand la place manque.
  ctx.fillStyle = couleurs.texte;
  ctx.font = `11px ${police}`;
  ctx.textAlign = 'center';

  const pas = xStep < 46 ? 2 : 1;
  periods.forEach((period, i) => {
    if (i % pas !== 0 && i !== periods.length - 1) return;

    const libelle = moisAbrege(period);
    const demi = ctx.measureText(libelle).width / 2;

    // Le dernier point touche le bord droit du tracé : centré dessus, son
    // libellé débordait du canevas et « août 26 » se lisait « août 2 ». On le
    // ramène dans le cadre plutôt que de le laisser sortir.
    const x = Math.min(Math.max(margin.left + i * xStep, demi + 2), width - demi - 2);

    ctx.fillText(libelle, x, margin.top + chartHeight + 18);
  });

  // Légende, sous le graphe. Elle se dessinait par-dessus lui, sur 150 px de
  // large dans une aire qui en fait 192, et en `#333` écrit en dur : illisible
  // en thème sombre, et posée sur les courbes qu'elle nomme.
  drawLegend(ctx, width, height, police, couleurs.texte);
}

/**
 * Un mois abrégé, tel qu'on le lit — « août 26 »
 *
 * @param {string} periode - Clé AAAA-MM
 * @returns {string}
 */
function moisAbrege(periode) {
  if (typeof periode !== 'string' || !/^\d{4}-\d{2}$/.test(periode)) return periode || '';
  const [annee, mois] = periode.split('-');
  const date = new Date(Number(annee), Number(mois) - 1, 1);
  return `${date.toLocaleDateString('fr-FR', { month: 'short' })} ${annee.slice(2)}`;
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
 * @param {number} lineWidth - Épaisseur de la ligne
 */
function drawLine(ctx, periods, values, margin, xStep, yScale, chartHeight, color, lineWidth = 2) {
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
 * Dessine la légende, sous le graphe
 *
 * Elle se posait à l'intérieur de l'aire de tracé — sur 150 px de large dans
 * une aire qui en fait 192 sur un téléphone — et écrivait ses libellés en
 * `#333` en dur : par-dessus les courbes qu'elle nomme, et invisible en thème
 * sombre.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width - Largeur utile, en points CSS
 * @param {number} height - Hauteur utile, en points CSS
 * @param {string} police - Famille de caractères de la page
 * @param {string} encre - Couleur du texte
 * @returns {void}
 */
function drawLegend(ctx, width, height, police, encre) {
  const entrees = Object.values(SERIES);

  ctx.font = `11px ${police}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const TRAIT = 16;
  const ESPACE = 6;
  const ENTRE = 14;

  // Largeur réelle, pour centrer sans deviner.
  const largeurs = entrees.map(s => TRAIT + ESPACE + ctx.measureText(s.libelle).width);
  const totale = largeurs.reduce((somme, l) => somme + l, 0) + ENTRE * (entrees.length - 1);

  let x = Math.max(4, (width - totale) / 2);
  const y = height - 10;

  entrees.forEach((serie, i) => {
    ctx.strokeStyle = jetonCss(serie.jeton, serie.repli);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + TRAIT, y);
    ctx.stroke();

    ctx.fillStyle = encre;
    ctx.fillText(serie.libelle, x + TRAIT + ESPACE, y);

    x += largeurs[i] + ENTRE;
  });

  ctx.textBaseline = 'alphabetic';
}

/**
 * En deçà d'un centime, une variation n'en est pas une
 *
 * Le test était `trend >= 0` : une tendance exactement nulle prenait donc la
 * flèche montante et la couleur d'une hausse. « ↗ 0,00 € » en rouge, pour une
 * dépense inchangée.
 */
const SEUIL_TENDANCE = 0.01;

/**
 * La classe d'une tendance
 * @param {number} variation - En euros
 * @returns {string}
 */
function classeTendance(variation) {
  if (Math.abs(variation) < SEUIL_TENDANCE) return 'trend-flat';
  return variation > 0 ? 'trend-up' : 'trend-down';
}

/**
 * Une variation en pourcentage, écrite en français
 *
 * `toFixed(1)` rend « 231.2 », avec un point décimal — au milieu d'un écran où
 * tous les montants s'écrivent « 1 259,97 € ».
 *
 * @param {number} variation - En pourcentage
 * @returns {string}
 */
function pourcentageLisible(variation) {
  const signe = variation > 0 ? '+' : '';
  return `${signe}${variation.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })} %`;
}

/**
 * La flèche d'une tendance
 * @param {number} variation - En euros
 * @returns {string}
 */
function flecheTendance(variation) {
  if (Math.abs(variation) < SEUIL_TENDANCE) return '→';
  return variation > 0 ? '↗' : '↘';
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
        <div class="stat-period">${escapeHtml(formatPeriod(periods[totals.indexOf(min)]))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Maximum</div>
        <div class="stat-value">${formatCurrency(max)}</div>
        <div class="stat-period">${escapeHtml(formatPeriod(periods[totals.indexOf(max)]))}</div>
      </div>
      <div class="stat-card ${classeTendance(trend)}">
        <div class="stat-label">Tendance</div>
        <div class="stat-value">${flecheTendance(trend)} ${formatCurrency(Math.abs(trend))}</div>
        <div class="stat-percent">${escapeHtml(pourcentageLisible(trendPercent))}</div>
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


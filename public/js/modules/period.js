/**
 * FairSplit - Period Management Module
 * @description Gestion des périodes (YYYY-MM), dropdown, navigation, chargement données
 */

import { getCurrentPeriod, formatPeriod } from '../utils/date.js';
import { resolveSalaries, normalizeSalaries } from '../utils/salaries.js';
import { setState, getState } from '../state.js';
import { validateAmount } from '../utils/validation.js';
import { LIMITS } from '../config.js';
import { toast } from '../components/toast.js';
import { loadVariableCharges } from './variable-charges.js';
import { loadFixedCharges } from './fixed-charges.js';
import { loadReimbursements } from './reimbursements.js';
import { calculateSummary } from './summary.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { exigerElement } from '../utils/diagnostics.js';
import { parseMontant } from '../utils/montant.js';
import { listePeriodes } from '../utils/periodes.js';
import { ecouterUneFois } from '../utils/ecouteur.js';
import { activerOnglet } from '../utils/onglets.js';

/**
 * Remplit le sélecteur de mois
 *
 * La liste ne se limite plus aux douze derniers mois : elle réunit ce que la
 * base contient, quel que soit son âge. Le sélecteur étant le seul moyen de
 * naviguer — les flèches ne font que s'y déplacer —, un mois de plus d'un an
 * restait sinon en base sans qu'aucun chemin ne puisse l'afficher.
 *
 * @returns {void}
 */
function populatePeriodDropdown() {
  const select = document.getElementById('periodSelect');
  if (!select) return;

  const currentPeriod = getState('currentPeriod');

  const periodes = listePeriodes({
    moisCourant: getCurrentPeriod(),
    // Alimenté par `chargerLesPeriodesConnues`, appelé une fois les données
    // lues. Absent au tout premier rendu : la liste vaut alors les douze mois
    // glissants, c'est-à-dire le comportement d'avant.
    enBase: getState('periodesConnues') || [],
    consultee: currentPeriod
  });

  select.replaceChildren();

  for (const periodStr of periodes) {
    const option = document.createElement('option');
    option.value = periodStr;
    option.textContent = formatPeriod(periodStr);
    if (periodStr === currentPeriod) option.selected = true;
    select.appendChild(option);
  }

  updatePeriodInfo();
}

/**
 * Relève les mois présents en base, pour que le sélecteur les propose
 *
 * Le sélecteur n'a besoin que des NOMS des mois, et le nœud complet pèse
 * toutes les charges de tous les mois. L'API REST de Realtime Database sait
 * d'ailleurs ne rendre que les clés (`?shallow=true`, dont ce dépôt se sert
 * déjà dans `sonde-liaison.js`) — le commentaire qui affirmait le contraire
 * était faux, et justifiait la lecture la plus gratuite de l'application.
 *
 * On ne s'en sert pas pour autant : ce serait un appel HTTP hors de `db.js`,
 * donc sans miroir, sans file d'attente et surtout sans délai de garde —
 * exactement le défaut que `trends.js` porte. La bonne réponse est de ne pas
 * relire du tout : l'initialisation vient de lire ce nœud, elle passe sa
 * valeur.
 *
 * @param {Object} [instantane] - Le nœud `periods` déjà lu dans cette même
 *   séquence d'initialisation. Omis, la fonction lit elle-même : c'est le
 *   comportement historique, et le repli quand l'étape amont a échoué.
 * @returns {Promise<void>}
 */
export async function chargerLesPeriodesConnues(instantane) {
  try {
    let periods = instantane;
    if (periods === undefined) {
      const { dbGet } = await import('../db.js');
      periods = await dbGet('periods');
    }

    const cles = periods && typeof periods === 'object' ? Object.keys(periods) : [];

    // Le mois affiché, toujours.
    //
    // L'instantané est lu AVANT `applyRecurringCharges`, qui peut créer le mois
    // courant en y reconduisant les charges fixes. Une liste bâtie sur le seul
    // instantané perdrait donc ce mois-là — celui qu'on est précisément en
    // train de regarder. L'ajouter est sans risque : un mois affiché est par
    // définition navigable, et c'est ce qu'une relecture aurait rendu.
    const affiche = getState('currentPeriod');
    if (affiche && !cles.includes(affiche)) cles.push(affiche);

    setState('periodesConnues', cles);
    populatePeriodDropdown();
    log(`🗓️ ${cles.length} mois connus en base`);
  } catch (error) {
    // Sans cette liste, le sélecteur retombe sur les douze mois glissants :
    // l'application reste utilisable, seul l'historique ancien s'éloigne.
    warn('⚠️ Liste des mois illisible, sélecteur limité aux douze derniers :', error);
  }
}

/**
 * Update period info badge (current vs archived)
 */
function updatePeriodInfo() {
  const info = document.getElementById('periodInfo');
  if (!info) return;

  const currentPeriod = getState('currentPeriod');
  const actualCurrentPeriod = getCurrentPeriod();

  if (currentPeriod === actualCurrentPeriod) {
    info.innerHTML = '<span class="current-period-badge">✓ Période actuelle</span>';
  } else {
    // « lecture seule » était faux : rien n'empêche de modifier un mois passé,
    // et c'est voulu — corriger une charge oubliée est un besoin normal, et
    // l'instantané de salaires par période rend la correction sûre.
    info.innerHTML = '<span class="period-archived-label">📁 Mois archivé — modifiable</span>';
  }
}

/**
 * Change current period (called when dropdown changes)
 */
export function changePeriod() {
  const select = document.getElementById('periodSelect');
  if (!select) return;

  const newPeriod = select.value;
  setState('currentPeriod', newPeriod);

  updatePeriodInfo();
  loadPeriodData();
}

/**
 * Navigate to next/previous period
 * @param {number} direction - 1 for previous month, -1 for next month
 */
export function navigatePeriod(direction) {
  const select = document.getElementById('periodSelect');
  if (!select) return;

  const currentIndex = select.selectedIndex;
  const newIndex = currentIndex - direction; // Inverse because newer periods are first

  if (newIndex >= 0 && newIndex < select.options.length) {
    select.selectedIndex = newIndex;
    changePeriod();
  }
}

/**
 * Load period data from Firebase
 * Loads both salaries (global) and period-specific data
 */
export async function loadPeriodData({ historique, salairesGlobaux } = {}) {
  // Même repli que saveSalaries : jamais lire sous `periods/undefined`
  const currentPeriod = getState('currentPeriod') || getCurrentPeriod();

  try {
    // 1. Salaires : l'instantané de la période fait foi, à défaut les globaux
    const { dbGet } = await import('../db.js');

    // Un instantané par GESTE.
    //
    // L'initialisation nous en confie un ; un changement de mois, non — et ce
    // geste-là appelait `refreshCarryOver` puis `applyRecurringCharges`, qui
    // relisaient chacune le nœud `periods` entier, à quelques millisecondes
    // d'écart. Mesuré : 2 × 113 Ko par changement de mois à douze mois de
    // données, 2 × 568 Ko à cinq ans.
    //
    // Ce n'est pas de la fraîcheur, c'est un doublon : les deux lectures
    // tombent dans le même geste. On lit donc une fois ici et l'on passe la
    // valeur. Relire à chaque geste reste correct — il a pu s'écouler une
    // heure entre deux changements de mois.
    const [instantane, globalSalaries] = await Promise.all([
      historique === undefined ? dbGet('periods') : Promise.resolve(historique),
      salairesGlobaux === undefined ? dbGet('salaries') : Promise.resolve(salairesGlobaux)
    ]);

    // Le mois affiché est dans l'instantané : ses deux champs s'y lisent, au
    // lieu de deux allers-retours supplémentaires. `?? null` et non `|| null` —
    // un mois présent mais sans instantané de salaires n'est pas un mois absent.
    const moisAffiche = instantane && typeof instantane === 'object'
      ? instantane[currentPeriod] : null;
    const periodSalaries = moisAffiche?.salaries ?? null;
    // Le mode figé du mois, s'il en a un. `computeBalanceChain` le lisait
    // depuis toujours ; l'écran, jamais — et les deux annonçaient alors deux
    // soldes différents pour le même mois reconduit.
    const periodShareMode = moisAffiche?.shareMode ?? null;
    // Et ses pourcentages : ils font partie du mode « custom ».
    const periodPercents = moisAffiche?.customPercents ?? null;

    const { salaries } = resolveSalaries(periodSalaries, globalSalaries);
    setState('salaries', salaries);

    // Rangé sous un nom distinct : `shareMode` reste le réglage du foyer, que
    // l'écran des réglages lit et écrit. Les confondre ferait enregistrer le
    // mode d'un vieux mois comme nouveau réglage global.
    setState('shareModeDuMois', periodShareMode || null);
    setState('customPercentsDuMois', periodPercents || null);

    // Les quatre champs de revenus reprennent l'instantané du mois affiché.
    restoreIncomeFields();

    // Un mois sans revenus complémentaires ne doit pas afficher le bloc replié
    // sur des zéros muets : on l'ouvre s'il porte une valeur.
    revealExtraIncomeIfUsed(salaries);

    // 2. Load period-specific data using individual module loaders
    // This ensures proper object-to-array conversion from Firebase
    await loadVariableCharges();
    await loadFixedCharges();
    await loadReimbursements();

    // Clear search when switching periods
    const searchInput = document.getElementById('searchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const searchResultsInfo = document.getElementById('searchResultsInfo');

    if (searchInput) searchInput.value = '';
    if (searchClearBtn) searchClearBtn.classList.remove('visible');
    if (searchResultsInfo) searchResultsInfo.classList.remove('visible');

    // Le report d'un mois ne dépend que des mois qui le précèdent : il se
    // recalcule au changement de période, pas à chaque charge ajoutée.
    const { refreshCarryOver } = await import('./carry-over.js');
    await refreshCarryOver({ historique: instantane, salairesGlobaux: globalSalaries });

    // Calculate summary (rendering is done by individual loaders)
    calculateSummary();

    // Reconduction des charges récurrentes : silencieuse si le mois n'est pas
    // neuf, et ne s'exécute qu'une fois par mois cible.
    //
    // Elle vient APRÈS les deux lectures ci-dessus, et elle écrit : l'instantané
    // qu'elle reçoit est donc le dernier à pouvoir l'être. Ce qui la suit —
    // `chargerLesPeriodesConnues` — en tient compte.
    const { applyRecurringCharges } = await import('./reconduction.js');
    await applyRecurringCharges({ historique: instantane });

    log(`📅 Période chargée : ${formatPeriod(currentPeriod)}`);

  } catch (error) {
    logError('❌ Erreur chargement données période:', error);
    toast.error('Erreur lors du chargement des données');
  }
}

/**
 * Save salaries (global, not period-specific)
 */
/**
 * Les quatre champs de revenus, saisis dans le même bloc et validés de la
 * même façon. Les décrire une fois évite de répéter quatre fois la même
 * séquence de contrôles — c'est cette répétition, déjà présente pour les deux
 * salaires, qui aurait doublé avec les revenus complémentaires.
 */
const CHAMPS_REVENUS = [
  { id: 'salaireVous', cle: 'vous', libelle: 'votre salaire' },
  { id: 'salaireConjointe', cle: 'conjointe', libelle: 'le salaire conjoint' },
  { id: 'revenusVous', cle: 'extraVous', libelle: 'vos revenus complémentaires' },
  { id: 'revenusConjointe', cle: 'extraConjointe', libelle: 'les revenus complémentaires conjoints' }
];

/**
 * Lit et valide les quatre champs de revenus
 *
 * Un champ vide vaut zéro : ne rien saisir dans « revenus complémentaires »
 * doit laisser le calcul strictement inchangé.
 *
 * @returns {{revenus: Object|null, erreur: string|null}} Les revenus, ou le motif du refus
 */
function readIncomeFields() {
  const revenus = {};

  for (const champ of CHAMPS_REVENUS) {
    const input = document.getElementById(champ.id);
    const brut = (input?.value ?? '').trim();

    if (brut === '') {
      revenus[champ.cle] = 0;
      continue;
    }

    // Un revenu peut légitimement valoir zéro, contrairement à une charge :
    // validateAmount, et non validateChargeAmount.
    const verdict = validateAmount(brut, champ.libelle, LIMITS.MAX_SALARY);
    if (!verdict.valid) {
      return { revenus: null, erreur: verdict.error };
    }

    revenus[champ.cle] = parseMontant(brut);
  }

  return { revenus, erreur: null };
}

/**
 * Réaffiche dans les champs les valeurs connues de l'état
 *
 * Appelé après un refus : l'écran doit revenir à ce qui est réellement
 * enregistré plutôt que de conserver une saisie rejetée.
 */
function restoreIncomeFields() {
  const connus = getState('salaries') || {};
  for (const champ of CHAMPS_REVENUS) {
    const input = document.getElementById(champ.id);
    if (input) input.value = connus[champ.cle] || 0;
  }
}

/**
 * Sauvegarde les revenus de la période affichée
 *
 * Salaires et revenus complémentaires vivent dans le même instantané : ils
 * décrivent le même mois et se lisent d'une seule requête.
 *
 * @returns {Promise<void>}
 */
export async function saveSalaries(cleModifiee = null) {
  const indicator = document.getElementById('salariesSaveIndicator');

  const { revenus, erreur } = readIncomeFields();
  if (erreur) {
    toast.error(erreur);
    restoreIncomeFields();
    return;
  }

  if (indicator) {
    indicator.className = 'save-indicator is-saving';
  }

  try {
    // Repli sur le mois calendaire : l'écran principal s'affiche dès la
    // réussite de l'authentification, avant qu'initPeriod() ait renseigné
    // l'état. Une saisie de salaire dans cet intervalle écrivait sous
    // `periods/undefined/salaries` et était perdue au rechargement.
    const currentPeriod = getState('currentPeriod') || getCurrentPeriod();

    // N'écrire que le champ modifié.
    //
    // L'instantané était réécrit en entier à chaque saisie : si l'un renseigne
    // son salaire pendant que l'autre renseigne le sien, la seconde écriture
    // emportait la première — sans le moindre signe. Une mise à jour partielle
    // ne touche que la clé concernée.
    const aEcrire = cleModifiee
      ? { [cleModifiee]: revenus[cleModifiee] }
      : revenus;

    const { dbUpdate } = await import('../db.js');

    // L'instantané de la période consultée fait toujours foi pour son calcul.
    await dbUpdate(`periods/${currentPeriod}/salaries`, aEcrire);

    // Les revenus globaux ne suivent que si l'on édite le mois en cours :
    // corriger un mois archivé ne doit pas redéfinir la valeur par défaut des
    // mois suivants.
    if (currentPeriod === getCurrentPeriod()) {
      await dbUpdate('salaries', aEcrire);
    }

    setState('salaries', revenus);

    if (indicator) {
      indicator.className = 'save-indicator is-saved';
      setTimeout(() => {
        indicator.className = 'save-indicator';
      }, 2000);
    }

    calculateSummary();

  } catch (error) {
    logError('❌ Erreur sauvegarde salaires:', error);
    if (indicator) indicator.className = 'save-indicator';
    toast.error('Erreur : impossible de sauvegarder les salaires');
  }
}

/**
 * Dote d'un instantané de salaires les périodes qui n'en ont pas
 *
 * Les périodes créées avant l'introduction des instantanés se calculaient avec
 * les salaires globaux courants. Les figer sur cette même valeur ne change
 * donc aucun montant affiché : on gèle l'existant, et l'historique devient
 * exact à partir de maintenant.
 *
 * Idempotente : n'écrit que là où l'instantané manque, donc sans effet dès la
 * deuxième exécution.
 *
 * @param {Object} [options]
 * @param {Object} [options.historique] - Le nœud `periods` déjà lu. Omis, la
 *   fonction lit elle-même. **Les mois complétés y sont reportés** : le
 *   consommateur suivant reçoit un instantané exact plutôt qu'un instantané
 *   d'avant l'écriture.
 * @param {Object} [options.salairesGlobaux] - Le nœud `salaries` déjà lu
 * @returns {Promise<number>} Nombre de périodes complétées
 */
export async function backfillPeriodSalaries({ historique, salairesGlobaux } = {}) {
  try {
    const { dbGet, dbSet } = await import('../db.js');

    const globalSalaries = normalizeSalaries(
      salairesGlobaux === undefined ? await dbGet('salaries') : salairesGlobaux);
    if (!globalSalaries) {
      log('💤 Backfill salaires ignoré : aucun salaire global défini');
      return 0;
    }

    const periods = historique === undefined ? await dbGet('periods') : historique;
    if (!periods || typeof periods !== 'object') return 0;

    const missing = Object.keys(periods).filter(p => !periods[p]?.salaries);
    if (missing.length === 0) return 0;

    for (const period of missing) {
      await dbSet(`periods/${period}/salaries`, globalSalaries);

      // Reporter l'écriture dans l'instantané qu'on nous a confié.
      //
      // Sans ce report, le consommateur suivant — la chaîne de report — verrait
      // ces mois sans instantané de salaires et retomberait sur les salaires
      // globaux, c'est-à-dire sur la valeur qu'on vient précisément d'écrire.
      // Le résultat serait le même au centime près, mais par coïncidence
      // arithmétique et non par construction. On ne fonde pas un calcul
      // d'argent sur une coïncidence.
      if (historique && periods[period]) periods[period].salaries = globalSalaries;
    }

    log(`🧬 Instantané de salaires ajouté à ${missing.length} période(s) : ${missing.join(', ')}`);
    return missing.length;
  } catch (error) {
    // Non bloquant : sans instantané, la période retombe sur les salaires
    // globaux, soit exactement le comportement précédent.
    warn('⚠️ Backfill des salaires par période impossible :', error);
    return 0;
  }
}

/**
 * Ouvre ou referme le bloc des revenus complémentaires
 *
 * Replié par défaut : la plupart des foyers n'ont que des salaires, et deux
 * champs de plus en permanence alourdiraient l'écran pour rien.
 */
export function toggleExtraIncome() {
  const bloc = document.getElementById('extraIncomeFields');
  const bascule = document.getElementById('extraIncomeToggle');
  if (!bloc || !bascule) return;

  const ouvert = !bloc.hidden;
  bloc.hidden = ouvert;
  bascule.setAttribute('aria-expanded', String(!ouvert));
}

/**
 * Déplie le bloc si le mois porte des revenus complémentaires
 *
 * Les laisser cachés reviendrait à faire peser sur le calcul une valeur que
 * rien à l'écran ne montre.
 *
 * @param {Object} salaries - Instantané de revenus du mois
 */
function revealExtraIncomeIfUsed(salaries) {
  const bloc = document.getElementById('extraIncomeFields');
  const bascule = document.getElementById('extraIncomeToggle');
  if (!bloc || !bascule) return;

  if ((salaries.extraVous || 0) > 0 || (salaries.extraConjointe || 0) > 0) {
    bloc.hidden = false;
    bascule.setAttribute('aria-expanded', 'true');
  }
}

/**
 * Amène l'utilisateur au champ des salaires
 *
 * L'état vide du bilan énonçait une condition sans offrir le moyen de la
 * remplir, alors que le bloc Salaires se trouve plus bas dans la page.
 *
 * Depuis le découpage en onglets, ce bouton traverse une frontière : il est
 * affiché dans le bilan, et le champ qu'il vise vit dans les réglages. Sous
 * 900 px ce panneau est en `display: none` — `scrollIntoView` n'a alors rien
 * où aller et `focus()` échoue en silence. Le bouton serait resté visible et
 * inerte, exactement à l'endroit où l'application demande une action.
 *
 * Changer d'onglet **avant** de viser, donc. Au-delà de 900 px l'appel ne
 * fait rien : les trois panneaux sont déjà là.
 */
export function focusSalaries() {
  const input = document.getElementById('salaireVous');
  if (!input) return;

  const panneau = input.closest('.panneau');
  if (panneau) activerOnglet(panneau.id);

  input.closest('section, .card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Le focus après le défilement, sinon le navigateur saute sèchement
  setTimeout(() => input.focus({ preventScroll: true }), 350);
}

/**
 * Initialize period module
 * Sets up event listeners for period dropdown and navigation
 */
export function initPeriod() {
  // Initialize current period in state
  const currentPeriod = getCurrentPeriod();
  setState('currentPeriod', currentPeriod);

  // Les écouteurs d'abord, le remplissage du sélecteur ensuite.
  //
  // L'ordre inverse liait deux pannes qui semblaient distinctes : si
  // `populatePeriodDropdown` lève, l'étape entière est rattrapée par
  // `runStep`, et les champs de revenus n'ont jamais reçu leur écouteur. On
  // observait alors une liste de mois vide *et* des salaires qui ne
  // s'enregistrent pas — deux symptômes, une seule cause. Attacher d'abord
  // rend chaque panne indépendante et bien plus lisible.
  // Le sélecteur de mois n'a PAS d'écouteur direct : il porte
  // `data-on-change="changePeriod"`, et `init.js` s'en charge.
  //
  // Il en avait un, en plus de la délégation. Deux mécanismes indépendants,
  // tous deux actifs : chaque changement de mois exécutait donc `loadPeriodData`
  // DEUX fois — deux lectures de l'historique, deux lectures des salaires, deux
  // chargements de chacune des trois listes, et deux rendus. `ecouterUneFois`
  // ne pouvait rien y voir : il garantit qu'un écouteur n'est posé qu'une fois,
  // pas qu'un geste n'est traité qu'une fois.
  //
  // La délégation est gardée plutôt que l'écouteur : c'est le mécanisme déclaré
  // du dépôt, et `tests/actions-declarees.test.js` le tient au balisage dans les
  // deux sens. L'écouteur direct, lui, n'était vu par rien.
  //
  // `exigerElement` reste : il journalise l'absence du sélecteur, et c'est cette
  // trace qui rend une panne lisible depuis un téléphone.
  exigerElement('periodSelect', 'changer de mois');

  // Les quatre champs de revenus déclenchent la même sauvegarde.
  for (const champ of CHAMPS_REVENUS) {
    const input = exigerElement(champ.id, `enregistrer ${champ.libelle}`);
    // Le champ modifié est transmis : n'écrire que lui évite d'écraser la
    // saisie simultanée de l'autre personne.
    ecouterUneFois(input, 'change', () => saveSalaries(champ.cle));
  }

  const bascule = exigerElement('extraIncomeToggle', 'afficher les revenus complémentaires');
  ecouterUneFois(bascule, 'click', toggleExtraIncome);

  // Populate dropdown
  populatePeriodDropdown();

  // Expose functions globally for onclick handlers (legacy HTML compatibility)
  window.changePeriod = changePeriod;
  window.navigatePeriod = navigatePeriod;
  window.focusSalaries = focusSalaries;

  log('📅 Gestion périodes initialisée');
}

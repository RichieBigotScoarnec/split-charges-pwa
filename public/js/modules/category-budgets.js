// ===== MODULE : BUDGETS PAR CATÉGORIE =====
//
// Le budget mensuel global dit qu'on a trop dépensé, jamais en quoi. Un
// dépassement de 200 € appelle une décision différente selon qu'il vient des
// courses ou des loisirs.
//
// Ce module occupe le panneau « Analyse par Catégorie », présent dans le HTML
// depuis longtemps mais qui n'avait jamais rien affiché : sa cible de rendu
// n'existait pas, son bouton non plus, et aucun appelant.

import { getState, setState } from '../state.js';
import { toast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { formatCurrency } from '../utils/format.js';
import { analyzeCategoriesData } from './categories.js';
import { computeCategoryBudgets, summarizeBudgets } from '../utils/budgets.js';
import { getCategories } from './custom-lists.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { parseMontant } from '../utils/montant.js';

/** Chemin du réglage en base — global : un budget vaut pour tous les mois */
const BUDGETS_PATH = 'categoryBudgets';

/**
 * Initialise les budgets par catégorie
 * @returns {Promise<void>}
 */
export async function initCategoryBudgets() {
  window.showBudgetEditor = showBudgetEditor;
  window.saveCategoryBudgets = saveCategoryBudgets;

  try {
    const { dbGet } = await import('../db.js');
    const budgets = await dbGet(BUDGETS_PATH);
    setState('categoryBudgets', budgets && typeof budgets === 'object' ? budgets : {});
  } catch (error) {
    // Sans budgets lisibles, le panneau montre les dépenses seules.
    warn('⚠️ Budgets par catégorie illisibles :', error);
    setState('categoryBudgets', {});
  }

  log('🎯 Budgets par catégorie initialisés');
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
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Construit la ligne d'une catégorie
 * @param {Object} ligne - Sortie de computeCategoryBudgets
 * @returns {HTMLElement} La ligne prête à insérer
 */
function renderLigne(ligne) {
  // Un bouton, et non une division : la ligne ouvre le détail des dépenses de
  // la catégorie. Le rendre atteignable au clavier et annoncé comme une
  // commande vaut mieux qu'un `role` posé sur un élément qui n'en est pas une.
  const bloc = el('button', `budget-row budget-${ligne.status} budget-row--ouvrable`);
  bloc.type = 'button';
  bloc.dataset.action = 'ouvrirDetailCategorie';
  // Par propriété et non par attribut : un nom de catégorie peut contenir des
  // guillemets, et il ne transite ici par aucune analyse HTML.
  bloc.dataset.arg = ligne.category;

  const entete = el('div', 'budget-row-header');
  entete.appendChild(el('span', 'budget-row-name', ligne.category));

  const chiffres = ligne.budget > 0
    ? `${formatCurrency(ligne.spent)} / ${formatCurrency(ligne.budget)}`
    : formatCurrency(ligne.spent);
  entete.appendChild(el('span', 'budget-row-amounts', chiffres));
  bloc.appendChild(entete);

  if (ligne.budget > 0) {
    const piste = el('div', 'budget-row-track');
    const jauge = el('div', `budget-row-fill budget-${ligne.status}`);
    // La barre s'arrête à 100 % : un dépassement se lit au texte et à la
    // couleur, l'étirer hors du cadre ne dirait rien de plus.
    jauge.style.width = `${Math.min(ligne.percentage, 100)}%`;
    piste.appendChild(jauge);
    bloc.appendChild(piste);

    const etat = ligne.status === 'over'
      ? `Dépassé de ${formatCurrency(Math.abs(ligne.remaining))}`
      : `Reste ${formatCurrency(ligne.remaining)}`;
    bloc.appendChild(el('div', 'budget-row-status', `${Math.round(ligne.percentage)} % — ${etat}`));
  } else {
    bloc.appendChild(el('div', 'budget-row-status', 'Aucun budget défini'));
  }

  return bloc;
}

/**
 * Peint le panneau des budgets pour la période affichée
 *
 * Construit en nœuds DOM : les noms de catégories sont saisis par
 * l'utilisateur, `textContent` écarte la question de l'échappement.
 */
export function renderCategoryBudgets() {
  const panneau = document.getElementById('categoryAnalysis');
  const contenu = document.getElementById('categoryAnalysisContent');
  if (!panneau || !contenu) return;

  const lignes = computeCategoryBudgets(
    analyzeCategoriesData().total,
    getState('categoryBudgets') || {}
  );

  // Rien dépensé, aucun budget : le panneau n'aurait rien à dire.
  if (lignes.length === 0) {
    panneau.hidden = true;
    contenu.replaceChildren();
    return;
  }

  panneau.hidden = false;
  contenu.replaceChildren();

  const resume = summarizeBudgets(lignes);
  if (resume.budgeted > 0) {
    const total = el('div', 'budget-total',
      `${formatCurrency(resume.spent)} dépensés sur ${formatCurrency(resume.budgeted)} budgétés`);
    contenu.appendChild(total);
  }

  lignes.forEach(ligne => contenu.appendChild(renderLigne(ligne)));

  const action = el('button', 'btn btn-secondary btn-block', 'Définir les budgets');
  action.type = 'button';
  action.dataset.action = 'showBudgetEditor';
  contenu.appendChild(action);
}

/**
 * Ouvre l'éditeur de budgets
 *
 * Toutes les catégories connues y figurent, y compris celles sans dépense :
 * définir un budget avant de dépenser est le cas normal.
 */
export function showBudgetEditor() {
  const liste = document.getElementById('budgetEditorList');
  if (!liste) return;

  const budgets = getState('categoryBudgets') || {};
  const depenses = analyzeCategoriesData().total;

  // `getCategories()` rend des objets {id, icon, label} : les mêler à des clés
  // de chaînes produisait une ligne « [object Object] » par catégorie
  // configurée, dont le budget ne pouvait ni se lire ni s'enregistrer — la clé
  // écrite en base étant cette même chaîne. Seul le libellé a cours ici, c'est
  // lui qui indexe dépenses et budgets.
  //
  // Les catégories ayant reçu une dépense hors liste courante ne doivent pas
  // disparaître de l'éditeur : leur budget deviendrait inaccessible.
  const noms = [...new Set([
    ...getCategories().map(c => c.label),
    ...Object.keys(depenses),
    ...Object.keys(budgets)
  ])].sort();

  liste.replaceChildren();

  noms.forEach((nom, index) => {
    const rangee = el('div', 'budget-editor-row');

    const etiquette = el('label', 'budget-editor-label', nom);
    const champId = `budgetInput_${index}`;
    etiquette.setAttribute('for', champId);

    const champ = document.createElement('input');
    champ.type = 'text';
    champ.inputMode = 'decimal';
    champ.id = champId;
    champ.className = 'budget-editor-input';
    champ.placeholder = '0';
    champ.value = budgets[nom] > 0 ? String(budgets[nom]) : '';
    // Le nom transite par une propriété, jamais par l'identifiant : une
    // catégorie peut contenir espaces, accents ou caractères spéciaux.
    champ.dataset.category = nom;

    rangee.append(etiquette, champ);
    liste.appendChild(rangee);
  });

  showModal('modalBudgets');
}

/**
 * Enregistre les budgets saisis
 *
 * Un champ vide ou nul retire le budget de la catégorie plutôt que d'y
 * enregistrer zéro : « pas de budget » et « budget de zéro » ne se disent pas
 * de la même façon à l'écran.
 *
 * @returns {Promise<void>}
 */
export async function saveCategoryBudgets() {
  const liste = document.getElementById('budgetEditorList');
  if (!liste) return;

  const budgets = {};

  for (const champ of liste.querySelectorAll('.budget-editor-input')) {
    const brut = champ.value.trim();
    if (brut === '') continue;

    const valeur = parseMontant(brut);
    if (isNaN(valeur) || valeur < 0) {
      toast.error(`Montant invalide pour « ${champ.dataset.category} »`);
      return;
    }
    if (valeur > 0) budgets[champ.dataset.category] = valeur;
  }

  try {
    const { dbSet } = await import('../db.js');
    await dbSet(BUDGETS_PATH, budgets);
    setState('categoryBudgets', budgets);

    renderCategoryBudgets();
    closeModal('modalBudgets', false);
    toast.success('Budgets enregistrés');
  } catch (error) {
    logError('❌ Erreur enregistrement des budgets :', error);
    toast.error('Enregistrement impossible');
  }
}

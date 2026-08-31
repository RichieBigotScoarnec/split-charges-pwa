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
import { budgetsProposes, ordonnerCategories } from '../utils/budget-propose.js';

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

  // Ce que chaque catégorie coûte un mois ordinaire, sur l'historique déjà
  // porté par l'état — aucune lecture supplémentaire. Vide tant que deux mois
  // révolus ne sont pas là : une proposition tirée d'un seul mois serait un
  // chiffre pris au hasard présenté comme un conseil.
  // `currentPeriod` — le mois AFFICHÉ — et non le mois réel : c'est celui
  // qu'on budgète, et l'assiette est donc tout ce qui le précède. Sans
  // historique conservé, la fonction rend un objet vide et l'éditeur retombe
  // sur son comportement d'avant, en un peu mieux rangé.
  const proposes = budgetsProposes(getState('historiquePourLeRapport'), getState('currentPeriod'));

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
  ])];

  // Dix-neuf catégories par ordre alphabétique, dont sept seulement portaient
  // une dépense : il fallait lire « Autre, Bar, Boulangerie, Bricolage… »
  // avant d'atteindre « Courses ». Celles dont l'application n'a rien à dire
  // passent derrière un dépliant — sans disparaître, faute de quoi on ne
  // pourrait plus leur fixer de budget du tout.
  const { utilisees, dormantes } = ordonnerCategories(noms, depenses, proposes, budgets);

  liste.replaceChildren();

  let index = 0;
  const rangee = (nom) => construireRangee(nom, index++, budgets, depenses, proposes);

  for (const nom of utilisees) liste.appendChild(rangee(nom));

  if (dormantes.length > 0) {
    const repli = document.createElement('details');
    repli.className = 'budget-editor-repli';

    const titre = document.createElement('summary');
    titre.textContent = dormantes.length > 1
      ? `${dormantes.length} autres catégories`
      : '1 autre catégorie';
    repli.appendChild(titre);

    for (const nom of dormantes) repli.appendChild(rangee(nom));
    liste.appendChild(repli);
  }

  showModal('modalBudgets');
}

/**
 * Une ligne de l'éditeur : le libellé, ce qu'il coûte d'ordinaire, le champ
 *
 * La proposition est un `placeholder`, jamais une `value` : un champ prérempli
 * s'enregistrerait sans qu'on l'ait voulu, et fixerait dix-neuf budgets d'un
 * clic sur « Enregistrer ». Le foyer voit le chiffre, le recopie s'il lui
 * convient — ou tape le sien. L'application propose, elle ne décide pas.
 *
 * @param {string} nom - Libellé de la catégorie, tel qu'il indexe la base
 * @param {number} index - Rang, pour l'identifiant du champ
 * @param {Object} budgets - Budgets déjà fixés
 * @param {Object} depenses - Dépense du mois affiché
 * @param {Object} proposes - Médiane par catégorie
 * @returns {HTMLElement}
 */
function construireRangee(nom, index, budgets, depenses, proposes) {
  const rangee = el('div', 'budget-editor-row');

  const bloc = el('div', 'budget-editor-libelle');
  const etiquette = el('label', 'budget-editor-label', nom);
  const champId = `budgetInput_${index}`;
  etiquette.setAttribute('for', champId);
  bloc.appendChild(etiquette);

  // « vous dépensez environ 310 € par mois » : le chiffre qui manquait pour
  // décider. Sans lui, le champ demandait d'inventer un nombre — et un nombre
  // à inventer se remet à plus tard, indéfiniment.
  if (proposes[nom] > 0) {
    bloc.appendChild(el(
      'span', 'budget-editor-indice',
      `environ ${formatCurrency(proposes[nom])} par mois`
    ));
  } else if (depenses[nom] > 0) {
    bloc.appendChild(el(
      'span', 'budget-editor-indice',
      `${formatCurrency(depenses[nom])} ce mois-ci`
    ));
  }

  const champ = document.createElement('input');
  champ.type = 'text';
  champ.inputMode = 'decimal';
  champ.id = champId;
  champ.className = 'budget-editor-input';
  champ.placeholder = proposes[nom] > 0 ? String(proposes[nom]) : '0';
  champ.value = budgets[nom] > 0 ? String(budgets[nom]) : '';
  // Le nom transite par une propriété, jamais par l'identifiant : une
  // catégorie peut contenir espaces, accents ou caractères spéciaux.
  champ.dataset.category = nom;

  rangee.append(bloc, champ);
  return rangee;
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

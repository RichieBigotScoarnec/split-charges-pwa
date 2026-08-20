// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategories: vi.fn(() => ['Courses', 'Loisirs'])
}));

const { renderCategoryBudgets, showBudgetEditor } = await import('../../public/js/modules/category-budgets.js');
const { setState, resetState } = await import('../../public/js/state.js');

/**
 * Les noms de catégories sont saisis par l'utilisateur et rendus dans le
 * panneau comme dans l'éditeur. Le rendu construit des nœuds DOM plutôt que
 * des chaînes HTML ; ces tests verrouillent ce choix, qui est la raison pour
 * laquelle aucun échappement n'est nécessaire.
 */
const HOSTILE = '<img src=x onerror=alert(1)>';

beforeEach(() => {
  resetState();
  document.body.innerHTML = `
    <div id="categoryAnalysis" hidden>
      <div id="categoryAnalysisContent"></div>
    </div>
    <div id="budgetEditorList"></div>
  `;
});

describe('Rendu du panneau des budgets', () => {
  it('reste masqué sans dépense ni budget', () => {
    setState('variableCharges', []);
    setState('fixedCharges', []);
    setState('categoryBudgets', {});

    renderCategoryBudgets();

    expect(document.getElementById('categoryAnalysis').hidden).toBe(true);
  });

  it('apparaît dès qu\'une catégorie a quelque chose à dire', () => {
    setState('variableCharges', [{ id: 'v1', category: 'Courses', amount: 80, paidBy: 'vous' }]);
    setState('fixedCharges', []);
    setState('categoryBudgets', {});

    renderCategoryBudgets();

    expect(document.getElementById('categoryAnalysis').hidden).toBe(false);
    expect(document.getElementById('categoryAnalysisContent').textContent).toContain('Courses');
  });

  it('un nom de catégorie hostile est du texte, jamais un élément', () => {
    setState('variableCharges', [{ id: 'v1', category: HOSTILE, amount: 50, paidBy: 'vous' }]);
    setState('fixedCharges', []);
    setState('categoryBudgets', {});

    renderCategoryBudgets();

    const contenu = document.getElementById('categoryAnalysisContent');
    expect(contenu.textContent).toContain(HOSTILE);
    expect(contenu.querySelectorAll('img')).toHaveLength(0);
  });

  it('la barre s\'arrête à 100 % même largement dépassée', () => {
    // L'étirer hors du cadre ne dirait rien de plus que la couleur et le texte.
    setState('variableCharges', [{ id: 'v1', category: 'Courses', amount: 4000, paidBy: 'vous' }]);
    setState('fixedCharges', []);
    setState('categoryBudgets', { Courses: 400 });

    renderCategoryBudgets();

    expect(document.querySelector('.budget-row-fill').style.width).toBe('100%');
    expect(document.querySelector('.budget-row.budget-over')).not.toBeNull();
  });
});

describe('Éditeur de budgets', () => {
  it('propose toutes les catégories connues, même sans dépense', () => {
    // Définir un budget avant de dépenser est le cas normal.
    setState('variableCharges', []);
    setState('fixedCharges', []);
    setState('categoryBudgets', {});

    showBudgetEditor();

    const noms = [...document.querySelectorAll('.budget-editor-input')].map(i => i.dataset.category);
    expect(noms).toEqual(['Courses', 'Loisirs']);
  });

  it('n\'oublie pas une catégorie budgétée absente de la liste courante', () => {
    // Sinon son budget deviendrait inaccessible après renommage de la liste.
    setState('variableCharges', []);
    setState('fixedCharges', []);
    setState('categoryBudgets', { Vacances: 500 });

    showBudgetEditor();

    const noms = [...document.querySelectorAll('.budget-editor-input')].map(i => i.dataset.category);
    expect(noms).toContain('Vacances');
  });

  it('le nom transite par une propriété, jamais par l\'identifiant', () => {
    // Une catégorie peut contenir espaces, accents ou caractères spéciaux :
    // les glisser dans un id produirait des sélecteurs invalides.
    setState('variableCharges', [{ id: 'v1', category: 'Frais de garde', amount: 10, paidBy: 'vous' }]);
    setState('fixedCharges', []);
    setState('categoryBudgets', {});

    showBudgetEditor();

    const champ = document.querySelector('.budget-editor-input[data-category="Frais de garde"]');
    expect(champ).not.toBeNull();
    expect(champ.id).toMatch(/^budgetInput_\d+$/);
  });

  it('reprend les budgets déjà définis', () => {
    setState('variableCharges', []);
    setState('fixedCharges', []);
    setState('categoryBudgets', { Courses: 400 });

    showBudgetEditor();

    const champ = document.querySelector('.budget-editor-input[data-category="Courses"]');
    expect(champ.value).toBe('400');
    expect(document.querySelector('.budget-editor-input[data-category="Loisirs"]').value).toBe('');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { REIMBURSEMENT_DIRECTIONS } from '../../public/js/config.js';

/**
 * Les prénoms des membres viennent de la base et traversaient six rendus en
 * `innerHTML` sans passer par escapeHtml : `memberLabel()` renvoie une chaîne
 * libre, écrite telle quelle par members.js. Un prénom porteur de balisage
 * était donc injecté comme balisage. La politique de sécurité de contenu
 * empêchait l'exécution d'un script, mais elle est la dernière ligne, pas la
 * première.
 *
 * Ces tests verrouillent l'échappement à chaque point d'injection. Ils
 * n'affirment rien sur la CSP : ils vérifient qu'aucun nœud n'est créé.
 */

vi.mock('../../public/js/db.js', () => ({
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  dbPush: vi.fn(() => Promise.resolve('cle')),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(),
  closeModal: vi.fn(),
  showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/summary.js', () => ({
  calculateSummary: vi.fn(() => ({ balance: 0 }))
}));
vi.mock('../../public/js/modules/trash.js', () => ({ refreshTrashButton: vi.fn() }));
vi.mock('../../public/js/modules/map.js', () => ({ refreshMapButton: vi.fn() }));
vi.mock('../../public/js/modules/trends.js', () => ({ invalidateTrends: vi.fn() }));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategoryIcon: vi.fn(() => '🛒'),
  populateCategorySelect: vi.fn(),
  populateDestinationSelect: vi.fn()
}));

const { renderVariableCharges } = await import('../../public/js/modules/variable-charges.js');
const { renderFixedCharges } = await import('../../public/js/modules/fixed-charges.js');
const { renderReimbursements } = await import('../../public/js/modules/reimbursements.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** Prénom hostile, dans la limite des 30 caractères acceptés à la saisie */
const PRENOM_HOSTILE = '<img src=x onerror=alert(1)>';

beforeEach(() => {
  resetState();
  document.body.innerHTML = `
    <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
    <div id="fixedChargesList"></div><span id="fixedChargesTotal"></span>
    <div id="reimbursementsList"></div><span id="reimbursementsTotal"></span>
  `;
  setState('members', { vous: PRENOM_HOSTILE, conjointe: 'Cindy' });
});

describe('Prénom porteur de balisage', () => {
  it('n\'injecte aucun nœud dans la liste des charges variables', () => {
    setState('variableCharges', [
      { id: 'c1', description: 'Courses', amount: 42, category: 'Courses', paidBy: 'vous' }
    ]);

    renderVariableCharges();

    const liste = document.getElementById('variableChargesList');
    expect(liste.querySelector('img')).toBeNull();
    expect(liste.textContent).toContain(PRENOM_HOSTILE);
  });

  it('n\'injecte aucun nœud dans la liste des charges fixes', () => {
    setState('fixedCharges', [
      { id: 'f1', description: 'Loyer', amount: 800, category: 'Maison', paidBy: 'vous' }
    ]);

    renderFixedCharges();

    const liste = document.getElementById('fixedChargesList');
    expect(liste.querySelector('img')).toBeNull();
    expect(liste.textContent).toContain(PRENOM_HOSTILE);
  });

  it('n\'injecte aucun nœud dans la liste des remboursements', () => {
    setState('reimbursements', [
      { id: 'r1', amount: 100, direction: REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER }
    ]);

    renderReimbursements();

    const liste = document.getElementById('reimbursementsList');
    expect(liste.querySelector('img')).toBeNull();
    expect(liste.textContent).toContain(PRENOM_HOSTILE);
  });
});

describe('Description porteuse de guillemets', () => {
  it('ne pose aucun attribut sur les boutons d\'action', () => {
    setState('variableCharges', [
      {
        id: 'c1',
        description: 'x" onfocus=alert(1) autofocus="',
        amount: 10,
        category: 'Courses',
        paidBy: 'vous'
      }
    ]);

    renderVariableCharges();

    const boutons = document.querySelectorAll('#variableChargesList .btn-icon');
    expect(boutons.length).toBe(2);
    for (const bouton of boutons) {
      expect(bouton.hasAttribute('onfocus')).toBe(false);
      expect(bouton.hasAttribute('autofocus')).toBe(false);
    }
  });
});

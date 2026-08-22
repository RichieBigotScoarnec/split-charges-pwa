// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * L'annulation après suppression
 *
 * Les trois chemins de suppression proposaient un retour en arrière :
 * `toast.success('Charge supprimée', { undo: … })`. Le composant, lui, lit
 * `onUndo`. Le rappel n'était donc jamais câblé, aucun bouton « Annuler »
 * n'apparaissait, et la fonctionnalité n'existait que dans le code qui
 * l'appelait.
 *
 * Renommer la clé ne protège de rien : c'est le contrat entre l'appelant et le
 * composant qui avait divergé, silencieusement, des deux côtés à la fois. Ces
 * tests le tiennent aux deux bouts — ce que les appelants passent, et ce que le
 * composant en fait.
 */

const dbUpdate = vi.fn(() => Promise.resolve());

vi.mock('../../public/js/db.js', () => ({
  dbUpdate,
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
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
vi.mock('../../public/js/modules/summary.js', () => ({ calculateSummary: vi.fn() }));
vi.mock('../../public/js/modules/trash.js', () => ({ refreshTrashButton: vi.fn() }));
vi.mock('../../public/js/modules/map.js', () => ({ refreshMapButton: vi.fn() }));
vi.mock('../../public/js/modules/trends.js', () => ({ invalidateTrends: vi.fn() }));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategoryIcon: vi.fn(() => '🛒'),
  populateCategorySelect: vi.fn(),
  populateDestinationSelect: vi.fn()
}));

const { deleteVariableCharge } = await import('../../public/js/modules/variable-charges.js');
const { deleteFixedCharge } = await import('../../public/js/modules/fixed-charges.js');
const { deleteReimbursement } = await import('../../public/js/modules/reimbursements.js');
const { setState, resetState } = await import('../../public/js/state.js');
const { toast } = await import('../../public/js/components/toast.js');

/** Options passées au dernier toast de succès */
const optionsDuToast = () => toast.success.mock.calls.at(-1)[1];

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  document.body.innerHTML = `
    <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
    <div id="fixedChargesList"></div><span id="fixedChargesTotal"></span>
    <div id="reimbursementsList"></div><span id="reimbursementsTotal"></span>
  `;
  setState('currentPeriod', '2026-08');
});

describe('Chaque suppression propose de revenir en arrière', () => {
  it('une charge variable supprimée peut être rétablie', async () => {
    setState('variableCharges', [
      { id: 'c1', description: 'Courses', amount: 42, category: 'Courses', paidBy: 'vous' }
    ]);

    await deleteVariableCharge('c1');

    // La clé attendue par le composant, et aucune autre.
    expect(optionsDuToast()).toHaveProperty('onUndo');
    expect(optionsDuToast().undo).toBeUndefined();

    dbUpdate.mockClear();
    await optionsDuToast().onUndo();

    expect(dbUpdate).toHaveBeenCalledWith(
      'periods/2026-08/variableCharges/c1',
      { deleted: false }
    );
  });

  it('une charge fixe supprimée peut être rétablie', async () => {
    setState('fixedCharges', [
      { id: 'f1', description: 'Loyer', amount: 800, category: 'Maison', paidBy: 'vous' }
    ]);

    await deleteFixedCharge('f1');

    expect(optionsDuToast()).toHaveProperty('onUndo');

    dbUpdate.mockClear();
    await optionsDuToast().onUndo();

    expect(dbUpdate).toHaveBeenCalledWith(
      'periods/2026-08/fixedCharges/f1',
      { deleted: false }
    );
  });

  it('un remboursement supprimé peut être rétabli', async () => {
    setState('reimbursements', [
      { id: 'r1', amount: 120, direction: 'vous-to-conjointe' }
    ]);

    await deleteReimbursement('r1');

    expect(optionsDuToast()).toHaveProperty('onUndo');

    dbUpdate.mockClear();
    await optionsDuToast().onUndo();

    expect(dbUpdate).toHaveBeenCalledWith(
      'periods/2026-08/reimbursements/r1',
      { deleted: false }
    );
  });
});

describe('Le composant honore le contrat', () => {
  it('un toast porteur d\'un rappel affiche un bouton qui l\'appelle', async () => {
    // L'autre bout du contrat : sans ce test, renommer la clé dans le
    // composant casserait les trois appelants sans que rien ne le dise.
    vi.resetModules();
    vi.doUnmock('../../public/js/components/toast.js');
    const { toast: vrai } = await import('../../public/js/components/toast.js');

    document.body.innerHTML = '';
    const rappel = vi.fn();
    vrai.success('Charge supprimée', { onUndo: rappel });

    const bouton = document.querySelector('#toast-container button');
    expect(bouton, 'aucun bouton d\'annulation rendu').not.toBeNull();
    expect(bouton.textContent).toBe('Annuler');

    bouton.click();
    expect(rappel).toHaveBeenCalled();
  });
});

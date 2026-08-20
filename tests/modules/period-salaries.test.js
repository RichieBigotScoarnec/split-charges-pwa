// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/db.js', () => ({
  dbSet: vi.fn(() => Promise.resolve()),
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbPush: vi.fn(() => Promise.resolve('mock-key')),
  dbUpdate: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/modules/summary.js', () => ({
  calculateSummary: vi.fn()
}));
vi.mock('../../public/js/modules/variable-charges.js', () => ({
  loadVariableCharges: vi.fn(() => Promise.resolve()),
  initVariableCharges: vi.fn()
}));
vi.mock('../../public/js/modules/fixed-charges.js', () => ({
  loadFixedCharges: vi.fn(() => Promise.resolve()),
  initFixedCharges: vi.fn()
}));
vi.mock('../../public/js/modules/reimbursements.js', () => ({
  loadReimbursements: vi.fn(() => Promise.resolve()),
  initReimbursements: vi.fn()
}));
vi.mock('../../public/js/modules/reconduction.js', () => ({
  applyRecurringCharges: vi.fn(() => Promise.resolve(0))
}));
vi.mock('../../public/js/utils/date.js', () => ({
  getCurrentPeriod: vi.fn(() => '2026-03'),
  formatPeriod: vi.fn(p => p),
  formatDate: vi.fn(() => '01/01/2026')
}));

import { getState, setState, resetState } from '../../public/js/state.js';
import { saveSalaries } from '../../public/js/modules/period.js';
import { toast } from '../../public/js/components/toast.js';
import { dbSet } from '../../public/js/db.js';

function setupDOM(vousValue = '3000', conjointeValue = '2000') {
  document.body.innerHTML = `
    <input id="salaireVous" value="${vousValue}" />
    <input id="salaireConjointe" value="${conjointeValue}" />
    <span id="salariesSaveIndicator"></span>
  `;
}

beforeEach(() => {
  resetState();
  setState('currentPeriod', '2026-03');
  vi.clearAllMocks();
});

// ===== Cas valides =====
describe('saveSalaries — valeurs valides', () => {
  it('salaires valides → state.salaries mis à jour', async () => {
    setupDOM('3000', '2000');
    await saveSalaries();
    const sal = getState('salaries');
    expect(sal.vous).toBe(3000);
    expect(sal.conjointe).toBe(2000);
  });

  it('valeurs décimales acceptées', async () => {
    setupDOM('2500.50', '1800.75');
    await saveSalaries();
    const sal = getState('salaries');
    expect(sal.vous).toBeCloseTo(2500.50);
    expect(sal.conjointe).toBeCloseTo(1800.75);
  });

  it('valeur vide → interprétée comme 0', async () => {
    setupDOM('', '2000');
    await saveSalaries();
    const sal = getState('salaries');
    expect(sal.vous).toBe(0);
    expect(sal.conjointe).toBe(2000);
  });

  it('valeurs vides → {vous: 0, conjointe: 0}', async () => {
    setupDOM('', '');
    await saveSalaries();
    const sal = getState('salaries');
    expect(sal.vous).toBe(0);
    expect(sal.conjointe).toBe(0);
  });

  it('limite exacte 100000 → acceptée, pas d\'erreur', async () => {
    setupDOM('100000', '100000');
    await saveSalaries();
    expect(toast.error).not.toHaveBeenCalled();
    const sal = getState('salaries');
    expect(sal.vous).toBe(100000);
    expect(sal.conjointe).toBe(100000);
  });

  it('valides → dbSet appelé', async () => {
    setupDOM('2000', '3000');
    await saveSalaries();

    // L'instantané porte désormais les quatre champs de revenus. Les champs
    // complémentaires, absents du DOM de ce test, valent zéro — ce qui vérifie
    // qu'un écran sans ces champs continue d'enregistrer correctement.
    const attendu = { vous: 2000, conjointe: 3000, extraVous: 0, extraConjointe: 0 };
    expect(dbSet).toHaveBeenCalledWith('salaries', attendu);
    expect(dbSet).toHaveBeenCalledWith('periods/2026-03/salaries', attendu);
  });

  it('valides → pas de toast.error', async () => {
    setupDOM('2000', '1500');
    await saveSalaries();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

// ===== Valeurs invalides (texte) =====
describe('saveSalaries — valeur texte invalide', () => {
  it('texte invalide pour vous → toast.error', async () => {
    setupDOM('abc', '2000');
    await saveSalaries();
    expect(toast.error).toHaveBeenCalled();
  });

  it('texte invalide pour conjointe → toast.error', async () => {
    setupDOM('2000', 'xyz');
    await saveSalaries();
    expect(toast.error).toHaveBeenCalled();
  });

  it('texte invalide → state.salaries non mis à jour', async () => {
    setState('salaries', { vous: 1000, conjointe: 500 });
    setupDOM('abc', '2000');
    await saveSalaries();
    expect(getState('salaries').vous).toBe(1000); // inchangé
  });

  it('texte invalide → dbSet non appelé', async () => {
    setupDOM('abc', '2000');
    await saveSalaries();
    expect(dbSet).not.toHaveBeenCalled();
  });
});

// ===== Valeurs négatives =====
describe('saveSalaries — valeurs négatives', () => {
  it('vous négatif → toast.error', async () => {
    setupDOM('-100', '2000');
    await saveSalaries();
    expect(toast.error).toHaveBeenCalled();
  });

  it('conjointe négative → toast.error', async () => {
    setupDOM('2000', '-500');
    await saveSalaries();
    expect(toast.error).toHaveBeenCalled();
  });

  it('valeur négative → dbSet non appelé', async () => {
    setupDOM('-100', '2000');
    await saveSalaries();
    expect(dbSet).not.toHaveBeenCalled();
  });
});

// ===== Valeurs dépassant le maximum =====
describe('saveSalaries — dépassement max (100 000€)', () => {
  it('vous > 100000 → toast.error', async () => {
    setupDOM('150000', '2000');
    await saveSalaries();
    expect(toast.error).toHaveBeenCalled();
  });

  it('conjointe > 100000 → toast.error', async () => {
    setupDOM('2000', '200000');
    await saveSalaries();
    expect(toast.error).toHaveBeenCalled();
  });

  it('dépassement → dbSet non appelé', async () => {
    setupDOM('999999', '2000');
    await saveSalaries();
    expect(dbSet).not.toHaveBeenCalled();
  });
});

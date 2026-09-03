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
import { dbUpdate } from '../../public/js/db.js';
import { calculateSummary } from '../../public/js/modules/summary.js';

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

  it('sans champ précisé, les quatre valeurs sont écrites', async () => {
    setupDOM('2000', '3000');
    await saveSalaries();

    // L'instantané porte les quatre champs de revenus. Les champs
    // complémentaires, absents du DOM de ce test, valent zéro — ce qui vérifie
    // qu'un écran sans ces champs continue d'enregistrer correctement.
    const attendu = { vous: 2000, conjointe: 3000, extraVous: 0, extraConjointe: 0 };
    expect(dbUpdate).toHaveBeenCalledWith('salaries', attendu);
    expect(dbUpdate).toHaveBeenCalledWith('periods/2026-03/salaries', attendu);
  });

  it("un seul champ modifié n'écrit que celui-là", async () => {
    // L'instantané était réécrit en entier : si l'un renseigne son salaire
    // pendant que l'autre renseigne le sien, la seconde écriture emportait la
    // première, sans le moindre signe.
    setupDOM('2000', '3000');
    await saveSalaries('vous');

    expect(dbUpdate).toHaveBeenCalledWith('periods/2026-03/salaries', { vous: 2000 });
    expect(dbUpdate).not.toHaveBeenCalledWith(
      'periods/2026-03/salaries',
      expect.objectContaining({ conjointe: expect.anything() })
    );
  });

  it("modifier le salaire de l'un ne touche pas celui de l'autre", async () => {
    setupDOM('2000', '3000');
    await saveSalaries('conjointe');

    const ecritures = dbUpdate.mock.calls.map(([, valeur]) => valeur);
    for (const e of ecritures) {
      expect(Object.keys(e)).toEqual(['conjointe']);
    }
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
    expect(dbUpdate).not.toHaveBeenCalled();
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
    expect(dbUpdate).not.toHaveBeenCalled();
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
    expect(dbUpdate).not.toHaveBeenCalled();
  });
});

// ===== L'écart qu'une correction rétroactive laisse sur place =====
//
// Corriger le salaire d'un mois archivé est sûr par construction, et ces
// contrôles-là existent déjà plus haut : l'instantané du mois fait foi, et les
// revenus globaux ne suivent que sur le mois courant.
//
// Reste le cas où le geste laisse quelque chose derrière lui : report
// désactivé, le solde du mois corrigé se déplace et ne rejoindra rien. Ce qui
// est vérifié ici, c'est le CÂBLAGE — que `saveSalaries` relève bien le solde
// AVANT l'écriture et le compare à celui d'après. La règle elle-même est fixée
// par `tests/utils/correction-retroactive.test.js`.
describe('saveSalaries — corriger un mois archivé', () => {
  /**
   * Fait bouger le solde au recalcul.
   *
   * `calculateSummary` est bouchonné dans cette suite ; sans cette
   * implémentation, `dernierSolde` ne changerait jamais et le contrôle
   * passerait pour la mauvaise raison.
   */
  function leSoldeDevient(valeur) {
    calculateSummary.mockImplementation(() => setState('dernierSolde', valeur));
  }

  beforeEach(() => {
    // Le mois courant est mars ; on corrige février, un mois passé.
    setState('currentPeriod', '2026-02');
    setState('dernierSolde', 0);
    setState('carryOverEnabled', false);
  });

  it('le mois cesse d\'être soldé : la phrase le dit', async () => {
    leSoldeDevient(42.17);
    setupDOM('3000', '2000');

    await saveSalaries();

    expect(toast.info).toHaveBeenCalledTimes(1);
    const dit = toast.info.mock.calls[0][0];
    expect(dit).toContain('2026-02');
    expect(dit).toContain('42,17');
  });

  it('report activé : rien n\'est dit, la chaîne porte l\'écart', async () => {
    setState('carryOverEnabled', true);
    leSoldeDevient(42.17);
    setupDOM('3000', '2000');

    await saveSalaries();

    expect(toast.info).not.toHaveBeenCalled();
  });

  it('le mois courant : rien n\'est dit, c\'est la saisie ordinaire', async () => {
    setState('currentPeriod', '2026-03');
    leSoldeDevient(42.17);
    setupDOM('3000', '2000');

    await saveSalaries();

    expect(toast.info).not.toHaveBeenCalled();
  });

  it('le solde relevé est celui d\'AVANT l\'écriture', async () => {
    // Le mutant qui relève `soldeAvant` après `calculateSummary` compare un
    // chiffre à lui-même : plus rien ne bouge jamais, et la phrase disparaît
    // sans que rien ne le signale.
    setState('dernierSolde', 300);
    leSoldeDevient(340);
    setupDOM('3000', '2000');

    await saveSalaries();

    const dit = toast.info.mock.calls[0][0];
    expect(dit).toContain('300,00');
    expect(dit).toContain('340,00');
  });

  it('l\'écriture reste faite, quoi qu\'annonce la phrase', async () => {
    // La correction est légitime : on la signale, on ne l'empêche pas.
    leSoldeDevient(42.17);
    setupDOM('3000', '2000');

    await saveSalaries();

    expect(dbUpdate).toHaveBeenCalledWith('periods/2026-02/salaries', expect.anything());
  });
});

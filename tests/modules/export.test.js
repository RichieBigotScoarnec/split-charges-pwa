// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));

// Capturer le contenu CSV généré en espionnant le constructeur Blob
let capturedCSV = '';
global.Blob = class MockBlob {
  constructor(parts) {
    capturedCSV = parts.join('');
  }
};
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

import { getState, setState, resetState } from '../../public/js/state.js';
import { exportToCSV } from '../../public/js/modules/export.js';
import { toast } from '../../public/js/components/toast.js';

beforeEach(() => {
  resetState();
  capturedCSV = '';
  vi.clearAllMocks();
  // DOM minimal pour que exportToCSV puisse appeler link.click()
  document.body.innerHTML = '<div id="app"></div>';
});

// ===== Garde-fous =====
describe('exportToCSV — garde-fous', () => {
  it('sans currentPeriod → toast.error, pas de CSV', () => {
    exportToCSV();
    expect(toast.error).toHaveBeenCalled();
    expect(capturedCSV).toBe('');
  });
});

// ===== Contenu CSV — en-tête =====
describe('exportToCSV — en-tête CSV', () => {
  beforeEach(() => {
    setState('currentPeriod', '2026-03');
    setState('salaries', { vous: 3000, conjointe: 2000 });
  });

  it('contient le titre FairSplit', () => {
    exportToCSV();
    expect(capturedCSV).toContain('FAIRSPLIT');
  });

  it('contient la période', () => {
    exportToCSV();
    expect(capturedCSV).toContain('2026-03');
  });

  it('contient la section salaires', () => {
    exportToCSV();
    expect(capturedCSV).toContain('SALAIRES');
  });

  it('contient les valeurs de salaire', () => {
    exportToCSV();
    expect(capturedCSV).toContain('3000');
    expect(capturedCSV).toContain('2000');
  });
});

// ===== Contenu CSV — charges =====
describe('exportToCSV — charges variables', () => {
  beforeEach(() => {
    setState('currentPeriod', '2026-03');
    setState('salaries', { vous: 3000, conjointe: 2000 });
    setState('variableCharges', [
      { id: 'v1', description: 'Courses Carrefour', amount: 85.5, category: 'Alimentation', paidBy: 'vous', timestamp: 1700000000000 },
      { id: 'v2', description: 'Cinéma', amount: 24, category: 'Loisirs', paidBy: 'conjointe', timestamp: 1700000000001 }
    ]);
  });

  it('contient la section charges variables', () => {
    exportToCSV();
    expect(capturedCSV).toContain('CHARGES VARIABLES');
  });

  it('contient la description de chaque charge', () => {
    exportToCSV();
    expect(capturedCSV).toContain('Courses Carrefour');
    expect(capturedCSV).toContain('Cinéma');
  });

  it('contient les montants', () => {
    exportToCSV();
    expect(capturedCSV).toContain('85.5');
    expect(capturedCSV).toContain('24');
  });

  it('exclut les charges supprimées (deleted=true)', () => {
    setState('variableCharges', [
      { id: 'v1', description: 'Active', amount: 50, category: 'A', paidBy: 'vous', timestamp: 1700000000000 },
      { id: 'v2', description: 'Supprimée', amount: 99, category: 'A', paidBy: 'vous', timestamp: 1700000000000, deleted: true }
    ]);
    exportToCSV();
    expect(capturedCSV).toContain('Active');
    expect(capturedCSV).not.toContain('Supprimée');
  });

  it('sans charges → section présente mais vide', () => {
    setState('variableCharges', []);
    exportToCSV();
    expect(capturedCSV).toContain('CHARGES VARIABLES');
    expect(capturedCSV).toContain('Total charges variables');
  });
});

// ===== Contenu CSV — charges fixes =====
describe('exportToCSV — charges fixes', () => {
  beforeEach(() => {
    setState('currentPeriod', '2026-03');
    setState('salaries', { vous: 3000, conjointe: 2000 });
    setState('fixedCharges', [
      { id: 'f1', description: 'Loyer', amount: 1200, category: 'Logement', paidBy: 'vous', timestamp: 1700000000000 }
    ]);
  });

  it('contient la section charges fixes', () => {
    exportToCSV();
    expect(capturedCSV).toContain('CHARGES FIXES');
  });

  it('contient la description de la charge fixe', () => {
    exportToCSV();
    expect(capturedCSV).toContain('Loyer');
  });

  it('exclut les charges fixes supprimées', () => {
    setState('fixedCharges', [
      { id: 'f1', description: 'Loyer', amount: 1200, category: 'Log', paidBy: 'vous', timestamp: 1700000000000 },
      { id: 'f2', description: 'Ancienne charge', amount: 300, category: 'Log', paidBy: 'vous', timestamp: 1700000000000, deleted: true }
    ]);
    exportToCSV();
    expect(capturedCSV).toContain('Loyer');
    expect(capturedCSV).not.toContain('Ancienne charge');
  });
});

// ===== Contenu CSV — remboursements =====
describe('exportToCSV — remboursements', () => {
  beforeEach(() => {
    setState('currentPeriod', '2026-03');
    setState('salaries', { vous: 3000, conjointe: 2000 });
  });

  it('sans remboursement → pas de section remboursements', () => {
    setState('reimbursements', []);
    exportToCSV();
    expect(capturedCSV).not.toContain('REMBOURSEMENTS');
  });

  it('avec remboursements → section présente', () => {
    setState('reimbursements', [
      { id: 'r1', amount: 150, direction: 'vous-to-conjointe', timestamp: 1700000000000 }
    ]);
    exportToCSV();
    expect(capturedCSV).toContain('REMBOURSEMENTS');
  });

  it('direction vous-to-conjointe → "Vous" et "Conjointe" dans le CSV', () => {
    setState('reimbursements', [
      { id: 'r1', amount: 150, direction: 'vous-to-conjointe', timestamp: 1700000000000 }
    ]);
    exportToCSV();
    expect(capturedCSV).toContain('Vous');
    expect(capturedCSV).toContain('Conjointe');
  });

  it('direction conjointe-to-vous → "Conjointe" et "Vous" dans le CSV', () => {
    setState('reimbursements', [
      { id: 'r1', amount: 75, direction: 'conjointe-to-vous', timestamp: 1700000000000 }
    ]);
    exportToCSV();
    expect(capturedCSV).toContain('Conjointe');
    expect(capturedCSV).toContain('Vous');
  });

  it('direction inconnue → "?" dans le CSV', () => {
    // Volontairement hors des deux valeurs reconnues : ce test éprouve le
    // repli. Une substitution globale l'avait rendu vide de sens en lui
    // donnant une direction valide.
    setState('reimbursements', [
      { id: 'r1', amount: 50, direction: 'valeur-non-reconnue', timestamp: 1700000000000 }
    ]);
    exportToCSV();
    expect(capturedCSV).toContain('?');
  });

  it('remboursements supprimés exclus', () => {
    setState('reimbursements', [
      { id: 'r1', amount: 200, direction: 'vous-to-conjointe', timestamp: 1700000000000, deleted: true }
    ]);
    exportToCSV();
    expect(capturedCSV).not.toContain('REMBOURSEMENTS');
  });
});

// ===== Résultat de l'export =====
describe('exportToCSV — résultat', () => {
  it('export réussi → toast.success', () => {
    setState('currentPeriod', '2026-03');
    setState('salaries', { vous: 0, conjointe: 0 });
    exportToCSV();
    expect(toast.success).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

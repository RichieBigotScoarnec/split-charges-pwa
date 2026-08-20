// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocker toast et modal pour éviter effets de bord DOM non essentiels
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(),
  closeModal: vi.fn(),
  showConfirmModal: vi.fn()
}));

import { setState, resetState } from '../../public/js/state.js';
import { calculateSummary } from '../../public/js/modules/summary.js';

beforeEach(() => {
  resetState();
  // #summarySection requis par renderSummary() — ignoré si absent, pas d'erreur
});

// ===== Sans salaires =====
describe('calculateSummary — sans salaires', () => {
  it('retourne total=0 si salaires non renseignés', () => {
    const r = calculateSummary();
    expect(r.total).toBe(0);
  });

  it('retourne balance=0 si salaires non renseignés', () => {
    expect(calculateSummary().balance).toBe(0);
  });

  it('retourne yourShare=0 si salaires non renseignés', () => {
    expect(calculateSummary().yourShare).toBe(0);
  });

  it('retourne partnerShare=0 si salaires non renseignés', () => {
    expect(calculateSummary().partnerShare).toBe(0);
  });
});

// ===== Forme du retour =====
describe('calculateSummary — forme du retour', () => {
  it('retourne { total, yourShare, partnerShare, balance }', () => {
    setState('salaries', { vous: 2000, conjointe: 2000 });
    const r = calculateSummary();
    expect(r).toHaveProperty('total');
    expect(r).toHaveProperty('yourShare');
    expect(r).toHaveProperty('partnerShare');
    expect(r).toHaveProperty('balance');
  });

  it('total = somme de toutes les charges actives', () => {
    setState('salaries', { vous: 2000, conjointe: 2000 });
    setState('fixedCharges', [{ id: '1', amount: 300, paidBy: 'vous', description: 'A' }]);
    setState('variableCharges', [{ id: '2', amount: 200, paidBy: 'vous', description: 'B' }]);
    expect(calculateSummary().total).toBe(500);
  });
});

// ===== Mode prorata =====
describe('calculateSummary — mode prorata', () => {
  beforeEach(() => {
    setState('salaries', { vous: 3000, conjointe: 2000 }); // 60/40
    setState('shareMode', 'prorata');
  });

  it('yourShare = 60% du total', () => {
    setState('variableCharges', [{ id: '1', amount: 1000, paidBy: 'vous', description: 'Test' }]);
    expect(calculateSummary().yourShare).toBeCloseTo(600);
  });

  it('partnerShare = 40% du total', () => {
    setState('variableCharges', [{ id: '1', amount: 1000, paidBy: 'vous', description: 'Test' }]);
    expect(calculateSummary().partnerShare).toBeCloseTo(400);
  });

  it('yourShare + partnerShare = total', () => {
    setState('variableCharges', [{ id: '1', amount: 1234.56, paidBy: 'vous', description: 'Test' }]);
    const r = calculateSummary();
    expect(r.yourShare + r.partnerShare).toBeCloseTo(r.total, 5);
  });

  it('balance positive si vous avez trop payé (paidBy=vous, 1000€, dû 600€ → +400)', () => {
    setState('variableCharges', [{ id: '1', amount: 1000, paidBy: 'vous', description: 'Test' }]);
    expect(calculateSummary().balance).toBeCloseTo(400);
  });

  it('balance négative si conjointe a trop payé (paidBy=conjointe, 1000€, vous dû 600€ → -600)', () => {
    setState('variableCharges', [{ id: '1', amount: 1000, paidBy: 'conjointe', description: 'Test' }]);
    expect(calculateSummary().balance).toBeCloseTo(-600);
  });

  it('balance zéro si paiements exactement proportionnels', () => {
    setState('variableCharges', [
      { id: '1', amount: 600, paidBy: 'vous', description: 'A' },
      { id: '2', amount: 400, paidBy: 'conjointe', description: 'B' }
    ]);
    expect(calculateSummary().balance).toBeCloseTo(0, 5);
  });

  it('prend en compte les charges fixes ET variables', () => {
    setState('fixedCharges', [{ id: '1', amount: 500, paidBy: 'vous', description: 'Loyer' }]);
    setState('variableCharges', [{ id: '2', amount: 500, paidBy: 'vous', description: 'Courses' }]);
    const r = calculateSummary();
    expect(r.total).toBe(1000);
    expect(r.yourShare).toBeCloseTo(600);
  });

  it('exclut les charges supprimées (deleted=true)', () => {
    setState('variableCharges', [
      { id: '1', amount: 1000, paidBy: 'vous', description: 'A' },
      { id: '2', amount: 500, paidBy: 'vous', description: 'B', deleted: true }
    ]);
    expect(calculateSummary().total).toBe(1000);
  });

  it('charge payée en "joint" compte pour les deux au prorata', () => {
    // 3000/2000 → vous 60%, conjointe 40%
    // Charge joint 1000€ : vous payez 600, conjointe paie 400
    // Parts théoriques identiques → balance ≈ 0
    setState('variableCharges', [{ id: '1', amount: 1000, paidBy: 'joint', description: 'A' }]);
    expect(calculateSummary().balance).toBeCloseTo(0, 5);
  });

  it('salaires égaux → 50/50', () => {
    setState('salaries', { vous: 2000, conjointe: 2000 });
    setState('variableCharges', [{ id: '1', amount: 1000, paidBy: 'vous', description: 'Test' }]);
    const r = calculateSummary();
    expect(r.yourShare).toBeCloseTo(500);
    expect(r.partnerShare).toBeCloseTo(500);
  });
});

// ===== Mode 50-50 =====
describe('calculateSummary — mode 50-50', () => {
  beforeEach(() => {
    setState('salaries', { vous: 3000, conjointe: 2000 });
    setState('shareMode', '50-50');
  });

  it('chacun paie exactement la moitié', () => {
    setState('variableCharges', [{ id: '1', amount: 1000, paidBy: 'vous', description: 'Test' }]);
    const r = calculateSummary();
    expect(r.yourShare).toBeCloseTo(500);
    expect(r.partnerShare).toBeCloseTo(500);
  });

  it('balance=0 si charges partagées équitablement', () => {
    setState('variableCharges', [
      { id: '1', amount: 500, paidBy: 'vous', description: 'A' },
      { id: '2', amount: 500, paidBy: 'conjointe', description: 'B' }
    ]);
    expect(calculateSummary().balance).toBeCloseTo(0, 5);
  });

  it('balance = totalPayéParVous - moitié', () => {
    setState('variableCharges', [{ id: '1', amount: 800, paidBy: 'vous', description: 'A' }]);
    // Payé 800, dû 400 → balance = 400
    expect(calculateSummary().balance).toBeCloseTo(400);
  });
});

// ===== Mode custom =====
describe('calculateSummary — mode custom', () => {
  beforeEach(() => {
    setState('salaries', { vous: 3000, conjointe: 2000 });
    setState('shareMode', 'custom');
    setState('customPercents', { vous: 70, conjointe: 30 });
  });

  it('yourShare = 70% du total', () => {
    setState('variableCharges', [{ id: '1', amount: 1000, paidBy: 'vous', description: 'Test' }]);
    expect(calculateSummary().yourShare).toBeCloseTo(700);
  });

  it('partnerShare = 30% du total', () => {
    setState('variableCharges', [{ id: '1', amount: 1000, paidBy: 'vous', description: 'Test' }]);
    expect(calculateSummary().partnerShare).toBeCloseTo(300);
  });

  it('pourcentages non-standard (25/75)', () => {
    setState('customPercents', { vous: 25, conjointe: 75 });
    setState('variableCharges', [{ id: '1', amount: 400, paidBy: 'vous', description: 'A' }]);
    expect(calculateSummary().yourShare).toBeCloseTo(100);
    expect(calculateSummary().partnerShare).toBeCloseTo(300);
  });
});

// ===== splitOverride par charge =====
describe('calculateSummary — splitOverride par charge', () => {
  beforeEach(() => {
    setState('salaries', { vous: 3000, conjointe: 2000 }); // prorata global 60/40
    setState('shareMode', 'prorata');
  });

  it('splitOverride 50-50 remplace le prorata global', () => {
    setState('variableCharges', [{
      id: '1', amount: 1000, paidBy: 'vous', description: 'Test',
      splitOverride: { mode: '50-50' }
    }]);
    const r = calculateSummary();
    expect(r.yourShare).toBeCloseTo(500); // 50% et non 60%
    expect(r.partnerShare).toBeCloseTo(500);
  });

  it('splitOverride custom remplace le prorata global', () => {
    setState('variableCharges', [{
      id: '1', amount: 1000, paidBy: 'vous', description: 'Test',
      splitOverride: { mode: 'custom', vous: 80, conjointe: 20 }
    }]);
    const r = calculateSummary();
    expect(r.yourShare).toBeCloseTo(800);
    expect(r.partnerShare).toBeCloseTo(200);
  });

  it('splitOverride ne s\'applique qu\'à la charge concernée', () => {
    setState('variableCharges', [
      {
        id: '1', amount: 1000, paidBy: 'vous', description: 'A',
        splitOverride: { mode: '50-50' }
      },
      { id: '2', amount: 1000, paidBy: 'vous', description: 'B' } // prorata 60/40
    ]);
    const r = calculateSummary();
    // Charge 1 → 50% = 500 chacun
    // Charge 2 → 60% vous = 600, 40% conjointe = 400
    expect(r.yourShare).toBeCloseTo(1100); // 500 + 600
    expect(r.partnerShare).toBeCloseTo(900); // 500 + 400
  });
});

// ===== Remboursements =====
describe('calculateSummary — remboursements', () => {
  beforeEach(() => {
    setState('salaries', { vous: 1000, conjointe: 1000 }); // 50/50
    setState('shareMode', '50-50');
    // Vous payez 1000€, votre part = 500€ → solde de base = +500
    setState('variableCharges', [
      { id: '1', amount: 1000, paidBy: 'vous', description: 'Test' }
    ]);
  });

  it('remboursement conjointe→vous augmente le solde', () => {
    setState('reimbursements', [
      { id: 'r1', amount: 200, direction: 'conjointe-to-vous' }
    ]);
    expect(calculateSummary().balance).toBeCloseTo(700); // +500 + 200
  });

  it('remboursement vous→conjointe diminue le solde', () => {
    setState('reimbursements', [
      { id: 'r1', amount: 200, direction: 'vous-to-conjointe' }
    ]);
    expect(calculateSummary().balance).toBeCloseTo(300); // +500 - 200
  });

  it('plusieurs remboursements s\'accumulent', () => {
    setState('reimbursements', [
      { id: 'r1', amount: 100, direction: 'conjointe-to-vous' },
      { id: 'r2', amount: 50, direction: 'vous-to-conjointe' }
    ]);
    expect(calculateSummary().balance).toBeCloseTo(550); // +500 + 100 - 50
  });

  it('exclut les remboursements supprimés', () => {
    setState('reimbursements', [
      { id: 'r1', amount: 500, direction: 'conjointe-to-vous', deleted: true }
    ]);
    expect(calculateSummary().balance).toBeCloseTo(500); // remboursement ignoré
  });

  it('remboursement exact → solde zéro', () => {
    setState('reimbursements', [
      { id: 'r1', amount: 500, direction: 'vous-to-conjointe' }
    ]);
    expect(calculateSummary().balance).toBeCloseTo(0, 5);
  });
});

// ===== Cas limites =====
describe('calculateSummary — cas limites', () => {
  it('aucune charge → total=0, balance=0', () => {
    setState('salaries', { vous: 3000, conjointe: 2000 });
    const r = calculateSummary();
    expect(r.total).toBe(0);
    expect(r.balance).toBe(0);
  });

  it('fonctionne avec des montants décimaux', () => {
    setState('salaries', { vous: 3000, conjointe: 2000 });
    setState('shareMode', '50-50');
    setState('variableCharges', [{ id: '1', amount: 33.33, paidBy: 'vous', description: 'A' }]);
    const r = calculateSummary();
    expect(r.total).toBeCloseTo(33.33);
    expect(r.yourShare).toBeCloseTo(16.665);
  });

  it('charge fixe seule', () => {
    setState('salaries', { vous: 2000, conjointe: 2000 });
    setState('shareMode', '50-50');
    setState('fixedCharges', [{ id: '1', amount: 1000, paidBy: 'vous', description: 'Loyer' }]);
    const r = calculateSummary();
    expect(r.total).toBe(1000);
    expect(r.balance).toBeCloseTo(500);
  });
});
